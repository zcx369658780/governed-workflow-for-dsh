import { describe, expect, it } from 'vitest'
import {
  GOVERNANCE_DENY_NO_AUTHORITY,
  GOVERNANCE_DENY_TERMINAL_STATE,
  evaluateGovernanceToolPolicy,
} from '../src/guard.js'
import type { AuthoritySnapshot } from '../src/authority.js'

const AUTH: AuthoritySnapshot = { taskId: 'issue-9-authority-xyz', source: 'config', protectedBranches: ['main'] }

describe('evaluateGovernanceToolPolicy (pure V0.4 policy)', () => {
  it('returns no opinion for non-bash tools', () => {
    for (const name of ['echo', 'read', 'write', 'run_code', 'str_replace_editor']) {
      expect(evaluateGovernanceToolPolicy(name, 'UNINITIALIZED', null)).toBeUndefined()
      expect(evaluateGovernanceToolPolicy(name, 'BLOCKED', AUTH)).toBeUndefined()
    }
  })

  it('denies bash with no accepted authority (including UNINITIALIZED)', () => {
    const reason = evaluateGovernanceToolPolicy('bash', 'UNINITIALIZED', null)
    expect(reason).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
  })

  it('allows bash in non-terminal states with an accepted authority', () => {
    for (const state of ['AUTHORITY_OBSERVED', 'TASK_ADMITTED', 'RUNNING'] as const) {
      expect(evaluateGovernanceToolPolicy('bash', state, AUTH)).toBeUndefined()
    }
  })

  it('denies bash in every terminal state', () => {
    for (const state of ['BLOCKED', 'COMPLETED', 'REVIEW_PENDING'] as const) {
      const reason = evaluateGovernanceToolPolicy('bash', state, AUTH)
      expect(reason).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
      expect(reason).toContain(state)
    }
  })

  it('denial reasons are stable, bounded, and contain no authority payload', () => {
    const reason = evaluateGovernanceToolPolicy('bash', 'BLOCKED', AUTH)
    expect(reason).toBe(`${GOVERNANCE_DENY_TERMINAL_STATE}: bash execution denied in terminal governance state BLOCKED`)
    expect(reason).not.toContain(AUTH.taskId)
  })
})
