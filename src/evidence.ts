import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { validateAuthority, type AuthorityErrorCode, type AuthoritySnapshot } from './authority.js'
import { LIFECYCLE_ACTIONS, LIFECYCLE_STATES, type LifecycleAction, type LifecycleState } from './lifecycle.js'

/**
 * Governance evidence vocabulary (V0.3). Merge-extensible `SessionEventMap`
 * members, all non-surface (log-only) and append-only. Payloads contain only
 * canonical/sanitized data — never raw provider output, secrets, or caller-owned
 * mutable objects.
 *
 * `append` does not accept an `ignorable` flag in the current DSH, so these
 * events are unmarked (required). See the compatibility doc for the
 * reconstruction implication.
 */

/** Evidence schema version stamped into every governance event. */
export const EVIDENCE_SCHEMA_VERSION = 1 as const

/** A successfully admitted canonical authority. */
export interface AuthorityObservedEventData {
  readonly schemaVersion: typeof EVIDENCE_SCHEMA_VERSION
  readonly authority: AuthoritySnapshot
}

/** A structured failed authority observation (no rejected raw payload). */
export interface AuthorityRejectedEventData {
  readonly schemaVersion: typeof EVIDENCE_SCHEMA_VERSION
  readonly providerKind?: string
  readonly code: AuthorityErrorCode
  readonly field?: string
  readonly message: string
}

/** One lifecycle transition attempt/result. */
export interface LifecycleTransitionEventData {
  readonly schemaVersion: typeof EVIDENCE_SCHEMA_VERSION
  readonly from: LifecycleState
  readonly action: LifecycleAction
  readonly ok: boolean
  readonly to?: LifecycleState
  readonly error?: { readonly code: string; readonly message: string }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'governance/authority-observed': AuthorityObservedEventData
    'governance/authority-rejected': AuthorityRejectedEventData
    'governance/lifecycle-transition': LifecycleTransitionEventData
  }
}

/** The governance evidence event types. */
export type GovernanceEventType =
  | 'governance/authority-observed'
  | 'governance/authority-rejected'
  | 'governance/lifecycle-transition'

/** A session event narrowed to the governance evidence vocabulary. */
export type GovernanceEvidenceEvent = SessionEvent<GovernanceEventType>

/** Upper bound for human-readable failure messages recorded as evidence. */
const MAX_MESSAGE_LENGTH = 512

/** A non-empty string with no surrounding whitespace. */
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

/** A plain record whose prototype is `Object.prototype` or `null`. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Bound a failure message, truncating overlong strings. */
function boundMessage(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message
}

function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === 'string' && (LIFECYCLE_STATES as readonly string[]).includes(value)
}

function isLifecycleAction(value: unknown): value is LifecycleAction {
  return typeof value === 'string' && (LIFECYCLE_ACTIONS as readonly string[]).includes(value)
}

/**
 * Build a canonical `governance/authority-observed` payload, re-validating the
 * snapshot through the canonical validator so only a detached, frozen
 * `AuthoritySnapshot` is recorded (never a caller-owned mutable object).
 * Throws on invalid input — the caller must not have appended anything.
 */
export function buildAuthorityObservedPayload(input: unknown): AuthorityObservedEventData {
  const result = validateAuthority(input)
  if (!result.ok) {
    throw new Error(`governance evidence: invalid authority snapshot: ${result.error.message}`)
  }
  return Object.freeze({ schemaVersion: EVIDENCE_SCHEMA_VERSION, authority: result.snapshot })
}

/**
 * Build a sanitized `governance/authority-rejected` payload. Only canonical
 * fields are kept (bounded message); no rejected raw object is recorded.
 * Throws on invalid input.
 */
export function buildAuthorityRejectedPayload(input: unknown): AuthorityRejectedEventData {
  if (!isPlainRecord(input)) {
    throw new Error('governance evidence: authority-rejected input must be a plain object')
  }
  const code = input.code
  if (code !== 'AUTHORITY_UNAVAILABLE' && code !== 'INVALID_AUTHORITY') {
    throw new Error('governance evidence: authority-rejected requires a canonical authority error code')
  }
  const message = input.message
  if (!isNonBlankString(message)) {
    throw new Error('governance evidence: authority-rejected requires a non-blank message')
  }
  const providerKind = input.providerKind
  if (providerKind !== undefined && !isNonBlankString(providerKind)) {
    throw new Error('governance evidence: authority-rejected providerKind must be a non-blank string')
  }
  const field = input.field
  if (field !== undefined && !isNonBlankString(field)) {
    throw new Error('governance evidence: authority-rejected field must be a non-blank string')
  }
  return Object.freeze({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ...(providerKind !== undefined ? { providerKind } : {}),
    code,
    ...(field !== undefined ? { field } : {}),
    message: boundMessage(message),
  })
}

