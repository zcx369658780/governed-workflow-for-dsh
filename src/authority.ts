/**
 * Provider-neutral authority model, runtime validation, and provider contract.
 *
 * Pure TypeScript with no Cordis/GitHub/network dependency: a future GitHub
 * Issue provider or local task-manifest provider implements the same
 * {@link AuthorityProvider} contract and returns the same validated, deeply
 * immutable {@link AuthoritySnapshot}. The model does not assume the future
 * task source is always GitHub, and it never carries secrets or credentials.
 */

/** A validated, deeply immutable authority snapshot. */
export interface AuthoritySnapshot {
  /** Stable task/authority identifier. */
  readonly taskId: string
  /** Authority source kind (provider identity, e.g. "config"), never credentials. */
  readonly source: string
  /** Repository identity (e.g. "owner/repo"), where applicable. */
  readonly repository?: string
  /** Observed baseline git ref/branch, where applicable. */
  readonly baselineRef?: string
  /** Observed baseline git SHA (7-40 hex), where applicable. */
  readonly baselineSha?: string
  /** Expected dedicated/candidate branch, where applicable. */
  readonly candidateBranch?: string
  /** Allowed mutation path patterns, where applicable. */
  readonly allowedPaths?: readonly string[]
  /** Protected branch names; defaults to `["main"]`. */
  readonly protectedBranches: readonly string[]
  /** Optional human-readable task/source reference. */
  readonly taskReference?: string
  /** Optional observation timestamp (parseable date string), only if deterministic. */
  readonly observedAt?: string
}

/** Machine-readable failure code for authority resolution/validation. */
export type AuthorityErrorCode = 'AUTHORITY_UNAVAILABLE' | 'INVALID_AUTHORITY'

/** Structured failure, shaped for later durable evidence capture. */
export interface AuthorityError {
  readonly code: AuthorityErrorCode
  readonly message: string
  /** The offending field when the failure is field-specific. */
  readonly field?: string
}

/** The explicit success/failure result of an authority resolution. */
export type AuthorityResult =
  | { readonly ok: true; readonly snapshot: AuthoritySnapshot }
  | { readonly ok: false; readonly error: AuthorityError }

/**
 * Provider contract. The governance core depends on this contract, not on any
 * concrete provider. `resolve()` must return a runtime-validated, deeply
 * immutable snapshot on success, or a structured failure; unavailable/invalid
 * authority is fail-closed.
 */
/** Options passed to {@link AuthorityProvider.resolve}. */
export interface AuthorityResolveOptions {
  /** Caller cancellation; a provider may ignore it (fail-closed is enforced at admission). */
  readonly signal?: AbortSignal
}

export interface AuthorityProvider {
  /** Provider identity (e.g. "config", "github-issue"). */
  readonly kind: string
  /** Resolve the current authority, synchronously or asynchronously. */
  resolve(options?: AuthorityResolveOptions): AuthorityResult | PromiseLike<AuthorityResult>
}

/** Field names the snapshot model understands. */
const KNOWN_KEYS = new Set([
  'taskId',
  'source',
  'repository',
  'baselineRef',
  'baselineSha',
  'candidateBranch',
  'allowedPaths',
  'protectedBranches',
  'taskReference',
  'observedAt',
])

const DEFAULT_PROTECTED_BRANCHES = ['main'] as const
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i

/** Characters git ref names may not contain (space, ~, ^, :, ?, *, [, \). */
const REF_FORBIDDEN = ' ~^:?*[\\'

/** A non-empty string with no surrounding whitespace. */
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

