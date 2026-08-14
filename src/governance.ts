import { Context, Service } from '@deepseek-ai/cordis'
import {
  transition,
  type LifecycleAction,
  type LifecycleResult,
  type LifecycleState,
} from './lifecycle.js'

/** Immutable snapshot of the governance core's current lifecycle state. */
export interface GovernanceSnapshot {
  /** The current builder-side lifecycle state. */
  readonly state: LifecycleState
  /** The last transition result (already immutable), or null before any transition. */
  readonly lastResult: LifecycleResult | null
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    governance: GovernanceService
  }
}

/**
 * The trusted state core for `dsh-governed-workflow`: a Cordis service holding
 * the builder-side lifecycle. Later authority, guard, and evidence plugins
 * depend on this service; V0.1 exposes only a snapshot and authorized
 * transitions — it is **not** a model-facing tool, and it implements no
 * shell/Git/path policy, no authority parsing, and no durable session events.
 */
export class GovernanceService extends Service {
  private currentState: LifecycleState = 'UNINITIALIZED'
  private lastResult: LifecycleResult | null = null

  /**
   * Create and register the service on `ctx.governance`. Registration is
   * performed by the Cordis `Service` base and is automatically undone when
   * the owning fiber unloads.
   * @param ctx - Cordis context that owns the service.
   */
  constructor(ctx: Context) {
    super(ctx, 'governance')
    // Load marker the DSH load smoke test observes.
    console.log('[governed-workflow] governance service loaded')
  }

  /** Return a freshly built, safely copied view of the current state. */
  snapshot(): GovernanceSnapshot {
    return { state: this.currentState, lastResult: this.lastResult }
  }

  /**
   * Apply an authorized lifecycle action through the pure state machine.
   * Invalid actions fail closed: the result reports the error and the current
   * state is left untouched. The returned result is immutable and suitable for
   * later durable evidence capture.
   * @param action - the lifecycle action to apply.
   * @returns the transition result.
   */
  apply(action: LifecycleAction): LifecycleResult {
    const result = transition(this.currentState, action)
    if (result.ok) {
      this.currentState = result.to
    }
    this.lastResult = result
    return result
  }
}

export default GovernanceService
