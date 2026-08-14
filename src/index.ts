/**
 * dsh-governed-workflow package entry.
 *
 * The default export is the Cordis `GovernanceService` class; the bundle row
 * `name: dsh-governed-workflow` mounts it as a class plugin, providing
 * `ctx.governance`. The lifecycle vocabulary, authority model/validation, the
 * config-backed provider, and the V0.3 evidence vocabulary/recorder/projection
 * are re-exported for in-repo consumers and future governance modules.
 */
export { default } from './governance.js'
export * from './governance.js'
export * from './lifecycle.js'
export * from './authority.js'
export * from './config-provider.js'
export * from './evidence.js'
export * from './evidence-service.js'
export * from './guard.js'
export * from './guard-service.js'
