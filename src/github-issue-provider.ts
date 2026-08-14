/**
 * V0.8 public GitHub.com Issue authority provider.
 *
 * A read-only, unauthenticated, single-request adapter over
 * `GET https://api.github.com/repos/{owner}/{repo}/issues/{n}`. It parses one
 * strict V1 machine-readable authority block from the Issue body, derives all
 * identity/provenance fields from the configured target, and returns the
 * canonical `AuthorityResult` for the V0.7 governance admission path.
 *
 * Deliberate boundaries:
 * - fixed `https://api.github.com` origin — no configurable base URL, so this
 *   cannot become an arbitrary URL/SSRF fetcher;
 * - public, unauthenticated only — no Authorization header, no token/env
 *   credential lookup, no private repos, no authenticated fallback;
 * - exactly one GET per `resolve()`; no retry/backoff/polling/comment fetch;
 * - redirects fail closed (redirect: 'error' plus a 3xx status guard);
 * - the transport is injectable for deterministic offline tests, but the URL
 *   is always constructed by this module, never supplied by a caller.
 */

import {
  authorityFailure,
  validateAuthority,
  type AuthorityError,
  type AuthorityProvider,
  type AuthorityResolveOptions,
  type AuthorityResult,
} from './authority.js'

/** The provider identity asserted on every snapshot's `source`. */
export const GITHUB_ISSUE_KIND = 'github-issue' as const

/** Fixed public GitHub REST origin. */
export const GITHUB_API_ORIGIN = 'https://api.github.com'

/** Verified GitHub REST media type. */
export const GITHUB_ACCEPT = 'application/vnd.github+json'

/** Verified GitHub REST API version header value. */
export const GITHUB_API_VERSION = '2022-11-28'

/** Stable User-Agent (no credentials embedded). */
export const GITHUB_USER_AGENT = 'dsh-governed-workflow'

/** Conservative ceiling on the extracted authority-block substring. */
export const MAX_BLOCK_BYTES = 64 * 1024

/** Conservative ceiling on the full response body before JSON.parse. */
export const MAX_RESPONSE_BYTES = 1024 * 1024

/** Exact V1 pilot marker open token. */
const MARKER_OPEN_V1 = '<!-- dsh-governed-workflow-authority:v1'

/** Marker family prefix used to detect duplicate/unsupported blocks. */
const AUTHORITY_MARKER_RE = /<!-- dsh-governed-workflow-authority:([A-Za-z0-9]+)/g

/** HTML-comment close token. */
const MARKER_CLOSE = '-->'

/**
 * Owner/repository segment rule: alphanumeric at both ends, with an
 * alphanumeric/`._-` middle. This rejects empty segments, `.` / `..`
 * (path-traversal/SSRF), and leading/trailing dots or hyphens, while staying
 * within GitHub's conservative public charset.
 */
const REPO_SEGMENT_RE = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/

/**
 * The only block keys a V1 authority block may supply. These map 1:1 onto
 * existing `AuthoritySnapshot` policy/mutation fields. Identity/provenance
 * fields (`taskId`, `source`, `repository`, `taskReference`, `observedAt`) are
 * provider-owned and therefore rejected here as unknown keys.
 */
const ALLOWED_BLOCK_KEYS = new Set([
  'baselineRef',
  'baselineSha',
  'candidateBranch',
  'allowedPaths',
  'protectedBranches',
])

/** Provider configuration: the fixed public target. */
export interface GitHubIssueAuthorityConfig {
  /** GitHub repository as exactly `OWNER/REPO`. */
  readonly repository: string
  /** GitHub issue number, a positive safe integer. */
  readonly issueNumber: number
}

/** Minimal response shape the provider reads (satisfied by `Response` and fakes). */
export interface GitHubIssueResponse {
  readonly status: number
  text(): PromiseLike<string>
}

/** Minimal request-init shape the provider emits (no credentials, ever). */
export interface GitHubRequestInit {
  readonly method: 'GET'
  readonly headers: Readonly<Record<string, string>>
  readonly redirect: 'error'
  readonly signal?: AbortSignal
}

/** Injectable transport; the URL is always built by the provider. */
export type GitHubIssueTransport = (url: string, init: GitHubRequestInit) => PromiseLike<GitHubIssueResponse>

