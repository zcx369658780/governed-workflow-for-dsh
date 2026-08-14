import type { Context } from '@deepseek-ai/cordis'

/**
 * Cordis plugin identity. The bundle patch above addresses this row by
 * `id: governed-workflow`; this is the plugin name the loader records.
 */
export const name = 'governed-workflow'

/**
 * V0 bootstrap plugin: proves the installable/loadable skeleton without
 * implementing any governance logic. The only observable behavior is a load
 * marker and one reversible effect, matching the official `hello-plugin`
 * tutorial's minimal contract.
 *
 * Later tasks mount the real modules here — Governance Service, Authority
 * Provider, hard tool guard, evidence observer, and the governed-builder
 * Skill. None of that belongs in V0.
 *
 * @param ctx - Cordis context carrying the shared services.
 */
export function apply(ctx: Context): void {
  // Bootstrap load marker (the official tutorial's pattern; the load smoke
  // test observes this line).
  console.log('[governed-workflow] plugin loaded')

  ctx.effect(() => {
    // Reserved effect scope for future governance registrations. Returning a
    // disposer demonstrates the reversible-effect contract: the loader will
    // call it on unload.
    return () => {}
  })
}
