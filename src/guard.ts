import type { AuthoritySnapshot } from './authority.js'
import type { LifecycleState } from './lifecycle.js'

/**
 * V0.4 runtime guard policy (pure, no Cordis/ToolRuntime dependency).
 *
 * This slice enforces exactly two ToolRuntime-level invariants for the DSH
 * `bash` tool, and deliberately does NOT parse Bash text or claim Git/path
 * protection:
 *
 * - no accepted authority -> deny (`GOVERNANCE_DENY_NO_AUTHORITY`);
 * - terminal governance state (BLOCKED | COMPLETED | REVIEW_PENDING) -> deny
 *   (`GOVERNANCE_DENY_TERMINAL_STATE`);
 * - non-terminal state with an accepted authority -> no opinion (`undefined`).
 */

/** Machine-recognizable denial code: no accepted authority. */
export const GOVERNANCE_DENY_NO_AUTHORITY = 'GOVERNANCE_DENY_NO_AUTHORITY'

/** Machine-recognizable denial code: terminal governance state. */
export const GOVERNANCE_DENY_TERMINAL_STATE = 'GOVERNANCE_DENY_TERMINAL_STATE'

/** The tool name this slice protects. */
export const PROTECTED_TOOL_NAME = 'bash'

/** Terminal builder states that freeze further Bash execution. */
const TERMINAL_STATES: ReadonlySet<LifecycleState> = new Set(['BLOCKED', 'COMPLETED', 'REVIEW_PENDING'])

/**
 * Evaluate the V0.4 policy for one tool call. Returns a stable bounded denial
 * reason (containing a machine-recognizable code), or `undefined` to add no
 * monotonic denial. Contains no secrets, raw authority payload, or Bash text.
 * @param toolName - the executing tool's name.
 * @param state - the current governance lifecycle state.
 * @param authority - the accepted authority snapshot, or null.
 */
export function evaluateGovernanceToolPolicy(
  toolName: string,
  state: LifecycleState,
  authority: AuthoritySnapshot | null,
): string | undefined {
  if (toolName !== PROTECTED_TOOL_NAME) return undefined
  if (authority === null) {
    return `${GOVERNANCE_DENY_NO_AUTHORITY}: bash execution requires an accepted authority`
  }
  if (TERMINAL_STATES.has(state)) {
    return `${GOVERNANCE_DENY_TERMINAL_STATE}: bash execution denied in terminal governance state ${state}`
  }
  return undefined
}
