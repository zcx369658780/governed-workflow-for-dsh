import type { AuthoritySnapshot } from './authority.js'
import type { LifecycleState } from './lifecycle.js'

/**
 * V0.9 runtime guard policy (pure, no Cordis/ToolRuntime dependency).
 *
 * Extends the accepted V0.4/V0.5 guard: the mutation-capable tool names this
 * project gates at the ToolRuntime boundary are `bash`, `write`, and `edit`.
 * Read/discovery tools (`read`, `read_image`, `grep`, `glob`, …) are
 * deliberately NOT gated: **read authority is not mutation authority**.
 *
 * - no accepted authority -> deny (`GOVERNANCE_DENY_NO_AUTHORITY`);
 * - terminal governance state (BLOCKED | COMPLETED | REVIEW_PENDING) -> deny
 *   (`GOVERNANCE_DENY_TERMINAL_STATE`);
 * - accepted authority but state not exactly RUNNING (AUTHORITY_OBSERVED or
 *   TASK_ADMITTED) -> deny (`GOVERNANCE_DENY_NOT_RUNNING`);
 * - exactly RUNNING with accepted authority -> no opinion (`undefined`).
 *
 * No Bash/Git semantics parsing and no path allow/deny is performed.
 */

/** Machine-recognizable denial code: no accepted authority. */
export const GOVERNANCE_DENY_NO_AUTHORITY = 'GOVERNANCE_DENY_NO_AUTHORITY'

/** Machine-recognizable denial code: terminal governance state. */
export const GOVERNANCE_DENY_TERMINAL_STATE = 'GOVERNANCE_DENY_TERMINAL_STATE'

/** Machine-recognizable denial code: accepted authority but not RUNNING. */
export const GOVERNANCE_DENY_NOT_RUNNING = 'GOVERNANCE_DENY_NOT_RUNNING'

/** The protected mutation-capable tool names this guard gates. */
export const PROTECTED_MUTATION_TOOLS: ReadonlySet<string> = new Set(['bash', 'write', 'edit'])

/** Terminal builder states that freeze further mutation. */
const TERMINAL_STATES: ReadonlySet<LifecycleState> = new Set(['BLOCKED', 'COMPLETED', 'REVIEW_PENDING'])

/**
 * Evaluate the V0.9 policy for one tool call. Returns a stable bounded denial
 * reason (containing a machine-recognizable code and the protected tool name),
 * or `undefined` to add no monotonic denial. Contains no command/file content,
 * path, authority payload, or secrets.
 * @param toolName - the executing tool's name.
 * @param state - the current governance lifecycle state.
 * @param authority - the accepted authority snapshot, or null.
 */
export function evaluateGovernanceToolPolicy(
  toolName: string,
  state: LifecycleState,
  authority: AuthoritySnapshot | null,
): string | undefined {
  if (!PROTECTED_MUTATION_TOOLS.has(toolName)) return undefined
  if (authority === null) {
    return `${GOVERNANCE_DENY_NO_AUTHORITY}: ${toolName} mutation requires an accepted authority`
  }
  if (TERMINAL_STATES.has(state)) {
    return `${GOVERNANCE_DENY_TERMINAL_STATE}: ${toolName} mutation denied in terminal governance state ${state}`
  }
  if (state !== 'RUNNING') {
    return `${GOVERNANCE_DENY_NOT_RUNNING}: ${toolName} mutation requires RUNNING governance state (current ${state})`
  }
  return undefined
}
