import { describe, expect, it } from 'vitest'
import {
  EXPECTED_BINDING,
  EXPECTED_ROWS,
  buildDumpConfigArgs,
  buildInstallArgs,
  buildInstallSpec,
  parseArgs,
  parseGovernedLayer,
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

describe('installer effective-binding verification', () => {
  it('passes when the governed layer has the exact five id -> name bindings', () => {
    const result = verifyEffectiveBinding(fullOutput(correctEntries()))
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('fails closed when the governed bundle layer is absent', () => {
    const result = verifyEffectiveBinding('# == @deepseek-ai/dsh-base\n- id: tools\n  name: tools\n')
    expect(result.ok).toBe(false)
    expect(result.problems).toContain('governed bundle layer not found')
  })

  it('fails closed when a default row is missing', () => {
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

  it('fails closed on an ambiguous (duplicate) row id', () => {
    const entries = [...correctEntries(), { id: 'governed-workflow-guard', name: 'dsh-governed-workflow/guard-service' }]
    const result = verifyEffectiveBinding(fullOutput(entries))
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('duplicate row id') || p.includes('ambiguous row id'))).toBe(true)
  })

  it('fails closed when a row has no name binding', () => {
    const entries = correctEntries().map((entry) =>
      entry.id === 'governed-workflow' ? { id: entry.id } : entry,
    )
    const result = verifyEffectiveBinding(fullOutput(entries))
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('wrong name binding for governed-workflow'))).toBe(true)
  })

  it('parses the governed layer into id -> name entries and ignores other layers', () => {
    const entries = parseGovernedLayer(fullOutput(correctEntries()))
    expect(entries).toEqual(correctEntries())
  })
})