/**
 * Build a canonical `governance/lifecycle-transition` payload. Throws on
 * malformed/untyped runtime input so a bad value can never corrupt the log.
 */
export function buildLifecycleTransitionPayload(input: unknown): LifecycleTransitionEventData {
  if (!isPlainRecord(input)) {
    throw new Error('governance evidence: lifecycle-transition input must be a plain object')
  }
  const from = input.from
  if (!isLifecycleState(from)) {
    throw new Error('governance evidence: lifecycle-transition requires a valid from state')
  }
  const action = input.action
  if (!isLifecycleAction(action)) {
    throw new Error('governance evidence: lifecycle-transition requires a valid action')
  }
  const ok = input.ok
  if (typeof ok !== 'boolean') {
    throw new Error('governance evidence: lifecycle-transition requires a boolean ok')
  }

  if (ok) {
    const to = input.to
    if (!isLifecycleState(to)) {
      throw new Error('governance evidence: lifecycle-transition success requires a valid to state')
    }
    return Object.freeze({ schemaVersion: EVIDENCE_SCHEMA_VERSION, from, action, ok: true as const, to })
  }

  const error = input.error
  if (!isPlainRecord(error) || !isNonBlankString(error.code) || !isNonBlankString(error.message)) {
    throw new Error('governance evidence: lifecycle-transition failure requires non-blank error code and message')
  }
  return Object.freeze({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    from,
    action,
    ok: false as const,
    error: Object.freeze({ code: error.code, message: boundMessage(error.message) }),
  })
}

function isAuthorityObservedData(value: unknown): value is AuthorityObservedEventData {
  if (!isPlainRecord(value) || value.schemaVersion !== EVIDENCE_SCHEMA_VERSION) return false
  return validateAuthority(value.authority).ok
}

function isAuthorityRejectedData(value: unknown): value is AuthorityRejectedEventData {
  if (!isPlainRecord(value) || value.schemaVersion !== EVIDENCE_SCHEMA_VERSION) return false
  const code = value.code
  if (code !== 'AUTHORITY_UNAVAILABLE' && code !== 'INVALID_AUTHORITY') return false
  if (!isNonBlankString(value.message)) return false
  if (value.providerKind !== undefined && !isNonBlankString(value.providerKind)) return false
  if (value.field !== undefined && !isNonBlankString(value.field)) return false
  return true
}

function isLifecycleTransitionData(value: unknown): value is LifecycleTransitionEventData {
  if (!isPlainRecord(value) || value.schemaVersion !== EVIDENCE_SCHEMA_VERSION) return false
  if (!isLifecycleState(value.from) || !isLifecycleAction(value.action)) return false
  if (value.ok === true) return isLifecycleState(value.to)
  if (value.ok === false) {
    return isPlainRecord(value.error) && isNonBlankString(value.error.code) && isNonBlankString(value.error.message)
  }
  return false
}

/** Narrow a session event to a well-formed governance evidence event. */
export function isGovernanceEvidenceEvent(event: SessionEvent): event is GovernanceEvidenceEvent {
  switch (event.type) {
    case 'governance/authority-observed':
      return isAuthorityObservedData(event.data)
    case 'governance/authority-rejected':
      return isAuthorityRejectedData(event.data)
    case 'governance/lifecycle-transition':
      return isLifecycleTransitionData(event.data)
    default:
      return false
  }
}

/**
 * Project a session's raw append-only events down to governance evidence in
 * sequence order, ignoring unrelated events. A recognized governance event
 * with malformed data fails closed (throws) rather than fabricating facts.
 */
export function projectEvidence(events: readonly SessionEvent[]): GovernanceEvidenceEvent[] {
  const result: GovernanceEvidenceEvent[] = []
  for (const event of events) {
    if (!(typeof event.type === 'string' && event.type.startsWith('governance/'))) continue
    if (!isGovernanceEvidenceEvent(event)) {
      throw new Error(`governance evidence: malformed ${event.type} event at seq ${event.seq}`)
    }
    result.push(event)
  }
  return result
}