/** A plain record whose prototype is `Object.prototype` or `null`. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Validate a git ref name against git-check-ref-format's core rules. */
function isValidRefName(value: string): boolean {
  if (value.length === 0) return false
  if (value.endsWith('.')) return false
  if (value.includes('..') || value.includes('@{')) return false
  for (const component of value.split('/')) {
    if (component.length === 0) return false // leading/trailing/double slash
    if (component.startsWith('.')) return false // a component must not begin with '.'
    if (component.endsWith('.lock')) return false // a component must not end with '.lock'
    for (const ch of component) {
      const code = ch.charCodeAt(0)
      if (code <= 0x20 || code === 0x7f) return false // control chars + space
      if (REF_FORBIDDEN.includes(ch)) return false
    }
  }
  return true
}

/**
 * True for a dense (hole-free) array whose every element is a non-blank string
 * passing `check`. Unlike `Array.prototype.every`, this walks numeric indices
 * so a sparse array (e.g. `Array(1)`) fails instead of being silently skipped
 * and then materializing `undefined` when copied.
 */
function isDenseStringArray(value: unknown, check: (item: string) => boolean): value is readonly string[] {
  if (!Array.isArray(value)) return false
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return false // sparse hole
    const element = value[index]
    if (!isNonBlankString(element) || !check(element)) return false
  }
  return true
}

/** Build a frozen `AuthorityResult` failure with an optional field. */
export function authorityFailure(code: AuthorityErrorCode, message: string, field?: string): AuthorityResult {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze(field === undefined ? { code, message } : { code, message, field }),
  })
}

/**
 * Runtime-validate unknown input as an authority snapshot.
 *
 * Never relies on TypeScript types alone: it checks the prototype chain,
 * rejects unknown own keys, validates every field, and returns a freshly built,
 * deeply frozen snapshot (object and every array). Inherited/prototype-chain
 * keys are not visible to `Object.keys` and are therefore safely ignored, while
 * unknown own keys are rejected fail-closed.
 *
 * @param input - untrusted input: config, another plugin, or version-skewed JS.
 * @returns an immutable snapshot on success, or a structured failure.
 */
export function validateAuthority(input: unknown): AuthorityResult {
  if (input === undefined || input === null) {
    return authorityFailure('AUTHORITY_UNAVAILABLE', 'no authority configured')
  }
  if (!isPlainRecord(input)) {
    return authorityFailure('INVALID_AUTHORITY', 'authority must be a plain object')
  }

  // Strict: reject unknown own keys (inherited keys are already invisible here).
  for (const key of Object.keys(input)) {
    if (!KNOWN_KEYS.has(key)) {
      return authorityFailure('INVALID_AUTHORITY', `unexpected field "${key}"`, key)
    }
  }

  const taskId = input.taskId
  if (!isNonBlankString(taskId)) {
    return authorityFailure('INVALID_AUTHORITY', 'taskId must be a non-blank string', 'taskId')
  }

  const source = input.source
  if (!isNonBlankString(source)) {
    return authorityFailure('INVALID_AUTHORITY', 'source must be a non-blank string', 'source')
  }

  const repository = input.repository
  if (repository !== undefined && !isNonBlankString(repository)) {
    return authorityFailure('INVALID_AUTHORITY', 'repository must be a non-blank string', 'repository')
  }

  const baselineRef = input.baselineRef
  if (baselineRef !== undefined && (!isNonBlankString(baselineRef) || !isValidRefName(baselineRef))) {
    return authorityFailure('INVALID_AUTHORITY', 'baselineRef must be a valid git ref name', 'baselineRef')
  }

  const baselineSha = input.baselineSha
  if (baselineSha !== undefined && (!isNonBlankString(baselineSha) || !SHA_PATTERN.test(baselineSha))) {
    return authorityFailure('INVALID_AUTHORITY', 'baselineSha must be a 7-40 hex git SHA', 'baselineSha')
  }

  const candidateBranch = input.candidateBranch
  if (candidateBranch !== undefined && (!isNonBlankString(candidateBranch) || !isValidRefName(candidateBranch))) {
    return authorityFailure('INVALID_AUTHORITY', 'candidateBranch must be a valid git ref name', 'candidateBranch')
  }

  const allowedPaths = input.allowedPaths
  if (allowedPaths !== undefined && !isDenseStringArray(allowedPaths, () => true)) {
    return authorityFailure('INVALID_AUTHORITY', 'allowedPaths must be a dense array of non-blank strings', 'allowedPaths')
  }

  const protectedBranches = input.protectedBranches
  if (protectedBranches !== undefined && !isDenseStringArray(protectedBranches, isValidRefName)) {
    return authorityFailure('INVALID_AUTHORITY', 'protectedBranches must be a dense array of valid git ref names', 'protectedBranches')
  }

  const taskReference = input.taskReference
  if (taskReference !== undefined && !isNonBlankString(taskReference)) {
    return authorityFailure('INVALID_AUTHORITY', 'taskReference must be a non-blank string', 'taskReference')
  }

  const observedAt = input.observedAt
  if (observedAt !== undefined && (typeof observedAt !== 'string' || Number.isNaN(Date.parse(observedAt)))) {
    return authorityFailure('INVALID_AUTHORITY', 'observedAt must be a parseable date string', 'observedAt')
  }

  const snapshot: AuthoritySnapshot = Object.freeze({
    taskId,
    source,
    ...(repository !== undefined ? { repository } : {}),
    ...(baselineRef !== undefined ? { baselineRef } : {}),
    ...(baselineSha !== undefined ? { baselineSha } : {}),
    ...(candidateBranch !== undefined ? { candidateBranch } : {}),
    ...(allowedPaths !== undefined ? { allowedPaths: Object.freeze([...allowedPaths]) } : {}),
    protectedBranches: Object.freeze([...(protectedBranches ?? DEFAULT_PROTECTED_BRANCHES)]),
    ...(taskReference !== undefined ? { taskReference } : {}),
    ...(observedAt !== undefined ? { observedAt } : {}),
  })

  return Object.freeze({ ok: true as const, snapshot })
}

