import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import GovernanceService from '../src/governance.js'
import GovernanceToolGuardService from '../src/guard-service.js'
import { GOVERNANCE_DENY_NO_AUTHORITY, GOVERNANCE_DENY_TERMINAL_STATE } from '../src/guard.js'

const VALID_AUTHORITY = {
  taskId: 'issue-9',
  source: 'config',
  repository: 'example/repo',
  baselineRef: 'main',
  baselineSha: '0123456789abcdef0123456789abcdef01234567',
}

function makeBashTool(onInvoke: () => void) {
  return defineTool({
    name: 'bash',
    description: 'fake bash',
    parameters: { command: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value as string }] },
    async execute(args) {
      onInvoke()
      return `ran: ${String(args.command)}`
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

function bashInput(callId: string) {
  return {
    callId: CallId(callId),
    name: 'bash',
    arguments: { command: 'echo hi' },
    signal: new AbortController().signal,
  }
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

  it('leaves non-bash tools unaffected', async () => {
    const ctx = await mount()
    ctx.tools.register(echoTool)
    const result = await ctx.tools.execute({ callId: CallId('echo-1'), name: 'echo', arguments: { text: 'hi' }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
  })

  it('denies bash with no accepted authority and does not invoke the body', async () => {
    const ctx = await mount()
    let invoked = false
    ctx.tools.register(makeBashTool(() => { invoked = true }))
    const result = await ctx.tools.execute(bashInput('bash-1'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
    expect(invoked).toBe(false)
  })

  it('allows bash with authority in non-terminal states', async () => {
    const ctx = await mount({ authority: VALID_AUTHORITY })
    let invoked = false
    ctx.tools.register(makeBashTool(() => { invoked = true }))

    // AUTHORITY_OBSERVED (auto-observed at load)
    let result = await ctx.tools.execute(bashInput('bash-2'))
    expect(result.isError).toBe(false)
    expect(invoked).toBe(true)

    ctx.governance.apply('ADMIT_TASK')
    invoked = false
    result = await ctx.tools.execute(bashInput('bash-3'))
    expect(result.isError).toBe(false)
    expect(invoked).toBe(true)

    ctx.governance.apply('RUN')
    invoked = false
    result = await ctx.tools.execute(bashInput('bash-4'))
    expect(result.isError).toBe(false)
    expect(invoked).toBe(true)
  })

  it('denies bash in every terminal state', async () => {
    const paths: ReadonlyArray<readonly [string, string[]]> = [
      ['BLOCKED', ['ADMIT_TASK', 'RUN', 'BLOCK']],
      ['COMPLETED', ['ADMIT_TASK', 'RUN', 'COMPLETE']],
      ['REVIEW_PENDING', ['ADMIT_TASK', 'RUN', 'BLOCK', 'SUBMIT_REVIEW']],
    ]
    for (const [state, actions] of paths) {
      const ctx = await mount({ authority: VALID_AUTHORITY })
      let invoked = false
      ctx.tools.register(makeBashTool(() => { invoked = true }))
      for (const action of actions) ctx.governance.apply(action as never)
      const result = await ctx.tools.execute(bashInput(`bash-${state}`))
      expect(result.isError).toBe(true)
      expect(textOf(result)).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
      expect(textOf(result)).toContain(state)
      expect(invoked).toBe(false)
    }
  })

  it('a permissive tools/pre-execute listener cannot override the guard denial', async () => {
    const ctx = await mount()
    ctx.on('tools/pre-execute', async () => ({ kind: 'allow' as const }))
    let invoked = false
    ctx.tools.register(makeBashTool(() => { invoked = true }))
    const result = await ctx.tools.execute(bashInput('bash-5'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
    expect(invoked).toBe(false)
  })

  it('reads live governance state rather than a cached startup snapshot', async () => {
    const ctx = await mount({ authority: VALID_AUTHORITY })
    let invoked = false
    ctx.tools.register(makeBashTool(() => { invoked = true }))

    // Allowed while non-terminal.
    let result = await ctx.tools.execute(bashInput('bash-6'))
    expect(result.isError).toBe(false)

    // Advance to BLOCKED after the guard was already registered.
    ctx.governance.apply('ADMIT_TASK')
    ctx.governance.apply('RUN')
    ctx.governance.apply('BLOCK')
    invoked = false
    result = await ctx.tools.execute(bashInput('bash-7'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
    expect(invoked).toBe(false)
  })

  it('denial reason contains the stable code and no authority payload', async () => {
    const ctx = await mount({ authority: VALID_AUTHORITY })
    ctx.governance.apply('ADMIT_TASK')
    ctx.governance.apply('RUN')
    ctx.governance.apply('BLOCK')
    let invoked = false
    ctx.tools.register(makeBashTool(() => { invoked = true }))
    const result = await ctx.tools.execute(bashInput('bash-8'))
    expect(result.isError).toBe(true)
    const text = textOf(result)
    expect(text).toContain(GOVERNANCE_DENY_TERMINAL_STATE)
    expect(text).not.toContain(VALID_AUTHORITY.taskId)
    expect(invoked).toBe(false)
  })

  it('guard disposal removes its policy contribution', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GovernanceService, {})
    const guardFiber = ctx.plugin(GovernanceToolGuardService)
    await guardFiber

    let invoked = false
    ctx.tools.register(makeBashTool(() => { invoked = true }))

    let result = await ctx.tools.execute(bashInput('bash-9'))
    expect(result.isError).toBe(true)

    await guardFiber.dispose()

    invoked = false
    result = await ctx.tools.execute(bashInput('bash-10'))
    expect(result.isError).toBe(false)
    expect(invoked).toBe(true)
  })
})
