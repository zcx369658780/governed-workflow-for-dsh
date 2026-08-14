import { describe, expect, it } from 'vitest'
import {
  GITHUB_ACCEPT,
  GITHUB_API_VERSION,
  GITHUB_ISSUE_KIND,
  GITHUB_USER_AGENT,
  MAX_BLOCK_BYTES,
  MAX_RESPONSE_BYTES,
  GitHubIssueAuthorityProvider,
  buildGitHubIssueUrl,
  parseV1AuthorityBlock,
  validateGitHubIssueConfig,
  type GitHubIssueResponse,
  type GitHubIssueTransport,
  type GitHubRequestInit,
} from '../src/github-issue-provider.js'

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

function issueBody(policy: Record<string, unknown>): string {
  return block(JSON.stringify(policy))
}

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { number: ISSUE, state: 'open', body: issueBody(VALID_POLICY), ...overrides }
}

function response(status: number, body: unknown): GitHubIssueResponse {
  return {
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

interface RecordedCall {
  url: string
  init: GitHubRequestInit
}

/** A recording fake transport that answers each call with a supplied response. */
function makeTransport(answer: (call: RecordedCall) => GitHubIssueResponse | PromiseLike<GitHubIssueResponse>) {
  const calls: RecordedCall[] = []
  const transport: GitHubIssueTransport = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(answer({ url, init }))
  }
  return { transport, calls }
}

function providerWith(answer: (call: RecordedCall) => GitHubIssueResponse | PromiseLike<GitHubIssueResponse>) {
  const { transport, calls } = makeTransport(answer)
  const provider = new GitHubIssueAuthorityProvider({ repository: REPO, issueNumber: ISSUE }, transport)
  return { provider, calls }
}

describe('parseV1AuthorityBlock', () => {
  it('parses exactly one valid V1 block into policy fields', () => {
    const result = parseV1AuthorityBlock(issueBody(VALID_POLICY))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.policy).toEqual(VALID_POLICY)
      expect(Object.isFrozen(result.policy)).toBe(true)
    }
  })

  it('fails closed when the block is missing', () => {
    const result = parseV1AuthorityBlock('# No block here\n\nJust prose.')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
  })

  it('fails closed on duplicate markers/blocks', () => {
    const result = parseV1AuthorityBlock(`${issueBody(VALID_POLICY)}\n\n${issueBody(VALID_POLICY)}`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
  })

  it('fails closed on malformed JSON and non-object blocks', () => {
    const malformed = parseV1AuthorityBlock(block('{ not json'))
    expect(malformed.ok).toBe(false)
    if (!malformed.ok) expect(malformed.error.code).toBe('INVALID_AUTHORITY')

    const array = parseV1AuthorityBlock(block('[1, 2, 3]'))
    expect(array.ok).toBe(false)
    if (!array.ok) expect(array.error.code).toBe('INVALID_AUTHORITY')
  })

  it('fails closed on unknown block keys', () => {
    const result = parseV1AuthorityBlock(issueBody({ ...VALID_POLICY, surprise: true }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_AUTHORITY')
      expect(result.error.message).toContain('surprise')
    }
  })

  it('fails closed on identity override attempts', () => {
    for (const override of [
      { ...VALID_POLICY, source: 'config' },
      { ...VALID_POLICY, taskId: 'hijacked' },
      { ...VALID_POLICY, repository: 'evil/repo' },
      { ...VALID_POLICY, taskReference: 'https://example.com' },
      { ...VALID_POLICY, observedAt: '2024-01-01T00:00:00Z' },
    ]) {
      const result = parseV1AuthorityBlock(issueBody(override))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
    }
  })

  it('fails closed on an unsupported version marker', () => {
    const body = '<!-- dsh-governed-workflow-authority:v2\n{"baselineRef":"main"}\n-->'
    const result = parseV1AuthorityBlock(body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
  })

  it('fails closed on an unterminated block', () => {
    const result = parseV1AuthorityBlock('<!-- dsh-governed-workflow-authority:v1\n{"baselineRef":"main"}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
  })

  it('fails closed on an oversized block before parsing', () => {
    const huge = `{"baselineRef":"${'x'.repeat(MAX_BLOCK_BYTES + 1)}"}`
    const result = parseV1AuthorityBlock(block(huge))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
  })

  it('ignores a literal marker example inside a fenced code block', () => {
    const body = [
      issueBody(VALID_POLICY),
      '',
      '```text',
      '<!-- dsh-governed-workflow-authority:v1',
      '{ ...JSON... }',
      '-->',
      '```',
    ].join('\n')
    const result = parseV1AuthorityBlock(body)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.policy).toEqual(VALID_POLICY)
  })
})

describe('validateGitHubIssueConfig', () => {
  it('rejects malformed repositories and non-positive/non-safe issue numbers', () => {
    expect(validateGitHubIssueConfig({ repository: REPO, issueNumber: ISSUE })).toBeNull()
    expect(validateGitHubIssueConfig({ repository: 'single', issueNumber: ISSUE })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: 'a/b/c', issueNumber: ISSUE })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: 'a//b', issueNumber: ISSUE })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: ' a/b', issueNumber: ISSUE })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: 'a/b?x', issueNumber: ISSUE })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: 'a/..', issueNumber: ISSUE })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: REPO, issueNumber: 0 })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: REPO, issueNumber: -1 })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: REPO, issueNumber: 1.5 })).not.toBeNull()
    expect(validateGitHubIssueConfig({ repository: REPO, issueNumber: Number.MAX_SAFE_INTEGER + 1 })).not.toBeNull()
  })
})

