/**
 * V0.9 model-facing builder lifecycle tools.
 *
 * Registers exactly two bounded, fiber-owned tools on the normal ToolRuntime:
 *
 * - `governance_status`  — read-only governance state summary;
 * - `governance_transition` — apply one builder-authorized lifecycle action
 *   through the canonical `ctx.governance.apply()` state machine.
 *
 * These tools make the accepted lifecycle usable in a model-driven Builder
 * session WITHOUT granting acceptance/reviewer authority: there is no
 * `OBSERVE_AUTHORITY` action, no `ACCEPTED` state/action, and no ability to
 * create/replace authority, bypass the guard, or touch Git/GitHub state. The
 * transition tool only delegates to the existing state machine — it duplicates
 * no transition logic. The status tool never mutates state and exposes only
 * bounded non-secret metadata.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { LifecycleAction } from './lifecycle.js'
import type {} from './governance.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceLifecycleTools: LifecycleToolService
  }
}

/** Model-facing tool names (exact, stable). */
export const GOVERNANCE_STATUS_TOOL = 'governance_status'
export const GOVERNANCE_TRANSITION_TOOL = 'governance_transition'

/**
 * The only builder-authorized transitions a model may request. `OBSERVE_AUTHORITY`
 * is deliberately absent: authority observation remains provider/governance-owned,
 * and there is no `ACCEPTED` action anywhere.
 */
export const BUILDER_TRANSITION_ACTIONS = ['ADMIT_TASK', 'RUN', 'BLOCK', 'COMPLETE', 'SUBMIT_REVIEW'] as const

/** Bounded status summary: no full snapshot, allowedPaths, task body, or secrets. */
interface StatusSummary {
  readonly state: string
  readonly authorityAccepted: boolean
  readonly taskId: string | null
  readonly lastAction: string | null
  readonly lastOk: boolean | null
  readonly lastFrom: string | null
  readonly lastTo: string | null
}

/** Bounded transition result: no error stack, no authority payload. */
interface TransitionSummary {
  readonly ok: boolean
  readonly from: string
  readonly action: string
  readonly to: string | null
  readonly code: string | null
  readonly message: string | null
}

const STATUS_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    state: { type: 'string' as const },
    authorityAccepted: { type: 'boolean' as const },
    taskId: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
    lastAction: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
    lastOk: { oneOf: [{ type: 'boolean' as const }, { type: 'null' as const }] as const },
    lastFrom: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
    lastTo: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
  },
  additionalProperties: false,
}

const TRANSITION_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    ok: { type: 'boolean' as const },
    from: { type: 'string' as const },
    action: { type: 'string' as const },
    to: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
    code: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
    message: { oneOf: [{ type: 'string' as const }, { type: 'null' as const }] as const },
  },
  additionalProperties: false,
}

/** Read-only status tool: returns bounded governance metadata, never mutating. */
function defineStatusTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: GOVERNANCE_STATUS_TOOL,
    description: 'Read the current governed-builder lifecycle state (read-only; never mutates state).',
    parameters: {},
    output: {
      schema: STATUS_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(): Promise<StatusSummary> {
      const snapshot = ctx.governance.snapshot()
      const authority = snapshot.authority
      const last = snapshot.lastResult
      return {
        state: snapshot.state,
        authorityAccepted: authority !== null,
        taskId: authority?.taskId ?? null,
        lastAction: last?.action ?? null,
        lastOk: last?.ok ?? null,
        lastFrom: last?.from ?? null,
        lastTo: last !== null && last.ok ? last.to : null,
      }
    },
  })
}

/** Transition tool: delegates one builder-authorized action to the canonical state machine. */
function defineTransitionTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: GOVERNANCE_TRANSITION_TOOL,
    description: 'Apply one builder-authorized lifecycle transition: ADMIT_TASK, RUN, BLOCK, COMPLETE, or SUBMIT_REVIEW.',
    parameters: {
      action: {
        type: 'string',
        enum: BUILDER_TRANSITION_ACTIONS,
        required: true,
      },
    },
    output: {
      schema: TRANSITION_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args): Promise<TransitionSummary> {
      const result = ctx.governance.apply(args.action as LifecycleAction)
      if (result.ok) {
        return { ok: true, from: result.from, action: result.action, to: result.to, code: null, message: null }
      }
      return {
        ok: false,
        from: result.from,
        action: result.action,
        to: null,
        code: result.error.code,
        message: result.error.message,
      }
    },
  })
}

/**
 * Registers the two model-facing lifecycle tools (fiber-owned via the normal
 * ToolRuntime registry). No second ToolRuntime, no custom dispatch path, no
 * authority/acceptance escalation, and no network/filesystem/Git/GitHub work.
 */
export class LifecycleToolService extends Service {
  static inject = ['tools', 'governance'] as const

  constructor(ctx: Context) {
    super(ctx, 'governanceLifecycleTools')
    ctx.tools.register(defineStatusTool(ctx))
    ctx.tools.register(defineTransitionTool(ctx))
    console.log('[governed-workflow] lifecycle tools registered (governance_status, governance_transition)')
  }
}

export default LifecycleToolService
