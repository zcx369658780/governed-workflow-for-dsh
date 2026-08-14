import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import {
  INVALID_TRANSITION,
  transition,
  type LifecycleAction,
  type LifecycleResult,
  type LifecycleState,
} from './lifecycle.js'
import {
  authorityFailure,
  normalizeProviderResult,
  type AuthorityProvider,
  type AuthorityResolveOptions,
  type AuthorityResult,
  type AuthoritySnapshot,
} from './authority.js'
import { ConfigAuthorityProvider } from './config-provider.js'

/** Plugin configuration for the governance service. */
export interface GovernanceConfig {
  /** Raw authority snapshot config for the reference provider (runtime-validated). */
  authority?: unknown
}

/** Immutable snapshot of the governance core's current state. */
export interface GovernanceSnapshot {
  /** The current builder-side lifecycle state. */
  readonly state: LifecycleState
  /** The last lifecycle transition result (immutable), or null before any transition. */
  readonly lastResult: LifecycleResult | null
  /** The accepted authority snapshot (immutable), or null before a successful observation. */
  readonly authority: AuthoritySnapshot | null
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    governance: GovernanceService
  }
}

/** Whether an optional signal is already aborted (fresh read, no cross-await narrowing). */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted
}

/**
 * Race a provider result against an abort signal, so a provider that ignores
 * the signal and never settles cannot hang the observation. The abort listener
 * is registered `{ once: true }` and removed on provider settlement, so no
 * listener leaks. Rejection on abort is indistinguishable from a provider
 * rejection at this layer; the caller disambiguates with `isAborted(signal)`.
 */
function resolveWithAbort<T>(promise: T | PromiseLike<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) {
    return Promise.resolve(promise)
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new Error('authority observation aborted'))
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/**
 * The trusted state core for `dsh-governed-workflow`: a Cordis service holding
 * the builder-side lifecycle and the accepted authority. V0.2 adds the
 * authority capability — a provider-neutral contract plus a config-backed
 * reference provider — while still enforcing nothing on tool calls.
 */
export class GovernanceService extends Service {
  static Config: Schema<GovernanceConfig> = z.object({
    authority: z.any(),
  })

  private currentState: LifecycleState = 'UNINITIALIZED'
  private lastResult: LifecycleResult | null = null
  private acceptedAuthoritySnapshot: AuthoritySnapshot | null = null
  private readonly provider: AuthorityProvider

  /**
   * Create and register the service on `ctx.governance`. Registration is
   * performed by the Cordis `Service` base and is automatically undone when
   * the owning fiber unloads.
   * @param ctx - Cordis context that owns the service.
   * @param config - validated plugin configuration.
   */
  constructor(ctx: Context, config: GovernanceConfig = {}) {
    super(ctx, 'governance')
    const configProvider = new ConfigAuthorityProvider(config.authority)
    this.provider = configProvider
    console.log('[governed-workflow] governance service loaded')

    // Deterministic sync bootstrap: the built-in config provider resolves
    // synchronously, so a valid config authority is admitted before any
    // downstream mutation guard reads it. No detached/background promise.
    const observed = this.admitResolvedAuthority(configProvider.kind, configProvider.resolve())
    if (observed.ok) {
      console.log(`[governed-workflow] authority observed: ${observed.snapshot.taskId}`)
    } else {
      console.log(`[governed-workflow] authority ${observed.error.code}`)
    }
  }

  /** Return a freshly built, safely copied view of the current state. */
  snapshot(): GovernanceSnapshot {
    return { state: this.currentState, lastResult: this.lastResult, authority: this.acceptedAuthoritySnapshot }
  }

  /** The accepted authority snapshot, or null before a successful observation. */
  acceptedAuthority(): AuthoritySnapshot | null {
    return this.acceptedAuthoritySnapshot
  }

