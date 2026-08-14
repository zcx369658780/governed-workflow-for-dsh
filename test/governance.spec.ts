import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import GovernanceService from '../src/governance.js'
import type { LifecycleState } from '../src/lifecycle.js'

describe('GovernanceService (Cordis service)', () => {
  it('mounts on ctx.governance, starts UNINITIALIZED, and disposes', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber

    const service = ctx.governance
    expect(service).toBeInstanceOf(GovernanceService)
    expect(service.snapshot()).toEqual({ state: 'UNINITIALIZED', lastResult: null })

    await fiber.dispose()
    expect(ctx.get('governance')).toBeUndefined()
  })

  it('applies authorized transitions and fails closed on invalid ones', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber
    const service = ctx.governance

    const steps: ReadonlyArray<[Parameters<typeof service.apply>[0], LifecycleState]> = [
      ['OBSERVE_AUTHORITY', 'AUTHORITY_OBSERVED'],
      ['ADMIT_TASK', 'TASK_ADMITTED'],
      ['RUN', 'RUNNING'],
    ]
    for (const [action, expected] of steps) {
      const result = service.apply(action)
      expect(result.ok).toBe(true)
      expect(service.snapshot().state).toBe(expected)
    }

    // From RUNNING, SUBMIT_REVIEW is invalid: it must fail closed and leave
    // the prior state untouched.
    const before = service.snapshot().state
    const bad = service.apply('SUBMIT_REVIEW')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe('INVALID_TRANSITION')
    expect(service.snapshot().state).toBe(before)
    expect(service.snapshot().lastResult).toBe(bad)

    await fiber.dispose()
  })

  it('reaches REVIEW_PENDING from both BLOCKED and COMPLETED', async () => {
    const run = async (tail: 'BLOCK' | 'COMPLETE'): Promise<LifecycleState> => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance
      for (const action of ['OBSERVE_AUTHORITY', 'ADMIT_TASK', 'RUN', tail, 'SUBMIT_REVIEW'] as const) {
        const result = service.apply(action)
        expect(result.ok).toBe(true)
      }
      const state = service.snapshot().state
      await fiber.dispose()
      return state
    }

    expect(await run('BLOCK')).toBe('REVIEW_PENDING')
    expect(await run('COMPLETE')).toBe('REVIEW_PENDING')
  })

  it('fails closed when handed a prototype-chain member name as an action', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber
    const service = ctx.governance

    const bad = service.apply('constructor' as never)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe('INVALID_TRANSITION')
    // The review's failure mode (storing a function as the lifecycle state and
    // then throwing on the next transition) must not occur: state is untouched.
    expect(service.snapshot().state).toBe('UNINITIALIZED')
    expect(service.snapshot().lastResult).toBe(bad)

    // The service still transitions normally afterwards.
    expect(service.apply('OBSERVE_AUTHORITY').ok).toBe(true)
    expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')

    await fiber.dispose()
  })
})
