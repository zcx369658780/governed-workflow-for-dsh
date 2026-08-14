import { describe, expect, it } from 'vitest'
import { KNOWN_SESSION_EVENT_TYPES, Session, SessionId } from '@deepseek-ai/dsh-session'
import { buildAuthorityObservedPayload } from '../src/evidence.js'

/**
 * Minimal reproducible experiment for the V0.3 durable-reload blocker, using
 * only public DSH APIs (`KNOWN_SESSION_EVENT_TYPES` from
 * `@deepseek-ai/dsh-session`, and `Session.append`). It demonstrates the two
 * preconditions under which the first-party
 * `PersistenceCoordinator.assertEventsSupported()` (verified in
 * `packages/session/session-persistence/src/coordinator.ts`, rc.5 checkout)
 * refuses to reconstruct a stored log:
 *
 *   if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable !== true)
 *     -> throw SessionFormatUnsupportedError
 *
 * The three `governance/*` types are out-of-repo (outside the generated
 * first-party set by construction) and `Session.append` exposes no way to set
 * the envelope `ignorable` marker, so first-party durable reload refuses them.
 */
const GOVERNANCE_EVENT_TYPES = [
  'governance/authority-observed',
  'governance/authority-rejected',
  'governance/lifecycle-transition',
] as const

describe('upstream durable-reload capability blocker (@deepseek-ai/dsh-session@0.1.0-rc.6)', () => {
  it('governance evidence event types are NOT in the first-party KNOWN_SESSION_EVENT_TYPES set', () => {
    for (const type of GOVERNANCE_EVENT_TYPES) {
      expect(KNOWN_SESSION_EVENT_TYPES.has(type)).toBe(false)
    }
  })

  it('Session.append cannot mark these events ignorable (and the event is frozen)', () => {
    const session = Session.create(SessionId('blocker'))
    const event = session.append('governance/authority-observed', buildAuthorityObservedPayload({ taskId: 't', source: 'config' }))
    expect(event.ignorable).toBeUndefined()
    expect(Object.isFrozen(event)).toBe(true)
  })

  it('reproduces the first-party acceptance check and shows the event would be refused', () => {
    const session = Session.create(SessionId('blocker-accept'))
    const event = session.append('governance/authority-observed', buildAuthorityObservedPayload({ taskId: 't', source: 'config' }))
    // PersistenceCoordinator.assertEventsSupported() predicate, reproduced
    // against the public KNOWN set and the public append output:
    const accepted = KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true
    expect(accepted).toBe(false)
  })
})
