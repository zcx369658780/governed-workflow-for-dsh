import { Context, Service } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { AuthorityResult } from './authority.js'
import {
  buildAuthorityObservedPayload,
  buildAuthorityRejectedPayload,
  buildLifecycleTransitionPayload,
  projectEvidence,
  type GovernanceEvidenceEvent,
} from './evidence.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceEvidence: GovernanceEvidenceService
  }
}

/**
 * The governance evidence recorder: a typed, non-model-facing Cordis capability
 * that appends canonical governance facts to an **explicit** `Session` supplied
 * by the caller. It never guesses a global session and never broadcasts into
 * every live session.
 *
 * Recording is append-only; durability is a separate, explicit `flush()` that
 * delegates to the verified `ctx.sessions.flush(session)` checkpoint.
 */
export class GovernanceEvidenceService extends Service {
  static inject = ['sessions'] as const

  constructor(ctx: Context) {
    super(ctx, 'governanceEvidence')
    console.log('[governed-workflow] evidence service loaded')
  }

  /**
   * Record a successfully admitted canonical authority. The snapshot is
   * re-validated and detached, so a caller-owned mutable object can never be
   * recorded (and later mutation cannot affect appended evidence).
   */
  recordAuthorityObserved(session: Session, snapshot: unknown): SessionEvent<'governance/authority-observed'> {
    return session.append('governance/authority-observed', buildAuthorityObservedPayload(snapshot))
  }

  /** Record a structured failed authority observation (no rejected raw payload). */
  recordAuthorityRejected(session: Session, info: unknown): SessionEvent<'governance/authority-rejected'> {
    return session.append('governance/authority-rejected', buildAuthorityRejectedPayload(info))
  }

  /** Record one lifecycle transition attempt/result. */
  recordLifecycleTransition(session: Session, result: unknown): SessionEvent<'governance/lifecycle-transition'> {
    return session.append('governance/lifecycle-transition', buildLifecycleTransitionPayload(result))
  }

  /**
   * Translate an accepted `AuthorityResult` into the matching evidence record.
   * Convenience only: it does not change the result or lifecycle semantics and
   * never triggers a duplicate transition.
   */
  recordAuthorityResult(session: Session, result: AuthorityResult, providerKind?: string): GovernanceEvidenceEvent {
    if (result.ok) {
      return this.recordAuthorityObserved(session, result.snapshot)
    }
    return this.recordAuthorityRejected(session, {
      providerKind,
      code: result.error.code,
      field: result.error.field,
      message: result.error.message,
    })
  }

  /** Project this plugin's governance evidence from a session, in sequence order. */
  project(session: Session): GovernanceEvidenceEvent[] {
    return projectEvidence(session.events)
  }

  /**
   * Request an explicit durability checkpoint for `session` through the verified
   * DSH flush API. Returns whether a durability listener participated; with no
   * persistence backend installed this resolves `false` (no fake guarantee).
   */
  flush(session: Session): Promise<boolean> {
    return this.ctx.sessions.flush(session)
  }
}

export default GovernanceEvidenceService
