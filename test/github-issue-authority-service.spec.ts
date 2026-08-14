import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Context, Service } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import GovernanceService from '../src/governance.js'
import GovernanceToolGuardService from '../src/guard-service.js'
import { GitHubIssueAuthorityProvider, type GitHubIssueResponse, type GitHubIssueTransport } from '../src/github-issue-provider.js'
import GitHubIssueAuthorityService, { type GitHubIssueAuthorityServiceConfig } from '../src/github-issue-authority-service.js'
import { GOVERNANCE_DENY_NO_AUTHORITY } from '../src/guard.js'

const REPO = 'zcx369658780/governed-workflow-for-dsh'
const ISSUE = 17
const VALID_POLICY = {
  baselineRef: 'main',
  baselineSha: 'f3866974951aedec10c44da01eca3b111c7e3001',
  candidateBranch: 'dsh/v0-8-public-github-issue-authority',
  protectedBranches: ['main'],
}

function block(json: string): string {
  return `<!-- dsh-governed-workflow-authority:v1\n${json}\n-->`
}

function envelope(): Record<string, unknown> {
  return { number: ISSUE, state: 'open', body: block(JSON.stringify(VALID_POLICY)) }
}

function okResponse(): GitHubIssueResponse {
  return { status: 200, text: () => Promise.resolve(JSON.stringify(envelope())) }
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

function textOf(result: ToolExecutionResult): string {
  return result.content.map(block => (block.type === 'text' ? block.text : '')).join('\n')
}

function mutationInput(callId: string, name: string) {
  return { callId: CallId(callId), name, arguments: { input: 'x' }, signal: new AbortController().signal }
}

/** Yield enough microtask turns for an async fiber load to run the bootstrap constructor. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

describe('GitHub Issue authority governance integration (fake transport)', () => {
  it('admission through observeAuthority reaches AUTHORITY_OBSERVED with a canonical frozen snapshot', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {})

    const provider = new GitHubIssueAuthorityProvider({ repository: REPO, issueNumber: ISSUE }, () => Promise.resolve(okResponse()))
    const result = await ctx.governance.observeAuthority(provider)

    expect(result.ok).toBe(true)
    expect(ctx.governance.snapshot().state).toBe('AUTHORITY_OBSERVED')
    const snapshot = ctx.governance.acceptedAuthority()
    expect(snapshot?.source).toBe('github-issue')
    expect(snapshot?.taskId).toBe('github-issue:zcx369658780/governed-workflow-for-dsh#17')
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot?.protectedBranches)).toBe(true)
    // No auto ADMIT_TASK / RUN.
    expect(ctx.governance.snapshot().state).not.toBe('TASK_ADMITTED')
    expect(ctx.governance.snapshot().state).not.toBe('RUNNING')
  })

  it('keeps mutation denied while pending, then unlocks after admission', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GovernanceService, {})
    await ctx.plugin(GovernanceToolGuardService)
    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))

    let resolve!: (value: GitHubIssueResponse) => void
    const pending = new Promise<GitHubIssueResponse>((res) => { resolve = res })
    const provider = new GitHubIssueAuthorityProvider({ repository: REPO, issueNumber: ISSUE }, () => pending)
    const observation = ctx.governance.observeAuthority(provider)

    let result = await ctx.tools.execute(mutationInput('pending', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
    expect(invoked).toBe(false)

    resolve(okResponse())
    const observed = await observation
    expect(observed.ok).toBe(true)

    result = await ctx.tools.execute(mutationInput('admitted', 'write'))
    expect(result.isError).toBe(false)
    expect(invoked).toBe(true)
  })

  it('keeps mutation denied after abort, and a late transport result cannot unlock', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GovernanceService, {})
    await ctx.plugin(GovernanceToolGuardService)
    let invoked = false
    ctx.tools.register(makeMutationTool('write', () => { invoked = true }))

    const controller = new AbortController()
    const never = new Promise<GitHubIssueResponse>(() => {})
    const provider = new GitHubIssueAuthorityProvider({ repository: REPO, issueNumber: ISSUE }, () => never)
    const observation = ctx.governance.observeAuthority(provider, { signal: controller.signal })

    controller.abort()
    const observed = await observation
    expect(observed.ok).toBe(false)
    expect(ctx.governance.acceptedAuthority()).toBeNull()

    const result = await ctx.tools.execute(mutationInput('aborted', 'write'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(GOVERNANCE_DENY_NO_AUTHORITY)
    expect(invoked).toBe(false)
  })

  it('already accepted config authority makes the GitHub provider fetch zero times', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {
      authority: {
        taskId: 'issue-17-config',
        source: 'config',
        repository: REPO,
        baselineRef: 'main',
        baselineSha: 'f3866974951aedec10c44da01eca3b111c7e3001',
      },
    })

    let fetches = 0
    const transport: GitHubIssueTransport = () => {
      fetches += 1
      return Promise.resolve(okResponse())
    }
    const provider = new GitHubIssueAuthorityProvider({ repository: REPO, issueNumber: ISSUE }, transport)
    const result = await ctx.governance.observeAuthority(provider)

    expect(result.ok).toBe(false)
    expect(fetches).toBe(0)
    expect(ctx.governance.acceptedAuthority()?.taskId).toBe('issue-17-config')
  })
})

describe('GitHubIssueAuthorityService (lifecycle-owned bootstrap)', () => {
  /** Mount the real service with a fake transport and delegate its async init to the fiber. */
  function mountService(ctx: Context, config: GitHubIssueAuthorityServiceConfig, transport: GitHubIssueTransport) {
    class Bootstrap {
      static inject = ['governance'] as const
      #inner: GitHubIssueAuthorityService
      constructor(c: Context) {
        this.#inner = new GitHubIssueAuthorityService(c, config, transport)
      }
      [Service.init]() {
        return this.#inner[Service.init]()
      }
    }
    return ctx.plugin(Bootstrap)
  }

  it('awaiting the fiber waits for a delayed observation to complete', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {})

    let resolveTransport!: (value: GitHubIssueResponse) => void
    const transport: GitHubIssueTransport = () => new Promise<GitHubIssueResponse>((res) => { resolveTransport = res })

    const fiber = mountService(ctx, { repository: REPO, issueNumber: ISSUE }, transport)
    let settled = false
    const loaded = fiber.then(() => { settled = true; return 'loaded' })

    await flushMicrotasks()
    expect(settled).toBe(false) // still pending while the transport is delayed

    resolveTransport(okResponse())
    expect(await loaded).toBe('loaded')
    expect(settled).toBe(true)
    expect(ctx.governance.snapshot().state).toBe('AUTHORITY_OBSERVED')
    expect(ctx.governance.acceptedAuthority()?.taskId).toBe('github-issue:zcx369658780/governed-workflow-for-dsh#17')
    await fiber.dispose()
  })

  it('successful bootstrap admits authority but never auto-advances ADMIT_TASK / RUN', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {})

    const fiber = mountService(ctx, { repository: REPO, issueNumber: ISSUE }, () => Promise.resolve(okResponse()))
    await fiber

    expect(ctx.governance.snapshot().state).toBe('AUTHORITY_OBSERVED')
    expect(ctx.governance.acceptedAuthority()?.taskId).toBe('github-issue:zcx369658780/governed-workflow-for-dsh#17')
    await fiber.dispose()
  })

  it('disposal while the request is pending aborts the observation promptly', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {})

    let receivedSignal: AbortSignal | undefined
    const transport: GitHubIssueTransport = (_url, init) => {
      receivedSignal = init.signal
      return new Promise<GitHubIssueResponse>(() => {}) // never settles
    }

    const fiber = mountService(ctx, { repository: REPO, issueNumber: ISSUE }, transport)
    await flushMicrotasks()

    expect(receivedSignal).toBeDefined()
    expect(receivedSignal!.aborted).toBe(false)

    await fiber.dispose()

    expect(receivedSignal!.aborted).toBe(true)
    expect(ctx.governance.snapshot().state).toBe('UNINITIALIZED')
    expect(ctx.governance.acceptedAuthority()).toBeNull()
  })

  it('timeout aborts a never-settling provider and completes fail-closed', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {})

    let receivedSignal: AbortSignal | undefined
    const transport: GitHubIssueTransport = (_url, init) => {
      receivedSignal = init.signal
      return new Promise<GitHubIssueResponse>(() => {}) // never settles
    }

    // Bypass the config-schema min (1000ms) with a tiny direct-constructor value.
    const fiber = mountService(ctx, { repository: REPO, issueNumber: ISSUE, timeoutMs: 30 }, transport)
    await fiber // waits for the observation to settle via timeout

    expect(receivedSignal?.aborted).toBe(true)
    expect(ctx.governance.snapshot().state).toBe('UNINITIALIZED')
    expect(ctx.governance.acceptedAuthority()).toBeNull()
    await fiber.dispose()
  })

  it('a failed observation still completes as a clean fail-closed loaded state', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {})

    const transport: GitHubIssueTransport = () => Promise.resolve({ status: 404, text: () => Promise.resolve('{"message":"Not Found"}') })
    const fiber = mountService(ctx, { repository: REPO, issueNumber: ISSUE }, transport)
    await fiber // must not reject, even though authority is unavailable

    expect(ctx.governance.snapshot().state).toBe('UNINITIALIZED')
    expect(ctx.governance.acceptedAuthority()).toBeNull()
    await fiber.dispose()
  })

  it('already accepted config authority makes the bootstrap fetch zero times', async () => {
    const ctx = new Context()
    await ctx.plugin(GovernanceService, {
      authority: {
        taskId: 'issue-17-config',
        source: 'config',
        repository: REPO,
        baselineRef: 'main',
        baselineSha: 'f3866974951aedec10c44da01eca3b111c7e3001',
      },
    })

    let fetches = 0
    const transport: GitHubIssueTransport = () => {
      fetches += 1
      return Promise.resolve(okResponse())
    }
    const fiber = mountService(ctx, { repository: REPO, issueNumber: ISSUE }, transport)
    await fiber

    expect(fetches).toBe(0)
    expect(ctx.governance.acceptedAuthority()?.taskId).toBe('issue-17-config')
    await fiber.dispose()
  })

  it('the default bundle patch does not enable the network bootstrap (no default network)', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).not.toContain('github-issue')
    expect(patch).toContain('governed-workflow')
  })
})