  /**
   * Apply an authorized lifecycle action through the pure state machine.
   * Invalid actions fail closed: the result reports the error and the current
   * state is left untouched.
   * @param action - the lifecycle action to apply.
   * @returns the transition result.
   */
  apply(action: LifecycleAction): LifecycleResult {
    if (action === 'OBSERVE_AUTHORITY') {
      // Authority observation is authority-aware: reaching AUTHORITY_OBSERVED
      // requires a validated authority, which only observeAuthority() provides.
      // Reject the raw transition so the lifecycle cannot advance while
      // acceptedAuthority() stays null.
      const failure: LifecycleResult = Object.freeze({
        ok: false as const,
        from: this.currentState,
        action,
        error: Object.freeze({
          code: INVALID_TRANSITION,
          from: this.currentState,
          action,
          message: 'OBSERVE_AUTHORITY requires a validated authority — use observeAuthority()',
        }),
      })
      this.lastResult = failure
      return failure
    }

    const result = transition(this.currentState, action)
    if (result.ok) {
      this.currentState = result.to
    }
    this.lastResult = result
    return result
  }

  /**
   * Shared canonical admission: normalize/revalidate a resolved provider result
   * and, on success, admit exactly one frozen snapshot through the
   * `OBSERVE_AUTHORITY` boundary. When the lifecycle has already left
   * `UNINITIALIZED` (authority already accepted), a later observation returns a
   * truthful failure and never overwrites the winner.
   */
  private admitResolvedAuthority(providerKind: string, raw: unknown): AuthorityResult {
    const result = normalizeProviderResult(raw, providerKind)
    if (!result.ok) {
      return result
    }

    const transitionResult = transition(this.currentState, 'OBSERVE_AUTHORITY')
    if (!transitionResult.ok) {
      this.lastResult = transitionResult
      return authorityFailure('INVALID_AUTHORITY', 'authority is already accepted; a later observation cannot overwrite it')
    }
    this.currentState = transitionResult.to
    this.acceptedAuthoritySnapshot = result.snapshot
    this.lastResult = transitionResult
    return result
  }

  /**
   * Awaitable, cancellable authority observation. Resolves the provider
   * synchronously or asynchronously, catches sync throws and async rejections,
   * re-checks cancellation after the await and before admission, and admits the
   * canonical frozen snapshot through the single shared admission boundary.
   *
   * Cancellation is fail-closed: an aborted observation never admits authority
   * and never overwrites an already accepted snapshot. A provider that ignores
   * the signal still cannot unlock authority after the caller aborts.
   * @param provider - optional override; defaults to the configured provider.
   * @param options - optional `signal` for cancellation.
   * @returns the normalized explicit success/failure result.
   */
  async observeAuthority(provider?: AuthorityProvider, options: AuthorityResolveOptions = {}): Promise<AuthorityResult> {
    const resolved = provider ?? this.provider

    const kind = resolved.kind
    if (typeof kind !== 'string' || kind.trim() !== kind || kind.length === 0) {
      return authorityFailure('INVALID_AUTHORITY', 'authority provider kind must be a non-blank string')
    }

    const signal = options.signal
    if (isAborted(signal)) {
      return authorityFailure('INVALID_AUTHORITY', 'authority observation was aborted before it began')
    }

    // Do not invoke the provider once authority is already accepted.
    if (this.acceptedAuthoritySnapshot !== null) {
      return authorityFailure('INVALID_AUTHORITY', 'authority is already accepted; observation was not started')
    }

    let raw: unknown
    try {
      raw = await resolveWithAbort(resolved.resolve(options), signal)
    } catch {
      if (isAborted(signal)) {
        return authorityFailure('INVALID_AUTHORITY', 'authority observation was aborted during resolve()')
      }
      return authorityFailure('INVALID_AUTHORITY', 'authority provider threw or rejected during resolve()')
    }

    // Re-check cancellation after the await, before admission.
    if (isAborted(signal)) {
      return authorityFailure('INVALID_AUTHORITY', 'authority observation was aborted before admission')
    }

    return this.admitResolvedAuthority(kind, raw)
  }
}

export default GovernanceService
