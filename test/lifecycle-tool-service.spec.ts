import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import GovernanceService from '../src/governance.js'
import GovernanceToolGuardService from '../src/guard-service.js'
import LifecycleToolService, { GOVERNANCE_STATUS_TOOL, GOVERNANCE_TRANSITION_TOOL } from '../src/lifecycle-tool-service.js'
import { GOVERNANCE_DENY_NO_AUTHORITY, GOVERNANCE_DENY_NOT_RUNNING, GOVERNANCE_DENY_TERMINAL_STATE } from '../src/guard.js'

const VALID_AUTHORITY = {
  taskId: 'issue-19',
  source: 'config',
  repository: 'zcx369658780/governed-workflow-for-dsh',
  baselineRef: 'main',
  baselineSha: 'cdb7bcafee287c2248c884d92186eb8b0963bd9b',
  allowedPaths: ['src/**'], // present to prove status does NOT expose it
}

function makeMutationTool(name: string, onInvoke: () => void) {
  return defineTool({
    name,
    description: `fake ${name}`,
    parameters: { input: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    async execute(args) {
      onInvoke()
      return `ran: ${String(args.input)}`
    },
  })
}

function makeReadTool(onInvoke: () => void) {
  return defineTool({
    name: 'read',
    description: 'fake read',
    parameters: { input: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    async execute(args) {
      onInvoke()
      return `read: ${String(args.input)}`
    },
  })
}

function textOf(result: ToolExecutionResult): string {
  return result.content.map(block => (block.type === 'text' ? block.text : '')).join('\n')
}

function mutationInput(callId: string, name: string) {
  return { callId: CallId(callId), name, arguments: { input: 'x' }, signal: new AbortController().signal }
}

async function mount(authority?: unknown): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GovernanceService, authority === undefined ? {} : { authority })
  await ctx.plugin(GovernanceToolGuardService)
  await ctx.plugin(LifecycleToolService)
  return ctx
}

/** Execute a lifecycle tool and return the parsed JSON output (or null on error). */
async function call(ctx: Context, name: string, args: unknown, id = 'c') {
  const result = await ctx.tools.execute({ callId: CallId(id), name, arguments: args, signal: new AbortController().signal })
  return { result, json: result.isError ? null : JSON.parse(textOf(result)) }
}

describe('LifecycleToolService (model-facing tools)', () => {
  it('loads on a real Context + ToolRuntime and registers the two tools', async () => {
    const ctx = await mount()
    expect(ctx.governanceLifecycleTools).toBeInstanceOf(LifecycleToolService)
    expect(ctx.tools.get(GOVERNANCE_STATUS_TOOL)).toBeDefined()
    expect(ctx.tools.get(GOVERNANCE_TRANSITION_TOOL)).toBeDefined()
  })

  it('disposal removes both tool contributions', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GovernanceService, {})
    await ctx.plugin(GovernanceToolGuardService)
    const fiber = ctx.plugin(LifecycleToolService)
    await fiber
    expect(ctx.tools.get(GOVERNANCE_STATUS_TOOL)).toBeDefined()
    expect(ctx.tools.get(GOVERNANCE_TRANSITION_TOOL)).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get(GOVERNANCE_STATUS_TOOL)).toBeUndefined()
    expect(ctx.tools.get(GOVERNANCE_TRANSITION_TOOL)).toBeUndefined()
  })

  it('status in UNINITIALIZED reports no authority and does not mutate state', async () => {
    const ctx = await mount()
    const { json } = await call(ctx, GOVERNANCE_STATUS_TOOL, {})
    expect(json).toEqual({
      state: 'UNINITIALIZED',
      authorityAccepted: false,
      taskId: null,
      lastAction: null,
      lastOk: null,
      lastFrom: null,
      lastTo: null,
    })
    expect(ctx.governance.snapshot().state).toBe('UNINITIALIZED')
  })

  it('status after admission reports task identity without exposing full authority scope', async () => {
    const ctx = await mount(VALID_AUTHORITY)
    const { json } = await call(ctx, GOVERNANCE_STATUS_TOOL, {})
    expect(json.state).toBe('AUTHORITY_OBSERVED')
    expect(json.authorityAccepted).toBe(true)
    expect(json.taskId).toBe('issue-19')
    const text = JSON.stringify(json)
    expect(text).not.toContain('allowedPaths')
    expect(text).not.toContain('src/**')
    expect(text).not.toContain('baselineSha')
  })
})

