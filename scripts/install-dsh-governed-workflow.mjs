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
 * Post-install verification is effective-binding based: it parses the composed
 * dump-config's governed layer and asserts the exact id -> name binding of the
 * five default rows, failing closed on a missing row, a wrong/overridden name,
 * or an ambiguous (duplicate) row id.
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
 * The exact effective id -> name binding the composed governed layer must have.
 * A profile/home/CLI patch that overrides a row id to a different name is an
 * effective-config defect the installer must reject.
 */
export const EXPECTED_BINDING = {
  'governed-workflow': 'dsh-governed-workflow',
  'governed-workflow-evidence': 'dsh-governed-workflow/evidence-service',
  'governed-workflow-guard': 'dsh-governed-workflow/guard-service',
  'governed-workflow-skill': 'dsh-governed-workflow/governed-builder-skill',
  'governed-workflow-lifecycle-tools': 'dsh-governed-workflow/lifecycle-tool-service',
}

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
 * Parse the `# == dsh-governed-workflow` layer of a `dsh --dump-config` output
 * into `{ id, name }` entries (indentation-aware, so nested `config` blocks are
 * ignored and `name` is read at the entry's child indent).
 */
export function parseGovernedLayer(output) {
  const entries = []
  let inLayer = false
  let current = null
  let currentIndent = 0
  for (const line of String(output).split('\n')) {
    const trimmed = line.trim()
    if (/^# == /.test(trimmed)) {
      inLayer = trimmed === '# == dsh-governed-workflow'
      current = null
      continue
    }
    if (!inLayer) continue
    const indent = line.length - line.trimStart().length
    const idMatch = /^- id:\s*(.+?)\s*$/.exec(trimmed)
    if (idMatch) {
      current = { id: idMatch[1], name: undefined }
      currentIndent = indent
      entries.push(current)
      continue
    }
    if (current) {
      const nameMatch = /^name:\s*(.+?)\s*$/.exec(trimmed)
      if (nameMatch && indent > currentIndent) {
        current.name = nameMatch[1]
      }
    }
  }
  return entries
}

/**
 * Verify the effective id -> name binding of the five default governed rows.
 * Returns `{ ok, layer, problems }`; fails closed on a missing row, a
 * wrong/overridden name, or an ambiguous (duplicate) row id.
 */
export function verifyEffectiveBinding(output) {
  const layer = String(output).includes('# == dsh-governed-workflow')
  const entries = parseGovernedLayer(output)
  const problems = []

  if (!layer) {
    problems.push('governed bundle layer not found')
  }

  const seen = new Set()
  for (const entry of entries) {
    if (entry.id === undefined || entry.id === '') {
      problems.push('entry missing id')
      continue
    }
    if (seen.has(entry.id)) {
      problems.push(`ambiguous (duplicate) row id: ${entry.id}`)
    }
    seen.add(entry.id)
  }

  for (const [id, expectedName] of Object.entries(EXPECTED_BINDING)) {
    const matches = entries.filter((entry) => entry.id === id)
    if (matches.length === 0) {
      problems.push(`missing row id: ${id}`)
    } else if (matches.length > 1) {
      problems.push(`ambiguous row id: ${id}`)
    } else if (matches[0].name !== expectedName) {
      problems.push(`wrong name binding for ${id}: got "${matches[0].name ?? ''}" expected "${expectedName}"`)
    }
  }

  return { ok: problems.length === 0, layer, problems }
}

/** Quote one argument for cmd.exe on Windows (validated args need no quoting). */
function quoteWindows(arg) {
  if (!/[\s"&|<>^()%!]/.test(arg)) return arg
  return `"${arg.replace(/(["^&|<>()%!])/g, '^$1')}"`
}

/**
 * Run a command cross-platform. On Windows, run through the shell as a single
 * command string so `.cmd` shims resolve via PATHEXT (and to avoid Node's
 * `shell:true` + args-array deprecation); elsewhere spawn directly.
 */
function runCommand(command, args, { capture = false } = {}) {
  if (process.platform === 'win32') {
    const cmd = [command, ...args].map(quoteWindows).join(' ')
    return spawnSync(cmd, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      encoding: capture ? 'utf8' : undefined,
      shell: true,
      windowsHide: true,
    })
  }
  return spawnSync(command, args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: capture ? 'utf8' : undefined,
  })
}

/** Run the installer end-to-end (install, then verify effective binding). */
export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)

  const install = runCommand(args.dshPath, buildInstallArgs(args.profile, args.ref), { capture: false })
  if (install.status !== 0) {
    throw new Error(`dsh plugin add failed with status ${install.status ?? 'null'}`)
  }

  const dump = runCommand(args.dshPath, buildDumpConfigArgs(args.profile), { capture: true })
  if (dump.status !== 0) {
    throw new Error(`dsh --dump-config failed with status ${dump.status ?? 'null'}: ${dump.stderr ?? ''}`.trim())
  }

  const verdict = verifyEffectiveBinding(dump.stdout ?? '')
  if (!verdict.ok) {
    throw new Error(`post-install effective-binding verification failed: ${verdict.problems.join('; ')}`)
  }

  const summary = `installed ${PACKAGE_NAME}@${args.ref} into profile "${args.profile}" (governed bundle effective binding verified)`
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
