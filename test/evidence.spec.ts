import { describe, expect, it } from 'vitest'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import {
  EVIDENCE_SCHEMA_VERSION,
  buildAuthorityObservedPayload,
  buildAuthorityRejectedPayload,
  buildLifecycleTransitionPayload,
  isGovernanceEvidenceEvent,
  projectEvidence,
} from '../src/evidence.js'

const VALID_AUTHORITY = { taskId: 'issue-7', source: 'config', baselineRef: 'main' }

describe('evidence payload builders', () => {
  it('builds a frozen authority-observed payload from a canonical snapshot', () => {
    const payload = buildAuthorityObservedPayload(VALID_AUTHORITY)
    expect(payload.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION)
    expect(Object.isFrozen(payload)).toBe(true)
    expect(Object.isFrozen(payload.authority)).toBe(true)
    expect(payload.authority.taskId).toBe('issue-7')
  })

  it('detaches a mutable input and rejects malformed snapshots', () => {
    const mutable = { taskId: 'x', source: 'config', allowedPaths: ['a'] }
    const payload = buildAuthorityObservedPayload(mutable)
    mutable.taskId = 'mutated'
    expect(payload.authority.taskId).toBe('x')
    expect(() => buildAuthorityObservedPayload({ taskId: '', source: 'config' })).toThrow()
    expect(() => buildAuthorityObservedPayload(null)).toThrow()
  })

  it('builds a sanitized authority-rejected payload with a bounded message', () => {
    const payload = buildAuthorityRejectedPayload({ code: 'INVALID_AUTHORITY', field: 'taskId', message: 'bad' })
    expect(payload.code).toBe('INVALID_AUTHORITY')
    expect(payload.field).toBe('taskId')
    expect(payload.message).toBe('bad')

    const long = buildAuthorityRejectedPayload({ code: 'INVALID_AUTHORITY', message: 'x'.repeat(1000) })
    expect(long.message.length).toBeLessThan(600)

    expect(() => buildAuthorityRejectedPayload({ code: 'NOPE', message: 'x' })).toThrow()
    expect(() => buildAuthorityRejectedPayload({ code: 'INVALID_AUTHORITY' })).toThrow()
  })

  it('builds lifecycle-transition payloads for success and failure', () => {
    const ok = buildLifecycleTransitionPayload({ from: 'UNINITIALIZED', action: 'OBSERVE_AUTHORITY', ok: true, to: 'AUTHORITY_OBSERVED' })
    expect(ok).toMatchObject({ ok: true, to: 'AUTHORITY_OBSERVED' })

    const fail = buildLifecycleTransitionPayload({ from: 'RUNNING', action: 'SUBMIT_REVIEW', ok: false, error: { code: 'INVALID_TRANSITION', message: 'bad' } })
    expect(fail).toMatchObject({ ok: false })
    expect(fail.error?.code).toBe('INVALID_TRANSITION')

    expect(() => buildLifecycleTransitionPayload({ from: 'NOPE', action: 'RUN', ok: true, to: 'RUNNING' })).toThrow()
    expect(() => buildLifecycleTransitionPayload({ from: 'RUNNING', action: 'RUN', ok: 'yes' as never })).toThrow()
    expect(() => buildLifecycleTransitionPayload({ from: 'RUNNING', action: 'RUN', ok: true })).toThrow() // missing to
    expect(() => buildLifecycleTransitionPayload({ from: 'RUNNING', action: 'RUN', ok: false })).toThrow() // missing error
  })
})