describe('governance_transition (allowlist + delegation)', () => {
  it('OBSERVE_AUTHORITY and acceptance actions cannot be requested', async () => {
    const ctx = await mount()
    for (const action of ['OBSERVE_AUTHORITY', 'ACCEPT', 'ACCEPTED']) {
      const { result } = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action }, `bad-${action}`)
      expect(result.isError).toBe(true)
      expect(ctx.governance.snapshot().state).toBe('UNINITIALIZED')
    }
  })

  it('ADMIT_TASK before authority fails closed', async () => {
    const ctx = await mount()
    const { json } = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'ADMIT_TASK' })
    expect(json.ok).toBe(false)
    expect(json.from).toBe('UNINITIALIZED')
    expect(json.code).toBe('INVALID_TRANSITION')
    expect(ctx.governance.snapshot().state).toBe('UNINITIALIZED')
  })

  it('accepted authority -> ADMIT_TASK succeeds, then RUN from TASK_ADMITTED', async () => {
    const ctx = await mount(VALID_AUTHORITY)

    const admit = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'ADMIT_TASK' })
    expect(admit.json.ok).toBe(true)
    expect(admit.json.to).toBe('TASK_ADMITTED')
    expect(ctx.governance.snapshot().state).toBe('TASK_ADMITTED')

    // RUN fails from TASK_ADMITTED only after ADMIT; verify it succeeds here.
    const run = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'RUN' })
    expect(run.json.ok).toBe(true)
    expect(run.json.to).toBe('RUNNING')
    expect(ctx.governance.snapshot().state).toBe('RUNNING')
  })

  it('RUN succeeds only from TASK_ADMITTED', async () => {
    const ctx = await mount(VALID_AUTHORITY)
    // RUN from AUTHORITY_OBSERVED (skipping ADMIT_TASK) fails.
    const { json } = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'RUN' })
    expect(json.ok).toBe(false)
    expect(ctx.governance.snapshot().state).toBe('AUTHORITY_OBSERVED')
  })

  it('BLOCK and COMPLETE succeed only from RUNNING', async () => {
    const ctx = await mount(VALID_AUTHORITY)
    // From AUTHORITY_OBSERVED both fail.
    expect((await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'BLOCK' })).json.ok).toBe(false)
    expect((await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'COMPLETE' })).json.ok).toBe(false)
    expect(ctx.governance.snapshot().state).toBe('AUTHORITY_OBSERVED')

    await ctx.governance.apply('ADMIT_TASK')
    await ctx.governance.apply('RUN')

    const block = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'BLOCK' })
    expect(block.json.ok).toBe(true)
    expect(block.json.to).toBe('BLOCKED')
    expect(ctx.governance.snapshot().state).toBe('BLOCKED')
  })

  it('SUBMIT_REVIEW succeeds from both BLOCKED and COMPLETED', async () => {
    for (const terminal of ['BLOCK', 'COMPLETE'] as const) {
      const ctx = await mount(VALID_AUTHORITY)
      await ctx.governance.apply('ADMIT_TASK')
      await ctx.governance.apply('RUN')
      await ctx.governance.apply(terminal)
      const { json } = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'SUBMIT_REVIEW' })
      expect(json.ok).toBe(true)
      expect(json.to).toBe('REVIEW_PENDING')
      expect(ctx.governance.snapshot().state).toBe('REVIEW_PENDING')
    }
  })

  it('invalid transition leaves state unchanged', async () => {
    const ctx = await mount(VALID_AUTHORITY)
    await ctx.governance.apply('ADMIT_TASK')
    await ctx.governance.apply('RUN')
    // BLOCK from RUNNING succeeds; a second BLOCK is impossible.
    expect((await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'BLOCK' })).json.ok).toBe(true)
    const before = ctx.governance.snapshot().state
    const { json } = await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'RUN' })
    expect(json.ok).toBe(false)
    expect(ctx.governance.snapshot().state).toBe(before)
  })
})

describe('RUNNING-only mutation guard + lifecycle tools', () => {
  it('mutation is denied at each pre-RUNNING stage and allowed only in RUNNING', async () => {
    const ctx = await mount()
    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))

    // No authority.
    let result = await ctx.tools.execute(mutationInput('n1', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
    expect(invoked).toBe(false)

    await ctx.governance.observeAuthority({ kind: 'config', resolve: () => ({ ok: true, snapshot: { taskId: 'issue-19', source: 'config', protectedBranches: ['main'] } }) })

    // AUTHORITY_OBSERVED.
    result = await ctx.tools.execute(mutationInput('n2', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NOT_RUNNING)

    await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'ADMIT_TASK' })
    result = await ctx.tools.execute(mutationInput('n3', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NOT_RUNNING)

    await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'RUN' })
    result = await ctx.tools.execute(mutationInput('n4', 'write'))
    expect(result.isError).toBe(false)
    expect(invoked).toBe(true)
  })

  it('COMPLETE immediately freezes subsequent mutation', async () => {
    const ctx = await mount(VALID_AUTHORITY)
    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))

    await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'ADMIT_TASK' })
    await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'RUN' })
    expect((await ctx.tools.execute(mutationInput('c1', 'write'))).isError).toBe(false)

    await call(ctx, GOVERNANCE_TRANSITION_TOOL, { action: 'COMPLETE' })
    invoked = false
    const result = await ctx.tools.execute(mutationInput('c2', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
    expect(invoked).toBe(false)
  })

  it('read/discovery remains available in every state', async () => {
    const ctx = await mount()
    let readInvoked = false
    ctx.tools.register(makeReadTool(() => { readInvoked = true }))
    let result = await ctx.tools.execute({ callId: CallId('r1'), name: 'read', arguments: { input: 'x' }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    expect(readInvoked).toBe(true)
  })

  it('a permissive tools/pre-execute listener cannot override a NOT_RUNNING denial', async () => {
    const ctx = await mount(VALID_AUTHORITY)
    ctx.on('tools/pre-execute', async () => ({ kind: 'allow' as const }))
    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))
    const result = await ctx.tools.execute(mutationInput('p1', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NOT_RUNNING)
    expect(invoked).toBe(false)
  })
})