/** Whether an optional signal is already aborted (fresh read, no cross-await narrowing). */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted
}

/** A plain record whose prototype is `Object.prototype` or `null`. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Remove fenced code blocks so a literal authority-block example inside a
 * ```/~~~ fence is not mistaken for the real block. This is lexical
 * normalization to locate the block, not semantic interpretation of prose.
 */
function stripFencedCodeBlocks(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0
  for (const line of lines) {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (match) {
      const char = match[1][0]
      const len = match[1].length
      if (!inFence) {
        inFence = true
        fenceChar = char
        fenceLen = len
      } else if (char === fenceChar && len >= fenceLen) {
        inFence = false
      }
      // Fence lines (and any differing-fence content lines) are never output.
      continue
    }
    if (!inFence) {
      out.push(line)
    }
  }
  return out.join('\n')
}

/** The result of parsing a V1 authority block (policy fields only). */
export type V1BlockParseResult =
  | { readonly ok: true; readonly policy: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly error: AuthorityError }

/** Narrow `authorityFailure()` (always the failure variant) to the parse result's failure arm. */
function blockFailure(code: AuthorityError['code'], message: string, field?: string): { ok: false; error: AuthorityError } {
  return authorityFailure(code, message, field) as { ok: false; error: AuthorityError }
}

/**
 * Extract and structurally validate the single V1 authority block from an
 * Issue body. Fail-closed: missing → `AUTHORITY_UNAVAILABLE`; duplicate,
 * unsupported version, malformed JSON, non-object, unknown key, or oversized
 * block → `INVALID_AUTHORITY`.
 *
 * Only the policy keys are returned; identity/provenance must be supplied by
 * the provider, never by the block.
 */
export function parseV1AuthorityBlock(body: string): V1BlockParseResult {
  const stripped = stripFencedCodeBlocks(body)

  const markers = [...stripped.matchAll(AUTHORITY_MARKER_RE)]
  if (markers.length === 0) {
    return blockFailure('AUTHORITY_UNAVAILABLE', 'no V1 authority block found in issue body')
  }
  for (const marker of markers) {
    if (marker[1] !== 'v1') {
      return blockFailure('INVALID_AUTHORITY', `unsupported authority block version "${marker[1]}"`)
    }
  }
  if (markers.length > 1) {
    return blockFailure('INVALID_AUTHORITY', 'multiple authority blocks found in issue body')
  }

  const marker = markers[0]
  const openEnd = (marker.index ?? 0) + marker[0].length
  const closeIndex = stripped.indexOf(MARKER_CLOSE, openEnd)
  if (closeIndex === -1) {
    return blockFailure('INVALID_AUTHORITY', 'unterminated authority block in issue body')
  }

  const raw = stripped.slice(openEnd, closeIndex).trim()
  if (raw.length > MAX_BLOCK_BYTES) {
    return blockFailure('INVALID_AUTHORITY', 'authority block is too large')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return blockFailure('INVALID_AUTHORITY', 'authority block is not valid JSON')
  }
  if (!isPlainRecord(parsed)) {
    return blockFailure('INVALID_AUTHORITY', 'authority block must be a JSON object')
  }

  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_BLOCK_KEYS.has(key)) {
      return blockFailure('INVALID_AUTHORITY', `unexpected authority block field "${key}"`, key)
    }
  }

  return { ok: true, policy: Object.freeze({ ...parsed }) }
}

/**
 * Validate provider configuration. Returns an error message or `null`.
 * Repository must be exactly two nonblank `[A-Za-z0-9_.-]+` segments; issue
 * number must be a positive safe integer.
 */
export function validateGitHubIssueConfig(config: GitHubIssueAuthorityConfig): string | null {
  const repository = config.repository
  if (typeof repository !== 'string') {
    return 'repository must be a string'
  }
  if (repository.trim() !== repository) {
    return 'repository must not have surrounding whitespace'
  }
  const segments = repository.split('/')
  if (segments.length !== 2 || !REPO_SEGMENT_RE.test(segments[0]) || !REPO_SEGMENT_RE.test(segments[1])) {
    return 'repository must be exactly "OWNER/REPO" with two nonblank path segments'
  }
  const issueNumber = config.issueNumber
  if (typeof issueNumber !== 'number' || !Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    return 'issueNumber must be a positive safe integer'
  }
  return null
}

