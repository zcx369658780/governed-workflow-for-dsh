import { describe, expect, it } from 'vitest'
import {
  LIFECYCLE_ACTIONS,
  LIFECYCLE_STATES,
  nextState,
  transition,
  type LifecycleAction,
  type LifecycleState,
} from '../src/lifecycle.js'

/** Every valid V0.1 transition, in the order of the lifecycle. */
const VALID: ReadonlyArray<[LifecycleState, LifecycleAction, LifecycleState]> = [
  ['UNINITIALIZED', 'OBSERVE_AUTHORITY', 'AUTHORITY_OBSERVED'],
  ['AUTHORITY_OBSERVED', 'ADMIT_TASK', 'TASK_ADMITTED'],
  ['TASK_ADMITTED', 'RUN', 'RUNNING'],
  ['RUNNING', 'BLOCK', 'BLOCKED'],
  ['RUNNING', 'COMPLETE', 'COMPLETED'],
  ['BLOCKED', 'SUBMIT_REVIEW', 'REVIEW_PENDING'],
  ['COMPLETED', 'SUBMIT_REVIEW', 'REVIEW_PENDING'],
]

describe('lifecycle state machine (pure)', () => {
  it('defines exactly the V0.1 states and excludes ACCEPTED', () => {
    expect([...LIFECYCLE_STATES]).toEqual([
      'UNINITIALIZED',
      'AUTHORITY_OBSERVED',
      'TASK_ADMITTED',
      'RUNNING',
      'BLOCKED',
      'COMPLETED',
      'REVIEW_PENDING',
    ])
    expect(LIFECYCLE_STATES).not.toContain('ACCEPTED')
  })

  it.each(VALID)('allows %s --%s--> %s', (from, action, to) => {
    expect(nextState(from, action)).toBe(to)
    const result = transition(from, action)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.to).toBe(to)
  })

  it('rejects every transition not in the table (fail-closed)', () => {
    for (const from of LIFECYCLE_STATES) {
      for (const action of LIFECYCLE_ACTIONS) {
        const allowed = VALID.some(([f, a]) => f === from && a === action)
        const result = transition(from, action)
        expect(result.ok).toBe(allowed)
        if (!result.ok) {
          expect(result.error.code).toBe('INVALID_TRANSITION')
          expect(result.error.from).toBe(from)
          expect(result.error.action).toBe(action)
          expect(nextState(from, action)).toBeUndefined()
        }
      }
    }
  })

  it('never offers ACCEPTED as a next state from any action', () => {
    for (const from of LIFECYCLE_STATES) {
      for (const action of LIFECYCLE_ACTIONS) {
        expect(nextState(from, action)).not.toBe('ACCEPTED')
      }
    }
  })

  it('only BLOCKED and COMPLETED may be submitted to REVIEW_PENDING', () => {
    expect(nextState('BLOCKED', 'SUBMIT_REVIEW')).toBe('REVIEW_PENDING')
    expect(nextState('COMPLETED', 'SUBMIT_REVIEW')).toBe('REVIEW_PENDING')
    for (const from of LIFECYCLE_STATES) {
      if (from !== 'BLOCKED' && from !== 'COMPLETED') {
        expect(nextState(from, 'SUBMIT_REVIEW')).toBeUndefined()
      }
    }
  })

  it('walks the full BLOCKED and COMPLETED paths to REVIEW_PENDING', () => {
    const paths: ReadonlyArray<readonly LifecycleAction[]> = [
      ['OBSERVE_AUTHORITY', 'ADMIT_TASK', 'RUN', 'BLOCK', 'SUBMIT_REVIEW'],
      ['OBSERVE_AUTHORITY', 'ADMIT_TASK', 'RUN', 'COMPLETE', 'SUBMIT_REVIEW'],
    ]
    for (const path of paths) {
      let state: LifecycleState = 'UNINITIALIZED'
      for (const action of path) {
        const result = transition(state, action)
        expect(result.ok).toBe(true)
        if (result.ok) state = result.to
      }
      expect(state).toBe('REVIEW_PENDING')
    }
  })

  it('returns frozen (immutable) results for evidence capture', () => {
    const ok = transition('UNINITIALIZED', 'OBSERVE_AUTHORITY')
    expect(Object.isFrozen(ok)).toBe(true)

    const bad = transition('UNINITIALIZED', 'RUN')
    expect(Object.isFrozen(bad)).toBe(true)
    if (!bad.ok) expect(Object.isFrozen(bad.error)).toBe(true)
  })
})
