/** Type declarations for scripts/install-dsh-governed-workflow.mjs. */

export const PACKAGE_NAME: 'dsh-governed-workflow'
export const REPO: 'zcx369658780/governed-workflow-for-dsh'
export const REF_PATTERN: RegExp
export const PROFILE_PATTERN: RegExp
export const EXPECTED_ROWS: readonly string[]

export interface InstallerArgs {
  profile: string
  ref: string
  dshPath: string
}

export function parseArgs(argv: readonly string[]): InstallerArgs
export function buildInstallSpec(ref: string): string
export function buildInstallArgs(profile: string, ref: string): readonly string[]
export function buildDumpConfigArgs(profile: string): readonly string[]
export function verifyDumpConfigOutput(output: string): { ok: boolean; layer: boolean; missing: string[] }
export function main(argv?: readonly string[]): string
