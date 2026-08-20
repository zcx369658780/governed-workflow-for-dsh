#!/usr/bin/env node
/**
 * Reliable end-user installer for `dsh-governed-workflow` as a DSH Profile Bundle.
 *
 * Zero-runtime-dependency, cross-platform Node script. It installs an explicit
 * immutable GitHub source ref (never floating `main`) into a fresh DSH profile
 * with install/build scripts disabled (the package ships tracked prebuilt
 * `lib/**`), then verifies the resulting profile with
 * `dsh --profile <name> --dump-config`.
 *
 * It never enables the opt-in GitHub Issue authority bootstrap, never requests
 * or stores credentials, and never weakens pnpm/DSH script-safety globally.
 *
 * Usage:
 *   node scripts/install-dsh-governed-workflow.mjs --profile <name> --ref <40-hex-sha> [--dsh <path>]
 */

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

/** The package this installer targets. */
export const PACKAGE_NAME = 'dsh-governed-workflow'
/** The fixed public GitHub repository. */
export const REPO = 'zcx369658780/governed-workflow-for-dsh'
/** A full 40-character lowercase hex commit SHA (immutable source ref). */
export const REF_PATTERN = /^[0-9a-f]{40}$/
/** A safe DSH profile name. */
export const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
/** The five default bundle rows the installer must observe after install. */
export const EXPECTED_ROWS = [
  'governed-workflow',
  'governed-workflow-evidence',
  'governed-workflow-guard',
  'governed-workflow-skill',
  'governed-workflow-lifecycle-tools',
]

/**
 * Parse and validate installer argv. Fails closed on a missing/invalid profile
 * or a missing/invalid immutable ref (never defaults to a floating ref).
 * Returns `{ profile, ref, dshPath }`.
 */
export function parseArgs(argv) {
  const out = { profile: '', ref: '', dshPath: 'dsh' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--profile') {
      out.profile = argv[++i] ?? ''
    } else if (arg === '--ref') {
      out.ref = argv[++i] ?? ''
    } else if (arg === '--dsh') {
      out.dshPath = argv[++i] ?? ''
    } else if (arg === '--help' || arg === '-h') {
      throw new Error('usage: node scripts/install-dsh-governed-workflow.mjs --profile <name> --ref <40-hex-sha> [--dsh <path>]')
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  if (out.profile === '') {
    throw new Error('--profile <name> is required')
  }
  if (!PROFILE_PATTERN.test(out.profile)) {
    throw new Error(`--profile must match ${PROFILE_PATTERN}`)
  }
  if (out.ref === '') {
    throw new Error('--ref <40-hex-commit> is required (refusing to install from floating main)')
  }
  if (!REF_PATTERN.test(out.ref)) {
    throw new Error('--ref must be a full 40-character lowercase hex commit SHA')
  }
  return out
}

/** The exact immutable GitHub source spec for a ref. */
export function buildInstallSpec(ref) {
  return `github:${REPO}#${ref}`
}

/** The native `dsh plugin add` arguments (scripts-disabled, pinned). */
export function buildInstallArgs(profile, ref) {
  return ['plugin', '--profile', profile, 'add', buildInstallSpec(ref), '--ignore-scripts']
}

/** The post-install `dsh --dump-config` arguments. */
export function buildDumpConfigArgs(profile) {
  return ['--profile', profile, '--dump-config']
}

/**
 * Verify a `dsh --dump-config` output contains the governed bundle layer and all
 * five expected default rows. Returns `{ ok, layer, missing }`.
 */
export function verifyDumpConfigOutput(output) {
  const layer = output.includes('# == dsh-governed-workflow')
  const missing = EXPECTED_ROWS.filter((id) => !output.includes(`- id: ${id}`))
  return { ok: layer && missing.length === 0, layer, missing }
}

/** Run the installer end-to-end (install, then verify via dump-config). */
export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const shell = process.platform === 'win32'

  const install = spawnSync(args.dshPath, [...buildInstallArgs(args.profile, args.ref)], { stdio: 'inherit', shell })
  if (install.status !== 0) {
    throw new Error(`dsh plugin add failed with status ${install.status ?? 'null'}`)
  }

  const dump = spawnSync(args.dshPath, [...buildDumpConfigArgs(args.profile)], { encoding: 'utf8', shell })
  if (dump.status !== 0) {
    throw new Error(`dsh --dump-config failed with status ${dump.status ?? 'null'}: ${dump.stderr ?? ''}`.trim())
  }

  const verdict = verifyDumpConfigOutput(dump.stdout ?? '')
  if (!verdict.ok) {
    const reason = verdict.layer
      ? `missing rows: ${verdict.missing.join(', ')}`
      : 'governed bundle layer not found'
    throw new Error(`post-install verification failed: ${reason}`)
  }

  const summary = `installed ${PACKAGE_NAME}@${args.ref} into profile "${args.profile}" (governed bundle verified)`
  console.log(summary)
  return summary
}

// Execute only when run directly (not when imported by tests).
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`installer error: ${message}`)
    process.exitCode = 1
  }
}
