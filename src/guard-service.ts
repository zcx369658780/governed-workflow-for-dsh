import { Context, Service } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { evaluateGovernanceToolPolicy } from './guard.js'
import type {} from './governance.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceGuard: GovernanceToolGuardService
  }
}

/**
 * V0.4 monotonic Bash runtime guard. Registers exactly one `ctx.tools.guard()`
 * (owned by this fiber, so it is removed on unload) that reads the LIVE
 * `ctx.governance` snapshot at execution time — never a stale startup decision —
 * and denies `bash` when there is no accepted authority or the lifecycle is in
 * a terminal state. It is not model-facing and never mutates tool arguments,
 * runs shell commands, or performs async/network/filesystem/Git work.
 */
export class GovernanceToolGuardService extends Service {
  static inject = ['tools', 'governance'] as const

  constructor(ctx: Context) {
    super(ctx, 'governanceGuard')

    ctx.tools.guard((execution: Readonly<ToolExecution>): string | undefined => {
      const snapshot = ctx.governance.snapshot()
      return evaluateGovernanceToolPolicy(execution.name, snapshot.state, snapshot.authority)
    })

    console.log('[governed-workflow] bash runtime guard registered')
  }
}

export default GovernanceToolGuardService