/**
 * Normalize a provider-reported failure envelope. A well-formed
 * `{ code, message }` is preserved (frozen); anything else becomes a canonical
 * malformed-failure error.
 */
function normalizeProviderError(rawError: unknown): AuthorityError {
  if (isPlainRecord(rawError)) {
    const code = rawError.code
    const message = rawError.message
    if ((code === 'AUTHORITY_UNAVAILABLE' || code === 'INVALID_AUTHORITY') && isNonBlankString(message)) {
      return Object.freeze({ code, message })
    }
  }
  return Object.freeze({ code: 'INVALID_AUTHORITY' as const, message: 'provider returned a malformed failure envelope' })
}

/**
 * Normalize an untrusted provider result at the governance admission boundary.
 *
 * A provider's `resolve()` return is treated as untyped runtime data: the
 * envelope shape is checked, a success snapshot is re-validated through
 * `validateAuthority()`, and provenance is enforced — a snapshot's `source`
 * must equal the provider's nonblank `kind`, so a provider cannot silently
 * claim another source. Malformed envelopes, invalid snapshots, and
 * source/kind mismatches all fail closed.
 */
export function normalizeProviderResult(raw: unknown, kind: string): AuthorityResult {
  if (!isPlainRecord(raw)) {
    return authorityFailure('INVALID_AUTHORITY', 'provider returned a malformed result envelope')
  }
  if (raw.ok === true) {
    const canonical = validateAuthority(raw.snapshot)
    if (!canonical.ok) {
      return canonical
    }
    if (canonical.snapshot.source !== kind) {
      return authorityFailure(
        'INVALID_AUTHORITY',
        `snapshot source "${canonical.snapshot.source}" does not match provider kind "${kind}"`,
        'source',
      )
    }
    return canonical
  }
  if (raw.ok === false) {
    return Object.freeze({ ok: false as const, error: normalizeProviderError(raw.error) })
  }
  return authorityFailure('INVALID_AUTHORITY', 'provider returned a malformed result envelope')
}