describe('evidence projection', () => {
  it('returns governance evidence in order and ignores unrelated events', () => {
    const session = Session.create(SessionId('p1'))
    session.append('turn/start', { turn: 1 })
    session.append('governance/authority-observed', buildAuthorityObservedPayload(VALID_AUTHORITY))
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    session.append('governance/lifecycle-transition', buildLifecycleTransitionPayload({ from: 'AUTHORITY_OBSERVED', action: 'ADMIT_TASK', ok: true, to: 'TASK_ADMITTED' }))

    const projected = projectEvidence(session.events)
    expect(projected.map(event => event.type)).toEqual(['governance/authority-observed', 'governance/lifecycle-transition'])
    expect(projected.map(event => event.seq)).toEqual([1, 3])
  })

  it('handles a session with no governance events cleanly', () => {
    const session = Session.create(SessionId('p2'))
    session.append('turn/start', { turn: 1 })
    expect(projectEvidence(session.events)).toEqual([])
  })

  it('fails closed on a malformed recognized governance event', () => {
    const malformed = { type: 'governance/authority-observed', seq: 0, time: 1, data: {} } as unknown as SessionEvent
    const session = Session.create(SessionId('p3'), [malformed])
    expect(() => projectEvidence(session.events)).toThrow(/malformed/)
  })

  it('type guard recognizes only well-formed governance events', () => {
    const session = Session.create(SessionId('p4'))
    const evidence = session.append('governance/authority-observed', buildAuthorityObservedPayload(VALID_AUTHORITY))
    expect(isGovernanceEvidenceEvent(evidence)).toBe(true)
    const turn = session.append('turn/start', { turn: 1 })
    expect(isGovernanceEvidenceEvent(turn)).toBe(false)
  })

  it('ignores unknown/future governance event types during projection', () => {
    const session = Session.create(SessionId('p5'), [
      { type: 'governance/authority-observed', seq: 0, time: 1, data: buildAuthorityObservedPayload(VALID_AUTHORITY) } as unknown as SessionEvent,
      { type: 'governance/tool-decision', seq: 1, time: 2, data: { decision: 'allow' } } as unknown as SessionEvent,
    ])
    const projected = projectEvidence(session.events)
    expect(projected).toHaveLength(1)
    expect(projected[0]?.type).toBe('governance/authority-observed')
  })

  it('rejects contradictory lifecycle evidence on replay (success + error, failure + to)', () => {
    const contradictory = { schemaVersion: 1, from: 'UNINITIALIZED', action: 'OBSERVE_AUTHORITY', ok: true, to: 'AUTHORITY_OBSERVED', error: { code: 'INVALID_TRANSITION', message: 'x' } }
    const session = Session.create(SessionId('p6'), [{ type: 'governance/lifecycle-transition', seq: 0, time: 1, data: contradictory } as unknown as SessionEvent])
    expect(() => projectEvidence(session.events)).toThrow(/malformed/)

    const failureWithTo = { schemaVersion: 1, from: 'RUNNING', action: 'SUBMIT_REVIEW', ok: false, to: 'REVIEW_PENDING', error: { code: 'INVALID_TRANSITION', message: 'x' } }
    const session2 = Session.create(SessionId('p6b'), [{ type: 'governance/lifecycle-transition', seq: 0, time: 1, data: failureWithTo } as unknown as SessionEvent])
    expect(() => projectEvidence(session2.events)).toThrow(/malformed/)
  })

  it('rejects impossible transition claims on replay', () => {
    const impossible = { schemaVersion: 1, from: 'UNINITIALIZED', action: 'RUN', ok: true, to: 'REVIEW_PENDING' }
    const session = Session.create(SessionId('p7'), [{ type: 'governance/lifecycle-transition', seq: 0, time: 1, data: impossible } as unknown as SessionEvent])
    expect(() => projectEvidence(session.events)).toThrow(/malformed/)
  })

  it('rejects unknown own fields in recognized evidence on replay', () => {
    const extraTransition = { schemaVersion: 1, from: 'UNINITIALIZED', action: 'OBSERVE_AUTHORITY', ok: true, to: 'AUTHORITY_OBSERVED', secret: true }
    const session = Session.create(SessionId('p8'), [{ type: 'governance/lifecycle-transition', seq: 0, time: 1, data: extraTransition } as unknown as SessionEvent])
    expect(() => projectEvidence(session.events)).toThrow(/malformed/)

    const extraAuthority = { schemaVersion: 1, authority: VALID_AUTHORITY, secret: true }
    const session2 = Session.create(SessionId('p8b'), [{ type: 'governance/authority-observed', seq: 0, time: 1, data: extraAuthority } as unknown as SessionEvent])
    expect(() => projectEvidence(session2.events)).toThrow(/malformed/)
  })

  it('rejects a failure lifecycle event whose error code is not INVALID_TRANSITION', () => {
    const badCode = { schemaVersion: 1, from: 'RUNNING', action: 'SUBMIT_REVIEW', ok: false, error: { code: 'SOMETHING_ELSE', message: 'x' } }
    const session = Session.create(SessionId('p9'), [{ type: 'governance/lifecycle-transition', seq: 0, time: 1, data: badCode } as unknown as SessionEvent])
    expect(() => projectEvidence(session.events)).toThrow(/malformed/)
  })
})
