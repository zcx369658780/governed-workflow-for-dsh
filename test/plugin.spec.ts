import { describe, expect, it } from 'vitest'
import { apply, name } from '../src/index.js'

describe('dsh-governed-workflow plugin (V0 bootstrap)', () => {
  it('exports the stable plugin name', () => {
    expect(name).toBe('governed-workflow')
  })

  it('loads through apply and registers one reversible effect', () => {
    const disposers: Array<() => void> = []
    const ctx = {
      effect(fn: () => () => void): () => void {
        const disposer = fn()
        disposers.push(disposer)
        return disposer
      },
    }

    // `ctx` is a minimal stand-in for the full Cordis Context; the plugin's
    // V0 `apply` only touches `ctx.effect`.
    expect(() => apply(ctx as never)).not.toThrow()
    expect(disposers).toHaveLength(1)
    expect(disposers[0]).toBeTypeOf('function')
    // The disposer is a no-op in V0 and must run cleanly.
    expect(() => disposers[0]()).not.toThrow()
  })
})
