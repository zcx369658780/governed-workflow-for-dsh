import {
  validateAuthority,
  type AuthorityProvider,
  type AuthorityResolveOptions,
  type AuthorityResult,
} from './authority.js'

/**
 * Offline reference provider: the authority snapshot is supplied through
 * plugin configuration and runtime-validated on resolution.
 *
 * This dogfoods DSH plugin configuration and gives deterministic unit/load
 * smoke tests (and later tool-guard work) a real authority source without
 * GitHub credentials or network access. It is a reference/bootstrap provider,
 * not the final GitHub workflow integration, and it must never embed personal
 * paths, tokens, or credentials in defaults or examples.
 */
export class ConfigAuthorityProvider implements AuthorityProvider {
  readonly kind = 'config'

  /**
   * @param raw - the raw `authority` value from plugin configuration.
   */
  constructor(private readonly raw: unknown) {}

  resolve(_options?: AuthorityResolveOptions): AuthorityResult {
    return validateAuthority(this.raw)
  }
}
