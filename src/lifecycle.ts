/**
 * Pure, Cordis-independent builder-side lifecycle state machine.
 *
 * This module carries no DSH/Cordis/GitHub imports so it can be unit-tested
 * without booting anything, and so the transition logic stays fully separable
 * from service plumbing.
 *
 * V0.1 builder lifecycle:
 *
 *   UNINITIALIZED
 *     -> AUTHORITY_OBSERVED
 *     -> TASK_ADMITTED
 *     -> RUNNING
 *     -> BLOCKED | COMPLETED
 *     -> REVIEW_PENDING
 *
 * There is deliberately **no** builder-authorized `ACCEPTED` state or
 * transition: acceptance belongs to the reviewer/owner, never to the builder.
 * `BLOCKED` is a legitimate terminal builder outcome (it may be submitted to
 * review), not an exception that authorizes continuation.
 */

export const LIFECYCLE_STATES = [
  'UNINITIALIZED',
  'AUTHORITY_OBSERVED',
  'TASK_ADMITTED',
  'RUNNING',
  'BLOCKED',
  'COMPLETED',
  'REVIEW_PENDING',
] as const

/** A builder-side lifecycle state. */
export type LifecycleState = (typeof LIFECYCLE_STATES)[number]

export const LIFECYCLE_ACTIONS = [
  'OBSERVE_AUTHORITY',
  'ADMIT_TASK',
  'RUN',
  'BLOCK',
  'COMPLETE',
  'SUBMIT_REVIEW',
] as const

/** An explicit, deterministic lifecycle action a builder may apply. */
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number]

/** Stable machine-readable code for a rejected transition. */
export const INVALID_TRANSITION = 'INVALID_TRANSITION' as const

/** Structured failure reason, shaped for later durable evidence capture. */
export interface TransitionFailure {
  readonly code: typeof INVALID_TRANSITION
  readonly from: LifecycleState
  readonly action: LifecycleAction
  readonly message: string
}

/** The result of attempting a transition. Always immutable (frozen). */
export type LifecycleResult =
  | {
      readonly ok: true
      readonly from: LifecycleState
      readonly action: LifecycleAction
      readonly to: LifecycleState
    }
  | {
      readonly ok: false
      readonly from: LifecycleState
      readonly action: LifecycleAction
      readonly error: TransitionFailure
    }

/**
 * The single source of truth for the V0.1 transition table. An absent entry is
 * an invalid (fail-closed) transition.
 */
const TRANSITIONS: Readonly<Record<LifecycleState, Readonly<Partial<Record<LifecycleAction, LifecycleState>>>>> = {
  UNINITIALIZED: { OBSERVE_AUTHORITY: 'AUTHORITY_OBSERVED' },
  AUTHORITY_OBSERVED: { ADMIT_TASK: 'TASK_ADMITTED' },
  TASK_ADMITTED: { RUN: 'RUNNING' },
  RUNNING: { BLOCK: 'BLOCKED', COMPLETE: 'COMPLETED' },
  BLOCKED: { SUBMIT_REVIEW: 'REVIEW_PENDING' },
  COMPLETED: { SUBMIT_REVIEW: 'REVIEW_PENDING' },
  REVIEW_PENDING: {},
}

/**
 * The next state for `action` from `from`, or `undefined` when the transition
 * is not allowed. Pure: no mutation, no I/O.
 */
export function nextState(from: LifecycleState, action: LifecycleAction): LifecycleState | undefined {
  return TRANSITIONS[from][action]
}

/**
 * Attempt a deterministic, fail-closed transition. Returns an immutable result:
 * on success it carries `to`; on failure it carries a structured error and
 * leaves any caller-held state untouched (it never mutates external state).
 */
export function transition(from: LifecycleState, action: LifecycleAction): LifecycleResult {
  const to = nextState(from, action)
  if (to !== undefined) {
    return Object.freeze({ ok: true as const, from, action, to })
  }
  return Object.freeze({
    ok: false as const,
    from,
    action,
    error: Object.freeze({
      code: INVALID_TRANSITION,
      from,
      action,
      message: `invalid transition: cannot apply ${action} from ${from}`,
    }),
  })
}
