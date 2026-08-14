/**
 * V0.8 explicit opt-in, lifecycle-owned GitHub Issue authority bootstrap.
 *
 * This service is NOT part of the default `dsh-governed-workflow` bundle: it
 * must be enabled by an explicit profile/cordis patch row. Installing the
 * bundle without GitHub authority configuration issues zero network requests.
 *
 * The bootstrap borrows `ctx.governance` and invokes the awaitable
 * `observeAuthority(provider, { signal })` through the canonical V0.7
 * admission path. The observation is owned by the plugin fiber: disposal while
 * a request is in flight aborts it, and a lifecycle-owned timeout bounds how
 * long the network request may run. No detached/unawaited promise is created —
 * `observeAuthority()` never rejects and always settles, and a settle handler
 * clears the timer.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { GitHubIssueAuthorityProvider, type GitHubIssueTransport } from './github-issue-provider.js'
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

    // Lifecycle-owned effect: the disposer aborts the in-flight observation and
    // clears the timer, so unload/disposal settles the network work fail-closed.
    ctx.effect(() => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let settled = false
      const settle = (): void => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
        }
      }

      // observeAuthority() never rejects and always settles (abort makes it
      // settle fail-closed); attaching settle to both arms clears the timer.
      ctx.governance.observeAuthority(provider, { signal: controller.signal }).then(settle, settle)

      return () => {
        clearTimeout(timer)
        controller.abort()
      }
    }, 'github-issue authority bootstrap')

    console.log(
      `[governed-workflow] github-issue authority bootstrap enabled (${config.repository}#${config.issueNumber}, timeout ${timeoutMs}ms)`,
    )
  }
}

export default GitHubIssueAuthorityService
