import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import GovernanceEvidenceService from '../src/evidence-service.js'

const VALID_AUTHORITY = { taskId: 'issue-7', source: 'config', baselineRef: 'main' }

async function setup(): Promise<{ ctx: Context; session: ReturnType<SessionStore['create']>; service: GovernanceEvidenceService }> {
  const ctx = new Context()
  const storeFiber = ctx.plugin(SessionStore)
  const evidenceFiber = ctx.plugin(GovernanceEvidenceService)
  await storeFiber
  await evidenceFiber
  const session = ctx.sessions.create()
  return { ctx, session, service: ctx.governanceEvidence }
}

describe('GovernanceEvidenceService (Cordis service)', () => {
  it('mounts on ctx.governanceEvidence and records non-surface authority evidence', async () => {
    const { session, service } = await setup()
    expect(service).toBeInstanceOf(GovernanceEvidenceService)

    const event = service.recordAuthorityObserved(session, VALID_AUTHORITY)
    expect(event.type).toBe('governance/authority-observed')
    expect(event.data.schemaVersion).toBe(1)
    expect(event.data.authority.taskId).toBe('issue-7')
    expect(session.events).toHaveLength(1)

    // Evidence-only appends add no model-visible message.
    expect(session.deriveMessages()).toEqual([])
  })

  it('records rejected authority evidence without the rejected raw payload', async () => {
    const { session, service } = await setup()
    const event = service.recordAuthorityRejected(session, { providerKind: 'config', code: 'INVALID_AUTHORITY', field: 'taskId', message: 'bad' })
    expect(event.type).toBe('governance/authority-rejected')
    expect(event.data).toMatchObject({ providerKind: 'config', code: 'INVALID_AUTHORITY', field: 'taskId', message: 'bad' })
  })

  it('records lifecycle transitions for success and failure', async () => {
    const { session, service } = await setup()
    const ok = service.recordLifecycleTransition(session, { from: 'UNINITIALIZED', action: 'OBSERVE_AUTHORITY', ok: true, to: 'AUTHORITY_OBSERVED' })
    const fail = service.recordLifecycleTransition(session, { from: 'RUNNING', action: 'SUBMIT_REVIEW', ok: false, error: { code: 'INVALID_TRANSITION', message: 'bad' } })
    expect(ok.data).toMatchObject({ from: 'UNINITIALIZED', action: 'OBSERVE_AUTHORITY', ok: true, to: 'AUTHORITY_OBSERVED' })
    expect(fail.data).toMatchObject({ ok: false })
    expect(fail.data.error?.code).toBe('INVALID_TRANSITION')
  })

  it('records ordered evidence with stable seq', async () => {
    const { session, service } = await setup()
    service.recordAuthorityObserved(session, VALID_AUTHORITY)
    service.recordLifecycleTransition(session, { from: 'AUTHORITY_OBSERVED', action: 'ADMIT_TASK', ok: true, to: 'TASK_ADMITTED' })
    service.recordLifecycleTransition(session, { from: 'TASK_ADMITTED', action: 'RUN', ok: true, to: 'RUNNING' })
    expect(service.project(session).map(event => event.seq)).toEqual([0, 1, 2])
  })

  it('accepted authority evidence is immutable against caller mutation', async () => {
    const { session, service } = await setup()
    const mutable = { taskId: 'issue-7', source: 'config', allowedPaths: ['src'] }
    service.recordAuthorityObserved(session, mutable)
    mutable.taskId = 'mutated'
    ;(mutable.allowedPaths as string[]).push('evil')
    expect(session.events[0]?.data).toMatchObject({ authority: { taskId: 'issue-7', allowedPaths: ['src'] } })
  })

  it('malformed evidence input fails closed and appends nothing', async () => {
    const { session, service } = await setup()
    expect(() => service.recordAuthorityObserved(session, { taskId: '' })).toThrow()
    expect(() => service.recordLifecycleTransition(session, { from: 'NOPE', action: 'RUN', ok: true, to: 'RUNNING' })).toThrow()
    expect(session.events).toHaveLength(0)
  })

  it('recordAuthorityResult translates accepted results into evidence', async () => {
    const { session, service } = await setup()
    service.recordAuthorityResult(session, { ok: true, snapshot: { taskId: 't', source: 'config', protectedBranches: ['main'] } })
    service.recordAuthorityResult(session, { ok: false, error: { code: 'INVALID_AUTHORITY', message: 'bad' } })
    expect(service.project(session).map(event => event.type)).toEqual(['governance/authority-observed', 'governance/authority-rejected'])
  })

  it('replays through the Session seed API preserving evidence', async () => {
    const { session, service } = await setup()
    service.recordAuthorityObserved(session, VALID_AUTHORITY)
    const replayed = Session.create(SessionId('replay'), session.events)
    const projected = service.project(replayed)
    expect(projected).toHaveLength(1)
    const first = projected[0]
    if (first?.type !== 'governance/authority-observed') throw new Error('unexpected event type')
    expect(first.data.authority.taskId).toBe('issue-7')
  })

  it('flush resolves false without a persistence backend installed', async () => {
    const { session, service } = await setup()
    await expect(service.flush(session)).resolves.toBe(false)
  })

  it('disposes the evidence capability with the service fiber', async () => {
    const ctx = new Context()
    const storeFiber = ctx.plugin(SessionStore)
    const evidenceFiber = ctx.plugin(GovernanceEvidenceService)
    await storeFiber
    await evidenceFiber
    expect(ctx.governanceEvidence).toBeInstanceOf(GovernanceEvidenceService)
    await evidenceFiber.dispose()
    expect(ctx.get('governanceEvidence')).toBeUndefined()
  })
})
