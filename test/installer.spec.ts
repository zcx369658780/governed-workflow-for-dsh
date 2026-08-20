import { describe, expect, it } from 'vitest'
import {
  EXPECTED_ROWS,
  buildDumpConfigArgs,
  buildInstallArgs,
  buildInstallSpec,
  parseArgs,
  verifyDumpConfigOutput,
} from '../scripts/install-dsh-governed-workflow.mjs'

function sampleDumpConfig(rows: readonly string[] = EXPECTED_ROWS, withLayer = true): string {
  const layer = withLayer ? '# == dsh-governed-workflow\n' : ''
  const body = rows.map((id) => `- id: ${id}\n  name: dsh-governed-workflow`).join('\n')
  return `# == @deepseek-ai/dsh-base\n- id: tools\n${layer}${body}\n`
}

describe('installer parseArgs', () => {
  it('rejects a missing profile', () => {
    expect(() => parseArgs(['--ref', '0'.repeat(40)])).toThrow(/--profile .* required/)
  })

  it('rejects a missing immutable ref (never defaults to floating main)', () => {
    expect(() => parseArgs(['--profile', 'demo'])).toThrow(/--ref .* required/)
  })

  it('rejects a non-hex / short ref', () => {
    expect(() => parseArgs(['--profile', 'demo', '--ref', 'not-a-sha'])).toThrow(/full 40-character/)
    expect(() => parseArgs(['--profile', 'demo', '--ref', 'abcd1234'])).toThrow(/full 40-character/)
    expect(() => parseArgs(['--profile', 'demo', '--ref', '0'.repeat(39) + 'g'])).toThrow(/full 40-character/)
  })

  it('rejects an invalid profile name', () => {
    expect(() => parseArgs(['--profile', 'bad profile', '--ref', '0'.repeat(40)])).toThrow(/--profile must match/)
  })

  it('rejects an unknown argument', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/)
  })

  it('parses valid arguments', () => {
    const ref = 'a'.repeat(40)
    const parsed = parseArgs(['--profile', 'demo', '--ref', ref, '--dsh', '/custom/dsh'])
    expect(parsed).toEqual({ profile: 'demo', ref, dshPath: '/custom/dsh' })
    // default dsh path when omitted
    expect(parseArgs(['--profile', 'demo', '--ref', ref]).dshPath).toBe('dsh')
  })
})

describe('installer command construction', () => {
  it('builds the exact pinned github spec', () => {
    expect(buildInstallSpec('a'.repeat(40))).toBe('github:zcx369658780/governed-workflow-for-dsh#' + 'a'.repeat(40))
  })

  it('builds a scripts-disabled pinned install command', () => {
    const args = buildInstallArgs('demo', 'b'.repeat(40))
    expect(args).toEqual([
      'plugin',
      '--profile',
      'demo',
      'add',
      'github:zcx369658780/governed-workflow-for-dsh#' + 'b'.repeat(40),
      '--ignore-scripts',
    ])
  })

  it('builds the dump-config verification command', () => {
    expect(buildDumpConfigArgs('demo')).toEqual(['--profile', 'demo', '--dump-config'])
  })
})

describe('installer post-install verification', () => {
  it('passes when the governed layer and all five rows are present', () => {
    const result = verifyDumpConfigOutput(sampleDumpConfig())
    expect(result).toEqual({ ok: true, layer: true, missing: [] })
  })

  it('fails when a default row is missing', () => {
    const result = verifyDumpConfigOutput(sampleDumpConfig(EXPECTED_ROWS.slice(0, 4)))
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['governed-workflow-lifecycle-tools'])
  })

  it('fails when the governed bundle layer is absent', () => {
    const result = verifyDumpConfigOutput(sampleDumpConfig(EXPECTED_ROWS, false))
    expect(result.ok).toBe(false)
    expect(result.layer).toBe(false)
  })
})