/** Build the fixed public endpoint with URL-encoded path segments. */
export function buildGitHubIssueUrl(repository: string, issueNumber: number): string {
  const [owner, repo] = repository.split('/')
  return `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`
}

const defaultTransport: GitHubIssueTransport = (url, init) => fetch(url, init)

/**
 * Public, unauthenticated, read-only GitHub.com Issue authority provider.
 *
 * Each `resolve()` performs at most one GET; it never retries, polls, reads
 * comments, follows redirects, or touches credentials. The provider returns a
 * structured `AuthorityResult` and never throws.
 */
export class GitHubIssueAuthorityProvider implements AuthorityProvider {
  readonly kind = GITHUB_ISSUE_KIND

  /**
   * @param config - fixed public target (`repository`, `issueNumber`).
   * @param transport - injectable fetch; defaults to the global fetch.
   */
  constructor(
    private readonly config: GitHubIssueAuthorityConfig,
    private readonly transport: GitHubIssueTransport = defaultTransport,
  ) {}

  async resolve(options?: AuthorityResolveOptions): Promise<AuthorityResult> {
    const signal = options?.signal
    if (isAborted(signal)) {
      return authorityFailure('INVALID_AUTHORITY', 'authority request was aborted before it began')
    }

    const configError = validateGitHubIssueConfig(this.config)
    if (configError !== null) {
      return authorityFailure('INVALID_AUTHORITY', configError)
    }

    const url = buildGitHubIssueUrl(this.config.repository, this.config.issueNumber)
    const init: GitHubRequestInit = {
      method: 'GET',
      headers: {
        Accept: GITHUB_ACCEPT,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': GITHUB_USER_AGENT,
      },
      redirect: 'error',
      ...(signal !== undefined ? { signal } : {}),
    }

    let response: GitHubIssueResponse
    try {
      response = await this.transport(url, init)
    } catch {
      if (isAborted(signal)) {
        return authorityFailure('INVALID_AUTHORITY', 'authority request was aborted')
      }
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub request failed')
    }

    const status = response.status
    if (status >= 300 && status < 400) {
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub request was redirected; refusing to follow')
    }
    if (status === 404 || status === 410) {
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub issue is not available')
    }
    if (status === 403 || status === 429) {
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub request was rate-limited or forbidden')
    }
    if (status !== 200) {
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub request failed')
    }

    let text: string
    try {
      text = await response.text()
    } catch {
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub response body could not be read')
    }
    if (text.length > MAX_RESPONSE_BYTES) {
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub response was too large')
    }

    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      return authorityFailure('INVALID_AUTHORITY', 'GitHub response was not valid JSON')
    }
    if (!isPlainRecord(payload)) {
      return authorityFailure('INVALID_AUTHORITY', 'GitHub response was not a JSON object')
    }

    if (payload.number !== this.config.issueNumber) {
      return authorityFailure('INVALID_AUTHORITY', 'GitHub response issue number did not match the configured target')
    }
    if (payload.state !== 'open') {
      return authorityFailure('AUTHORITY_UNAVAILABLE', 'GitHub issue is closed')
    }
    if (Object.hasOwn(payload, 'pull_request')) {
      return authorityFailure('INVALID_AUTHORITY', 'GitHub response was a pull request, not an issue')
    }
    if (typeof payload.body !== 'string') {
      return authorityFailure('INVALID_AUTHORITY', 'GitHub issue body was not a string')
    }

    const block = parseV1AuthorityBlock(payload.body)
    if (!block.ok) {
      return block
    }

    // Identity is derived from the configured target; the block cannot
    // override it because identity keys are rejected as unknown block keys.
    return validateAuthority({
      taskId: `${GITHUB_ISSUE_KIND}:${this.config.repository}#${this.config.issueNumber}`,
      source: GITHUB_ISSUE_KIND,
      repository: this.config.repository,
      taskReference: `https://github.com/${this.config.repository}/issues/${this.config.issueNumber}`,
      ...block.policy,
    })
  }
}

export default GitHubIssueAuthorityProvider
