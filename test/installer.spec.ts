import { describe, expect, it } from 'vitest'
import {
  EXPECTED_BINDING,
  EXPECTED_ROWS,
  buildDumpConfigArgs,
  buildInstallArgs,
  buildInstallSpec,
  hasGovernedLayer,
  parseArgs,
  parseTopLevelEntries,
  verifyEffectiveBinding,
} from '../scripts/install-dsh-governed-workflow.mjs'

function governedLayer(entries: Array<{ id: string; name?: string }>): string {
  const body = entries
    .map((entry) => `- id: ${entry.id}${entry.name !== undefined ? `\n  name: ${entry.name}` : ''}`)
    .join('\n')
  return `# == dsh-governed-workflow\n${body}\n`
}

function fullOutput(entries: Array<{ id: string; name?: string }>): string {
  return `# == @deepseek-ai/dsh-base\n- id: tools\n  name: '@deepseek-ai/dsh-tools'\n${governedLayer(entries)}`
}

function correctEntries(): Array<{ id: string; name: string }> {
  return EXPECTED_ROWS.map((id) => ({ id, name: EXPECTED_BINDING[id] }))
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
    expect(parseArgs(['--profile', 'demo', '--ref', ref, '--dsh', '/custom/dsh'])).toEqual({
      profile: 'demo',
      ref,
      dshPath: '/custom/dsh',
    })
    expect(parseArgs(['--profile', 'demo', '--ref', ref]).dshPath).toBe('dsh')
  })
})

describe('installer command construction', () => {
  it('builds the exact pinned github spec', () => {
    expect(buildInstallSpec('a'.repeat(40))).toBe('github:zcx369658780/governed-workflow-for-dsh#' + 'a'.repeat(40))
  })

  it('builds a scripts-disabled pinned install command', () => {
    expect(buildInstallArgs('demo', 'b'.repeat(40))).toEqual([
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

describe('installer global effective-binding verification', () => {
  it('passes when the governed layer has the exact five id -> name bindings', () => {
    const result = verifyEffectiveBinding(fullOutput(correctEntries()))
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('passes when the governed provenance header carries a ", patched by ..." suffix with correct binding', () => {
    const body = correctEntries()
      .map((entry) => `- id: ${entry.id}\n  name: ${entry.name}`)
      .join('\n')
    const output = `# == dsh-governed-workflow, patched by <profile cordis.patch.yml>\n${body}\n`
    expect(hasGovernedLayer(output)).toBe(true)
    const result = verifyEffectiveBinding(output)
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('fails closed when the governed bundle layer is absent', () => {
    const result = verifyEffectiveBinding('# == @deepseek-ai/dsh-base\n- id: tools\n  name: tools\n')
    expect(result.ok).toBe(false)
    expect(result.problems).toContain('governed bundle layer not found')
  })

  it('fails closed when a default row is globally missing', () => {
    const result = verifyEffectiveBinding(fullOutput(correctEntries().slice(0, 4)))
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('missing row id: governed-workflow-lifecycle-tools'))).toBe(true)
  })

  it('fails closed when a row id is overridden to a wrong name', () => {
    const entries = correctEntries().map((entry) =>
      entry.id === 'governed-workflow-guard' ? { ...entry, name: 'dsh-governed-workflow/evidence-service' } : entry,
    )
    const result = verifyEffectiveBinding(fullOutput(entries))
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('wrong name binding for governed-workflow-guard'))).toBe(true)
  })

  it('fails closed on a later provenance section duplicating a governed id', () => {
    const output =
      fullOutput(correctEntries()) +
      `# == <profile cordis.patch.yml>\n- id: governed-workflow-guard\n  name: dsh-governed-workflow/guard-service\n`
    const result = verifyEffectiveBinding(output)
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('ambiguous row id: governed-workflow-guard'))).toBe(true)
  })

  it('fails closed on a later duplicate governed id with a wrong name', () => {
    const output =
      fullOutput(correctEntries()) +
      `# == <profile cordis.patch.yml>\n- id: governed-workflow-skill\n  name: dsh-governed-workflow/evidence-service\n`
    const result = verifyEffectiveBinding(output)
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('ambiguous row id: governed-workflow-skill'))).toBe(true)
  })

  it('fails closed when a globally unique governed id has a wrong name', () => {
    const entries = correctEntries().map((entry) =>
      entry.id === 'governed-workflow' ? { id: entry.id } : entry,
    )
    const result = verifyEffectiveBinding(fullOutput(entries))
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('wrong name binding for governed-workflow'))).toBe(true)
  })

  it('parses all top-level entries across provenance sections', () => {
    const output =
      fullOutput(correctEntries()) +
      `# == <profile cordis.patch.yml>\n- id: some-other\n  name: some/other\n`
    const entries = parseTopLevelEntries(output)
    expect(entries.map((e) => e.id)).toEqual(['tools', ...EXPECTED_ROWS, 'some-other'])
  })
})
