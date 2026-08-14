import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import GovernanceService from '../src/governance.js'
import { validateAuthority, type AuthorityProvider, type AuthorityResult } from '../src/authority.js'
import type { LifecycleState } from '../src/lifecycle.js'

const VALID_AUTHORITY = {
  taskId: 'issue-5',
  source: 'config',
  repository: 'zcx369658780/governed-workflow-for-dsh',
  baselineRef: 'main',
  baselineSha: '93654a9ad4e02fa1f19eee270b5d8519f29f6e1c',
}

/** A minimal offline provider over raw input. */
function testProvider(raw: unknown, kind = 'config'): AuthorityProvider {
  return { kind, resolve: () => validateAuthority(raw) }
}

/** A provider whose `resolve()` returns arbitrary untrusted runtime output. */
function rawProvider(kind: string, resolve: () => unknown): AuthorityProvider {
  return { kind, resolve: resolve as () => AuthorityResult }
}

describe('GovernanceService (Cordis service)', () => {
  it('mounts on ctx.governance, starts UNINITIALIZED, and disposes', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber

    const service = ctx.governance
    expect(service).toBeInstanceOf(GovernanceService)
    expect(service.snapshot()).toEqual({ state: 'UNINITIALIZED', lastResult: null, authority: null })

    await fiber.dispose()
    expect(ctx.get('governance')).toBeUndefined()
  })

  it('applies authorized transitions and fails closed on invalid ones', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber
    const service = ctx.governance

    // Reach AUTHORITY_OBSERVED via authority observation, then continue.
    expect(service.observeAuthority(testProvider(VALID_AUTHORITY)).ok).toBe(true)
    expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')

    const steps: ReadonlyArray<[Parameters<typeof service.apply>[0], LifecycleState]> = [
      ['ADMIT_TASK', 'TASK_ADMITTED'],
      ['RUN', 'RUNNING'],
    ]
    for (const [action, expected] of steps) {
      expect(service.apply(action).ok).toBe(true)
      expect(service.snapshot().state).toBe(expected)
    }

    // From RUNNING, SUBMIT_REVIEW is invalid: fail closed, state unchanged.
    const before = service.snapshot().state
    const bad = service.apply('SUBMIT_REVIEW')
    expect(bad.ok).toBe(false)
    expect(service.snapshot().state).toBe(before)

    await fiber.dispose()
  })

  it('reaches REVIEW_PENDING from both BLOCKED and COMPLETED', async () => {
    const run = async (tail: 'BLOCK' | 'COMPLETE'): Promise<LifecycleState> => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance
      expect(service.observeAuthority(testProvider(VALID_AUTHORITY)).ok).toBe(true)
      for (const action of ['ADMIT_TASK', 'RUN', tail, 'SUBMIT_REVIEW'] as const) {
        expect(service.apply(action).ok).toBe(true)
      }
      const state = service.snapshot().state
      await fiber.dispose()
      return state
    }

    expect(await run('BLOCK')).toBe('REVIEW_PENDING')
    expect(await run('COMPLETE')).toBe('REVIEW_PENDING')
  })

  it('rejects raw apply("OBSERVE_AUTHORITY") and keeps observeAuthority() as the only path', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber
    const service = ctx.governance

    // Raw transition is rejected: state and authority stay put.
    const bad = service.apply('OBSERVE_AUTHORITY')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.message).toContain('observeAuthority')
    expect(service.snapshot().state).toBe('UNINITIALIZED')
    expect(service.acceptedAuthority()).toBeNull()

    // The authority-aware path still works afterwards.
    expect(service.observeAuthority(testProvider(VALID_AUTHORITY)).ok).toBe(true)
    expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')
    expect(service.acceptedAuthority()?.taskId).toBe('issue-5')

    await fiber.dispose()
  })

  it('fails closed when handed a prototype-chain member name as an action', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber
    const service = ctx.governance

    const bad = service.apply('constructor' as never)
    expect(bad.ok).toBe(false)
    expect(service.snapshot().state).toBe('UNINITIALIZED')

    await fiber.dispose()
  })

  it('advances to AUTHORITY_OBSERVED only on successful authority resolution', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber
    const service = ctx.governance

    // Failure leaves the lifecycle unchanged.
    expect(service.observeAuthority(testProvider(undefined)).ok).toBe(false)
    expect(service.snapshot().state).toBe('UNINITIALIZED')
    expect(service.acceptedAuthority()).toBeNull()

    // Success advances and records the snapshot.
    const ok = service.observeAuthority(testProvider(VALID_AUTHORITY))
    expect(ok.ok).toBe(true)
    expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')
    expect(service.acceptedAuthority()?.taskId).toBe('issue-5')

    await fiber.dispose()
  })

  it('a failed subsequent observation cannot overwrite an accepted authority', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService)
    await fiber
    const service = ctx.governance

    expect(service.observeAuthority(testProvider(VALID_AUTHORITY)).ok).toBe(true)
    const accepted = service.acceptedAuthority()

    // A later failing observation leaves both state and snapshot untouched.
    expect(service.observeAuthority(testProvider({ taskId: '' })).ok).toBe(false)
    expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')
    expect(service.acceptedAuthority()).toBe(accepted)

    await fiber.dispose()
  })

  it('accepted authority snapshot is deeply immutable and safely copied', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(GovernanceService, { authority: VALID_AUTHORITY })
    await fiber
    const service = ctx.governance

    expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')
    const snapshot = service.acceptedAuthority()!
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.protectedBranches)).toBe(true)
    // snapshot() builds a fresh wrapper each call.
    expect(service.snapshot()).not.toBe(service.snapshot())

    await fiber.dispose()
  })

  it('auto-observes config-backed authority: valid advances, invalid stays UNINITIALIZED', async () => {
    const validCtx = new Context()
    const validFiber = validCtx.plugin(GovernanceService, { authority: VALID_AUTHORITY })
    await validFiber
    expect(validCtx.governance.snapshot().state).toBe('AUTHORITY_OBSERVED')
    expect(validCtx.governance.acceptedAuthority()?.repository).toBe('zcx369658780/governed-workflow-for-dsh')
    await validFiber.dispose()

    const invalidCtx = new Context()
    const invalidFiber = invalidCtx.plugin(GovernanceService, { authority: { taskId: '' } })
    await invalidFiber
    expect(invalidCtx.governance.snapshot().state).toBe('UNINITIALIZED')
    expect(invalidCtx.governance.acceptedAuthority()).toBeNull()
    await invalidFiber.dispose()
  })

  describe('provider-output trust boundary', () => {
    it('rejects ok:true with a malformed snapshot; state remains UNINITIALIZED', async () => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance

      const provider = rawProvider('config', () => ({ ok: true, snapshot: { taskId: '' } }))
      const result = service.observeAuthority(provider)
      expect(result.ok).toBe(false)
      expect(service.snapshot().state).toBe('UNINITIALIZED')
      expect(service.acceptedAuthority()).toBeNull()

      await fiber.dispose()
    })

    it('accepts a valid-but-mutable snapshot only as a separately validated frozen copy', async () => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance

      const mutable = { taskId: 'issue-5', source: 'config', allowedPaths: ['src'] }
      const provider = rawProvider('config', () => ({ ok: true, snapshot: mutable }))
      expect(service.observeAuthority(provider).ok).toBe(true)
      expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')

      const accepted = service.acceptedAuthority()!
      expect(accepted).not.toBe(mutable)
      expect(Object.isFrozen(accepted)).toBe(true)
      expect(Object.isFrozen(accepted.allowedPaths)).toBe(true)

      // Mutating the provider-owned object cannot affect the accepted snapshot.
      mutable.taskId = 'mutated'
      mutable.allowedPaths.push('evil')
      expect(service.acceptedAuthority()?.taskId).toBe('issue-5')
      expect([...(service.acceptedAuthority()?.allowedPaths ?? [])]).toEqual(['src'])

      await fiber.dispose()
    })

    it('fails closed on a malformed result envelope without throwing', async () => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance

      for (const envelope of [null, 'x', 42, {}, { ok: true }, { ok: 'yes' }, { ok: false }]) {
        const provider = rawProvider('config', () => envelope)
        expect(service.observeAuthority(provider).ok).toBe(false)
        expect(service.snapshot().state).toBe('UNINITIALIZED')
      }

      await fiber.dispose()
    })

    it('fails closed when the provider throws', async () => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance

      const provider = rawProvider('config', () => { throw new Error('boom') })
      expect(service.observeAuthority(provider).ok).toBe(false)
      expect(service.snapshot().state).toBe('UNINITIALIZED')

      await fiber.dispose()
    })

    it('fails closed on a source/kind provenance mismatch', async () => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance

      const provider = testProvider(VALID_AUTHORITY, 'github-issue') // snapshot source "config" != kind
      const result = service.observeAuthority(provider)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.field).toBe('source')
      expect(service.snapshot().state).toBe('UNINITIALIZED')

      await fiber.dispose()
    })

    it('after acceptance, every failure form leaves state and snapshot unchanged', async () => {
      const ctx = new Context()
      const fiber = ctx.plugin(GovernanceService)
      await fiber
      const service = ctx.governance

      expect(service.observeAuthority(testProvider(VALID_AUTHORITY)).ok).toBe(true)
      const accepted = service.acceptedAuthority()

      const badProviders: AuthorityProvider[] = [
        rawProvider('config', () => ({ ok: true, snapshot: { taskId: '' } })),
        rawProvider('config', () => null),
        rawProvider('config', () => { throw new Error('boom') }),
        testProvider(VALID_AUTHORITY, 'github-issue'),
      ]
      for (const provider of badProviders) {
        expect(service.observeAuthority(provider).ok).toBe(false)
        expect(service.snapshot().state).toBe('AUTHORITY_OBSERVED')
        expect(service.acceptedAuthority()).toBe(accepted)
      }

      await fiber.dispose()
    })
  })
})