describe('buildGitHubIssueUrl', () => {
  it('uses the fixed origin and URL-encodes path segments', () => {
    expect(buildGitHubIssueUrl(REPO, ISSUE)).toBe(
      `https://api.github.com/repos/zcx369658780/governed-workflow-for-dsh/issues/17`,
    )
    expect(buildGitHubIssueUrl('a b/c d', 1)).toBe('https://api.github.com/repos/a%20b/c%20d/issues/1')
  })
})

describe('GitHubIssueAuthorityProvider (fake transport)', () => {
  it('performs exactly one GET and returns the canonical snapshot', async () => {
    const { provider, calls } = providerWith(() => response(200, envelope()))
    const result = await provider.resolve()
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toBe('https://api.github.com/repos/zcx369658780/governed-workflow-for-dsh/issues/17')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.source).toBe(GITHUB_ISSUE_KIND)
      expect(result.snapshot.repository).toBe(REPO)
      expect(result.snapshot.taskId).toBe('github-issue:zcx369658780/governed-workflow-for-dsh#17')
      expect(result.snapshot.taskReference).toBe('https://github.com/zcx369658780/governed-workflow-for-dsh/issues/17')
      expect(result.snapshot.baselineRef).toBe('main')
      expect(result.snapshot.protectedBranches).toEqual(['main'])
      expect(Object.isFrozen(result.snapshot)).toBe(true)
      expect(Object.isFrozen(result.snapshot.protectedBranches)).toBe(true)
    }
  })

  it('sends the verified headers and no Authorization header, and passes the signal', async () => {
    const controller = new AbortController()
    const { provider, calls } = providerWith(() => response(200, envelope()))
    await provider.resolve({ signal: controller.signal })
    const init = calls[0].init
    expect(init.headers.Accept).toBe(GITHUB_ACCEPT)
    expect(init.headers['X-GitHub-Api-Version']).toBe(GITHUB_API_VERSION)
    expect(init.headers['User-Agent']).toBe(GITHUB_USER_AGENT)
    expect(Object.hasOwn(init.headers, 'Authorization')).toBe(false)
    expect(Object.keys(init.headers).some(key => key.toLowerCase() === 'authorization')).toBe(false)
    expect(init.redirect).toBe('error')
    expect(init.signal).toBe(controller.signal)
  })

  it('fails before fetching on invalid config', async () => {
    const { transport, calls } = makeTransport(() => response(200, envelope()))
    const provider = new GitHubIssueAuthorityProvider({ repository: 'bad repo', issueNumber: 0 }, transport)
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('fails closed on a 301 redirect without following it', async () => {
    const { provider, calls } = providerWith(() => response(301, envelope()))
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
    expect(calls).toHaveLength(1)
  })

  it('fails closed on 404/410', async () => {
    for (const status of [404, 410]) {
      const { provider } = providerWith(() => response(status, { message: 'Not Found' }))
      const result = await provider.resolve()
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
    }
  })

  it('fails closed on 403/429 without retry', async () => {
    for (const status of [403, 429]) {
      const { provider, calls } = providerWith(() => response(status, { message: 'rate limited' }))
      const result = await provider.resolve()
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
      expect(calls).toHaveLength(1)
    }
  })

  it('fails closed on other non-2xx without leaking the raw body', async () => {
    const secret = 'RAW-BODY-SECRET-TOKEN'
    const { provider } = providerWith(() => response(500, { message: secret }))
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
      expect(result.error.message).not.toContain(secret)
    }
  })

  it('fails closed on network rejection', async () => {
    const transport: GitHubIssueTransport = () => Promise.reject(new Error('ECONNREFUSED'))
    const provider = new GitHubIssueAuthorityProvider({ repository: REPO, issueNumber: ISSUE }, transport)
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
  })

  it('enforces the response size limit before JSON.parse', async () => {
    const huge = JSON.stringify({ number: ISSUE, state: 'open', body: issueBody(VALID_POLICY), padding: 'x'.repeat(MAX_RESPONSE_BYTES + 1) })
    const { provider } = providerWith(() => response(200, huge))
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
  })

  it('fails closed on malformed response JSON', async () => {
    const { provider } = providerWith(() => response(200, '{ not json'))
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
  })

  it('fails closed when the response issue number does not match', async () => {
    const { provider } = providerWith(() => response(200, envelope({ number: 999 })))
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
  })

  it('fails closed on a closed issue', async () => {
    const { provider } = providerWith(() => response(200, envelope({ state: 'closed' })))
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AUTHORITY_UNAVAILABLE')
  })

  it('fails closed on a pull-request payload', async () => {
    const { provider } = providerWith(() => response(200, envelope({ pull_request: { url: 'https://x' } })))
    const result = await provider.resolve()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
  })

  it('fails closed on a non-string/null body', async () => {
    for (const body of [null, 42, { nested: true }]) {
      const { provider } = providerWith(() => response(200, envelope({ body })))
      const result = await provider.resolve()
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
    }
  })

  it('routes invalid ref/SHA/array block fields through canonical validation', async () => {
    for (const policy of [
      { baselineSha: 'not-a-sha' },
      { baselineRef: 'bad ref' },
      { protectedBranches: 'main' },
      { allowedPaths: ['', 'ok'] },
    ]) {
      const { provider } = providerWith(() => response(200, { number: ISSUE, state: 'open', body: issueBody({ ...VALID_POLICY, ...policy }) }))
      const result = await provider.resolve()
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('INVALID_AUTHORITY')
    }
  })

  it('never throws on an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const { provider, calls } = providerWith(() => response(200, envelope()))
    const result = await provider.resolve({ signal: controller.signal })
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
