/**
 * V0.8 explicit opt-in, lifecycle-owned GitHub Issue authority bootstrap.
 *
 * This service is NOT part of the default `dsh-governed-workflow` bundle: it
 * must be enabled by an explicit profile/cordis patch row. Installing the
 * bundle without GitHub authority configuration issues zero network requests.
 *
 * The bootstrap borrows `ctx.governance` and starts the awaitable
 * `observeAuthority(provider, { signal })` through the canonical V0.7
 * admission path. The observation is owned by the plugin fiber end to end:
 *
 * - an abort/timeout disposer is registered **synchronously** via a sync
 *   `ctx.effect(...)` (before any await), so a pending request is aborted and
 *   its timer cleared on unload;
 * - because Cordis defers effect disposal until an in-flight async load
 *   finishes, a second `internal/plugin` listener aborts the observation the
 *   moment this fiber is disposed — even while the load is still pending — so
 *   disposal never waits for an uncooperative provider;
 * - the observation promise is stored and **awaited** in the async
 *   `[Service.init]` body, so `await ctx.plugin(...)` (the bootstrap fiber)
 *   waits for the observation to reach success / failure / timeout;
 * - a bounded timeout aborts the same observation signal, and the timer is
 *   cleared on settlement and on disposal (no leak, no retry loop);
 * - a failure (or timeout) resolves as a clean fail-closed loaded state —
 *   governance stays `UNINITIALIZED` and the mutation guard keeps denying —
 *   without crashing the process or auto-advancing `ADMIT_TASK` / `RUN`.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { GitHubIssueAuthorityProvider, type GitHubIssueTransport } from './github-issue-provider.js'
import type { AuthorityResult } from './authority.js'
import type {} from './governance.js'

/** Plugin configuration for the opt-in GitHub Issue bootstrap. */
export interface GitHubIssueAuthorityServiceConfig {
  /** GitHub repository as exactly `OWNER/REPO`. */
  readonly repository: string
  /** GitHub issue number, a positive safe integer. */
  readonly issueNumber: number
  /** Optional bounded timeout in ms; defaults to 12 s. */
  readonly timeoutMs?: number
}

/** Conservative default timeout. */
export const GITHUB_BOOTSTRAP_DEFAULT_TIMEOUT_MS = 12_000
/** Bounded configurable timeout range. */
export const GITHUB_BOOTSTRAP_MIN_TIMEOUT_MS = 1_000
export const GITHUB_BOOTSTRAP_MAX_TIMEOUT_MS = 60_000

/**
 * Opt-in bootstrap: awaits one public GitHub Issue authority through
 * `ctx.governance.observeAuthority()`. On failure the governance core stays
 * `UNINITIALIZED` and the mutation guard keeps denying; it never auto-advances
 * `ADMIT_TASK` / `RUN` and never crashes the process for a network failure.
 */
export class GitHubIssueAuthorityService extends Service {
  static Config: Schema<GitHubIssueAuthorityServiceConfig> = z.object({
    repository: z.string(),
    issueNumber: z.number().min(1).step(1),
    timeoutMs: z.number().min(GITHUB_BOOTSTRAP_MIN_TIMEOUT_MS).max(GITHUB_BOOTSTRAP_MAX_TIMEOUT_MS),
  })

  static inject = ['governance'] as const

  private readonly controller: AbortController
  private readonly timer: NodeJS.Timeout
  private readonly observation: Promise<AuthorityResult>

  constructor(ctx: Context, config: GitHubIssueAuthorityServiceConfig, transport?: GitHubIssueTransport) {
    super(ctx, 'githubIssueAuthority')

    const provider = new GitHubIssueAuthorityProvider(
      {
        repository: config.repository,
        issueNumber: config.issueNumber,
      },
      transport,
    )
    const timeoutMs = config.timeoutMs ?? GITHUB_BOOTSTRAP_DEFAULT_TIMEOUT_MS

    this.controller = new AbortController()
    this.timer = setTimeout(() => this.controller.abort(), timeoutMs)

    const fiber = ctx.fiber
    // Disposal hook: `internal/plugin` fires synchronously at the start of this
    // fiber's disposal (before the pending async load is awaited), so the
    // observation settles even when a provider never does — the load can then
    // complete and unload cleanly instead of waiting on an uncooperative fetch.
    ctx.on('internal/plugin', (disposed) => {
      if (disposed === fiber) {
        clearTimeout(this.timer)
        this.controller.abort()
      }
    })

    // Registered abort/timeout disposer (runs on normal unload; belt-and-
    // suspenders alongside the disposal hook above).
    ctx.effect(() => {
      return () => {
        clearTimeout(this.timer)
        this.controller.abort()
      }
    }, 'github-issue authority bootstrap')

    // Start the observation and keep it: it always settles (abort races it
    // fail-closed via V0.7 resolveWithAbort), and `[Service.init]` awaits it so
    // the fiber does not settle until the observation does. Clear the timer on
    // settlement so it cannot fire after success/failure.
    this.observation = ctx.governance
      .observeAuthority(provider, { signal: this.controller.signal })
      .finally(() => clearTimeout(this.timer))

    console.log(
      `[governed-workflow] github-issue authority bootstrap enabled (${config.repository}#${config.issueNumber}, timeout ${timeoutMs}ms)`,
    )
  }

  /**
   * Run after construction; the fiber awaits this body, so `await ctx.plugin()`
   * waits for the observation to reach success / failure / timeout. The
   * observation never rejects (observeAuthority fails closed), so this always
   * resolves — even a failed observation loads as a clean fail-closed state.
   */
  [Service.init](): Promise<void> {
    return this.observation.then(() => undefined)
  }
}

export default GitHubIssueAuthorityService
