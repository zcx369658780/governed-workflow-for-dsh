import { describe, expect, it } from 'vitest'
import { validateAuthority } from '../src/authority.js'

const VALID = {
  taskId: 'issue-5',
  source: 'config',
  repository: 'zcx369658780/governed-workflow-for-dsh',
  baselineRef: 'main',
  baselineSha: '93654a9ad4e02fa1f19eee270b5d8519f29f6e1c',
  candidateBranch: 'dsh/v0-2-authority-core',
  allowedPaths: ['src/**', 'docs/**'],
  protectedBranches: ['main'],
  taskReference: 'Issue #5',
  observedAt: '2026-08-14T00:00:00.000Z',
}

describe('validateAuthority (runtime validation)', () => {
  it('accepts a full valid snapshot', () => {
    const result = validateAuthority(VALID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.taskId).toBe('issue-5')
      expect(result.snapshot.source).toBe('config')
      expect(result.snapshot.protectedBranches).toEqual(['main'])
    }
  })

  it('accepts a minimal snapshot and defaults protectedBranches to ["main"]', () => {
    const result = validateAuthority({ taskId: 't', source: 's' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.protectedBranches).toEqual(['main'])
    }
  })

  it('returns a deeply frozen (immutable) snapshot', () => {
    const result = validateAuthority(VALID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.isFrozen(result.snapshot)).toBe(true)
      expect(Object.isFrozen(result.snapshot.allowedPaths)).toBe(true)
      expect(Object.isFrozen(result.snapshot.protectedBranches)).toBe(true)
    }
  })

  it('rejects missing or empty task identity', () => {
    for (const input of [{ source: 's' }, { taskId: '', source: 's' }, { taskId: '  ', source: 's' }, { taskId: ' x ', source: 's' }]) {
      const result = validateAuthority(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.field).toBe('taskId')
    }
  })

  it('rejects missing or empty source', () => {
    for (const input of [{ taskId: 't' }, { taskId: 't', source: '' }]) {
      const result = validateAuthority(input)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.field).toBe('source')
    }
  })

  it('rejects invalid baseline SHA and ref', () => {
    for (const sha of ['xyz', '123456', 'g'.repeat(40), '12345678901234567890123456789012345678901']) {
      const result = validateAuthority({ taskId: 't', source: 's', baselineSha: sha })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.field).toBe('baselineSha')
    }
    for (const ref of ['..', 'a b', 'a//b', 'a.', '.a', 'a.lock', '/a', 'a/', 'a@{b', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'foo/.hidden/bar', 'foo/bar.lock/baz', 'a.lock/b']) {
      const result = validateAuthority({ taskId: 't', source: 's', baselineRef: ref })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.field).toBe('baselineRef')
    }
  })

  it('rejects malformed path and branch arrays', () => {
    for (const allowedPaths of ['src/**', ['src/**', 42], ['src/**', ''], [null]]) {
      const result = validateAuthority({ taskId: 't', source: 's', allowedPaths })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.field).toBe('allowedPaths')
    }
    for (const protectedBranches of ['main', ['main', 42], ['main', 'bad ref'], ['main', '']]) {
      const result = validateAuthority({ taskId: 't', source: 's', protectedBranches })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.field).toBe('protectedBranches')
    }
  })

  it('rejects sparse authority arrays', () => {
    const paths = validateAuthority({ taskId: 't', source: 's', allowedPaths: Array(1) })
    expect(paths.ok).toBe(false)
    if (!paths.ok) expect(paths.error.field).toBe('allowedPaths')

    const branches: unknown[] = ['main']
    branches.length = 2 // hole at index 1
    const branchResult = validateAuthority({ taskId: 't', source: 's', protectedBranches: branches })
    expect(branchResult.ok).toBe(false)
    if (!branchResult.ok) expect(branchResult.error.field).toBe('protectedBranches')
  })

  it('rejects unknown own keys and safely ignores inherited prototype members', () => {
    // Unknown own key: strict reject.
    const unknown = validateAuthority({ taskId: 't', source: 's', evil: true })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.error.field).toBe('evil')

    // Custom prototype (not Object.prototype/null): rejected as non-plain.
    const customProto = validateAuthority(Object.assign(Object.create({ taskId: 'inherited', source: 'inherited' }), {}))
    expect(customProto.ok).toBe(false)

    // "__proto__" as an own key (e.g. from JSON.parse): unknown key, rejected.
    const protoKey = validateAuthority(JSON.parse('{"__proto__": {"taskId":"x"}, "taskId": "t", "source": "s"}'))
    expect(protoKey.ok).toBe(false)
    if (!protoKey.ok) expect(protoKey.error.field).toBe('__proto__')

    // Prototype-free object with valid own fields is accepted.
    const nullProto: Record<string, unknown> = Object.create(null)
    nullProto.taskId = 't'
    nullProto.source = 's'
    expect(validateAuthority(nullProto).ok).toBe(true)
  })

  it('fails closed (without throwing) on unknown runtime input shapes', () => {
    for (const input of ['a string', 42, true, [], null, undefined, new Date()]) {
      const result = validateAuthority(input)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe(
          input === undefined || input === null ? 'AUTHORITY_UNAVAILABLE' : 'INVALID_AUTHORITY',
        )
      }
    }
  })

  it('validates observedAt as a parseable date string', () => {
    expect(validateAuthority({ taskId: 't', source: 's', observedAt: 'not-a-date' }).ok).toBe(false)
    expect(validateAuthority({ taskId: 't', source: 's', observedAt: '2026-08-14T00:00:00Z' }).ok).toBe(true)
  })
})
