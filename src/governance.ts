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
    this.provider = new ConfigAuthorityProvider(config.authority)
    console.log('[governed-workflow] governance service loaded')

    // Observe the config-backed authority at load time (fail-closed when
    // unavailable/invalid). A valid authority advances to AUTHORITY_OBSERVED.
    const observed = this.observeAuthority()
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
   * Resolve authority through the provider abstraction and, only on success,
   * advance `UNINITIALIZED -> AUTHORITY_OBSERVED` and record the accepted
   * immutable snapshot.
   *
   * The provider's `resolve()` return is treated as untrusted runtime output:
   * exceptions are caught, the result envelope is normalized, a success
   * snapshot is re-validated through the canonical `validateAuthority()`, and
   * the admitted snapshot's `source` must match the provider's nonblank `kind`.
   * Any failure leaves both the lifecycle state and a previously accepted
   * snapshot unchanged (fail closed), and a subsequent observation can never
   * overwrite an already accepted snapshot.
   * @param provider - optional override; defaults to the configured provider.
   * @returns the normalized explicit success/failure result.
   */
  observeAuthority(provider?: AuthorityProvider): AuthorityResult {
    const resolved = provider ?? this.provider

    const kind = resolved.kind
    if (typeof kind !== 'string' || kind.trim() !== kind || kind.length === 0) {
      return authorityFailure('INVALID_AUTHORITY', 'authority provider kind must be a non-blank string')
    }

    let raw: unknown
    try {
      raw = resolved.resolve()
    } catch {
      return authorityFailure('INVALID_AUTHORITY', 'authority provider threw during resolve()')
    }

    const result = normalizeProviderResult(raw, kind)
    if (!result.ok) {
      return result
    }

    const transitionResult = transition(this.currentState, 'OBSERVE_AUTHORITY')
    if (transitionResult.ok) {
      this.currentState = transitionResult.to
      this.acceptedAuthoritySnapshot = result.snapshot
    }
    this.lastResult = transitionResult
    return result
  }
}

export default GovernanceService
