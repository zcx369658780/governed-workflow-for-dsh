import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import GovernanceService from '../src/governance.js'
import GovernanceToolGuardService from '../src/guard-service.js'
import { GOVERNANCE_DENY_NO_AUTHORITY, GOVERNANCE_DENY_TERMINAL_STATE } from '../src/guard.js'

const VALID_AUTHORITY = {
  taskId: 'issue-11',
  source: 'config',
  repository: 'example/repo',
  baselineRef: 'main',
  baselineSha: '0123456789abcdef0123456789abcdef01234567',
}

const MUTATION_TOOLS = ['bash', 'write', 'edit'] as const

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

const echoTool = defineTool({
  name: 'echo',
  description: 'fake echo',
  parameters: { text: { type: 'string' } },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
  async execute(args) {
    return args.text ?? ''
  },
})

/** Join the text blocks of a tool result for assertion. */
function textOf(result: ToolExecutionResult): string {
  return result.content.map(block => (block.type === 'text' ? block.text : '')).join('\n')
}

async function mount(options: { authority?: unknown } = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GovernanceService, options.authority === undefined ? {} : { authority: options.authority })
  await ctx.plugin(GovernanceToolGuardService)
  return ctx
}

function mutationInput(callId: string, name: string) {
  return { callId: CallId(callId), name, arguments: { input: 'x' }, signal: new AbortController().signal }
}

describe('GovernanceToolGuardService (real ToolRuntime guard seam)', () => {
  it('mounts and disposes on a real Context', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GovernanceService, {})
    const guardFiber = ctx.plugin(GovernanceToolGuardService)
    await guardFiber
    expect(ctx.governanceGuard).toBeInstanceOf(GovernanceToolGuardService)
    await guardFiber.dispose()
    expect(ctx.get('governanceGuard')).toBeUndefined()
  })

  it('leaves non-mutation tools unaffected', async () => {
    const ctx = await mount()
    ctx.tools.register(echoTool)
    const result = await ctx.tools.execute({ callId: CallId('echo-1'), name: 'echo', arguments: { text: 'hi' }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
  })

  it('denies every protected mutation tool with no authority and does not invoke the body', async () => {
    for (const name of MUTATION_TOOLS) {
      const ctx = await mount()
      let invoked = false
      ctx.tools.register(makeMutationTool(name, () => { invoked = true }))
      const result = await ctx.tools.execute(mutationInput(`c-${name}`, name))
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
      expect(textOf(result)).toContain(name)
      expect(invoked).toBe(false)
    }
  })

  it('allows every protected mutation tool in non-terminal states with authority', async () => {
    for (const name of MUTATION_TOOLS) {
      const ctx = await mount({ authority: VALID_AUTHORITY })
      let invoked = false
      ctx.tools.register(makeMutationTool(name, () => { invoked = true }))

      let result = await ctx.tools.execute(mutationInput(`a-${name}`, name))
      expect(result.isError).toBe(false)
      expect(invoked).toBe(true)

      ctx.governance.apply('ADMIT_TASK')
      invoked = false
      result = await ctx.tools.execute(mutationInput(`b-${name}`, name))
      expect(result.isError).toBe(false)
      expect(invoked).toBe(true)

      ctx.governance.apply('RUN')
      invoked = false
      result = await ctx.tools.execute(mutationInput(`d-${name}`, name))
      expect(result.isError).toBe(false)
      expect(invoked).toBe(true)
    }
  })

  it('denies every protected mutation tool in every terminal state', async () => {
    const terminalPaths: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['BLOCKED', ['ADMIT_TASK', 'RUN', 'BLOCK']],
      ['COMPLETED', ['ADMIT_TASK', 'RUN', 'COMPLETE']],
      ['REVIEW_PENDING', ['ADMIT_TASK', 'RUN', 'BLOCK', 'SUBMIT_REVIEW']],
    ]
    for (const name of MUTATION_TOOLS) {
      for (const [state, actions] of terminalPaths) {
        const ctx = await mount({ authority: VALID_AUTHORITY })
        let invoked = false
        ctx.tools.register(makeMutationTool(name, () => { invoked = true }))
        for (const action of actions) ctx.governance.apply(action as never)
        const result = await ctx.tools.execute(mutationInput(`t-${name}-${state}`, name))
        expect(result.isError).toBe(true)
        expect(textOf(result)).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
        expect(textOf(result)).toContain(state)
        expect(invoked).toBe(false)
      }
    }
  })

  it('leaves the read tool unaffected with no authority and in terminal state', async () => {
    const noAuthority = await mount()
    let readInvoked = false
    noAuthority.tools.register(makeReadTool(() => { readInvoked = true }))
    let result = await noAuthority.tools.execute({ callId: CallId('r1'), name: 'read', arguments: { input: 'x' }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    expect(readInvoked).toBe(true)

    const terminal = await mount({ authority: VALID_AUTHORITY })
    let readInvoked2 = false
    terminal.tools.register(makeReadTool(() => { readInvoked2 = true }))
    terminal.governance.apply('ADMIT_TASK')
    terminal.governance.apply('RUN')
    terminal.governance.apply('BLOCK')
    result = await terminal.tools.execute({ callId: CallId('r2'), name: 'read', arguments: { input: 'x' }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    expect(readInvoked2).toBe(true)
  })

  it('a permissive tools/pre-execute listener cannot override write/edit denial', async () => {
    const ctx = await mount()
    ctx.on('tools/pre-execute', async () => ({ kind: 'allow' as const }))
    for (const name of ['write', 'edit'] as const) {
      let invoked = false
      ctx.tools.register(makeMutationTool(name, () => { invoked = true }))
      const result = await ctx.tools.execute(mutationInput(`p-${name}`, name))
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
      expect(invoked).toBe(false)
    }
  })

  it('reads live governance state for filesystem mutation tools', async () => {
    const ctx = await mount({ authority: VALID_AUTHORITY })
    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))

    let result = await ctx.tools.execute(mutationInput('w1', 'write'))
    expect(result.isError).toBe(false)

    ctx.governance.apply('ADMIT_TASK')
    ctx.governance.apply('RUN')
    ctx.governance.apply('BLOCK')
    invoked = false
    result = await ctx.tools.execute(mutationInput('w2', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
    expect(invoked).toBe(false)
  })

  it('denial reason carries the stable code and tool name but no authority payload', async () => {
    const ctx = await mount({ authority: VALID_AUTHORITY })
    ctx.governance.apply('ADMIT_TASK')
    ctx.governance.apply('RUN')
    ctx.governance.apply('BLOCK')
    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))
    const result = await ctx.tools.execute(mutationInput('w3', 'write'))
    expect(result.isError).toBe(true)
    const text = textOf(result)
    expect(text).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
    expect(text).toContain('write')
    expect(text).not.toContain(VALID_AUTHORITY.taskId)
    expect(invoked).toBe(false)
  })

  it('guard disposal removes the mutation-tool policy contribution', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GovernanceService, {})
    const guardFiber = ctx.plugin(GovernanceToolGuardService)
    await guardFiber

    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))

    let result = await ctx.tools.execute(mutationInput('w4', 'write'))
    expect(result.isError).toBe(true)

    await guardFiber.dispose()

    invoked = false
    result = await ctx.tools.execute(mutationInput('w5', 'write'))
    expect(result.isError).toBe(false)
    expect(invoked).toBe(true)
  })
})
