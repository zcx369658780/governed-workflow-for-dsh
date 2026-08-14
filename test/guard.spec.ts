import { describe, expect, it } from 'vitest'
import {
  GOVERNANCE_DENY_NO_AUTHORITY,
  GOVERNANCE_DENY_TERMINAL_STATE,
  PROTECTED_MUTATION_TOOLS,
  evaluateGovernanceToolPolicy,
} from '../src/guard.js'
import type { AuthoritySnapshot } from '../src/authority.js'

const AUTH: AuthoritySnapshot = { taskId: 'issue-11-authority-xyz', source: 'config', protectedBranches: ['main'] }

const MUTATION_TOOLS = ['bash', 'write', 'edit'] as const
const READ_TOOLS = ['read', 'read_image', 'grep', 'glob', 'echo', 'run_code', 'str_replace_editor'] as const
const NON_TERMINAL = ['AUTHORITY_OBSERVED', 'TASK_ADMITTED', 'RUNNING'] as const
const TERMINAL = ['BLOCKED', 'COMPLETED', 'REVIEW_PENDING'] as const

describe('evaluateGovernanceToolPolicy (pure V0.5 policy)', () => {
  it('declares the exact protected mutation-tool set', () => {
    expect([...PROTECTED_MUTATION_TOOLS].sort()).toEqual(['bash', 'edit', 'write'])
  })

  it('returns no opinion for read/discovery and unrelated tools', () => {
    for (const name of READ_TOOLS) {
      expect(evaluateGovernanceToolPolicy(name, 'UNINITIALIZED', null)).toBeUndefined()
      expect(evaluateGovernanceToolPolicy(name, 'BLOCKED', AUTH)).toBeUndefined()
    }
  })

  it('denies every protected mutation tool with no accepted authority (including UNINITIALIZED)', () => {
    for (const name of MUTATION_TOOLS) {
      const reason = evaluateGovernanceToolPolicy(name, 'UNINITIALIZED', null)
      expect(reason).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
      expect(reason).toContain(name)
    }
  })

  it('allows every protected mutation tool in non-terminal states with authority', () => {
    for (const name of MUTATION_TOOLS) {
      for (const state of NON_TERMINAL) {
        expect(evaluateGovernanceToolPolicy(name, state, AUTH)).toBeUndefined()
      }
    }
  })

  it('denies every protected mutation tool in every terminal state', () => {
    for (const name of MUTATION_TOOLS) {
      for (const state of TERMINAL) {
        const reason = evaluateGovernanceToolPolicy(name, state, AUTH)
        expect(reason).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
        expect(reason).toContain(name)
        expect(reason).toContain(state)
      }
    }
  })

  it('denial reasons are stable, bounded, and contain no authority payload', () => {
    const reason = evaluateGovernanceToolPolicy('write', 'BLOCKED', AUTH)
    expect(reason).toBe(`${GOVERNANCE_DENY_TERMINAL_STATE}: write mutation denied in terminal governance state BLOCKED`)
    expect(reason).not.toContain(AUTH.taskId)
  })
})
