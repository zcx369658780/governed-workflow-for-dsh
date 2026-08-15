//#region src/authority.ts
/** Field names the snapshot model understands. */
const KNOWN_KEYS = /* @__PURE__ */ new Set([
	"taskId",
	"source",
	"repository",
	"baselineRef",
	"baselineSha",
	"candidateBranch",
	"allowedPaths",
	"protectedBranches",
	"taskReference",
	"observedAt"
]);
const DEFAULT_PROTECTED_BRANCHES = ["main"];
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
/** Characters git ref names may not contain (space, ~, ^, :, ?, *, [, \). */
const REF_FORBIDDEN = " ~^:?*[\\";
/** A non-empty string with no surrounding whitespace. */
function isNonBlankString(value) {
	return typeof value === "string" && value.length > 0 && value.trim() === value;
}
/** A plain record whose prototype is `Object.prototype` or `null`. */
function isPlainRecord(value) {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
/** Validate a git ref name against git-check-ref-format's core rules. */
function isValidRefName(value) {
	if (value.length === 0) return false;
	if (value.endsWith(".")) return false;
	if (value.includes("..") || value.includes("@{")) return false;
	for (const component of value.split("/")) {
		if (component.length === 0) return false;
		if (component.startsWith(".")) return false;
		if (component.endsWith(".lock")) return false;
		for (const ch of component) {
			const code = ch.charCodeAt(0);
			if (code <= 32 || code === 127) return false;
			if (REF_FORBIDDEN.includes(ch)) return false;
		}
	}
	return true;
}
/**
* True for a dense (hole-free) array whose every element is a non-blank string
* passing `check`. Unlike `Array.prototype.every`, this walks numeric indices
* so a sparse array (e.g. `Array(1)`) fails instead of being silently skipped
* and then materializing `undefined` when copied.
*/
function isDenseStringArray(value, check) {
	if (!Array.isArray(value)) return false;
	for (let index = 0; index < value.length; index += 1) {
		if (!(index in value)) return false;
		const element = value[index];
		if (!isNonBlankString(element) || !check(element)) return false;
	}
	return true;
}
/** Build a frozen `AuthorityResult` failure with an optional field. */
function authorityFailure(code, message, field) {
	return Object.freeze({
		ok: false,
		error: Object.freeze(field === void 0 ? {
			code,
			message
		} : {
			code,
			message,
			field
		})
	});
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
function validateAuthority(input) {
	if (input === void 0 || input === null) return authorityFailure("AUTHORITY_UNAVAILABLE", "no authority configured");
	if (!isPlainRecord(input)) return authorityFailure("INVALID_AUTHORITY", "authority must be a plain object");
	for (const key of Object.keys(input)) if (!KNOWN_KEYS.has(key)) return authorityFailure("INVALID_AUTHORITY", `unexpected field "${key}"`, key);
	const taskId = input.taskId;
	if (!isNonBlankString(taskId)) return authorityFailure("INVALID_AUTHORITY", "taskId must be a non-blank string", "taskId");
	const source = input.source;
	if (!isNonBlankString(source)) return authorityFailure("INVALID_AUTHORITY", "source must be a non-blank string", "source");
	const repository = input.repository;
	if (repository !== void 0 && !isNonBlankString(repository)) return authorityFailure("INVALID_AUTHORITY", "repository must be a non-blank string", "repository");
	const baselineRef = input.baselineRef;
	if (baselineRef !== void 0 && (!isNonBlankString(baselineRef) || !isValidRefName(baselineRef))) return authorityFailure("INVALID_AUTHORITY", "baselineRef must be a valid git ref name", "baselineRef");
	const baselineSha = input.baselineSha;
	if (baselineSha !== void 0 && (!isNonBlankString(baselineSha) || !SHA_PATTERN.test(baselineSha))) return authorityFailure("INVALID_AUTHORITY", "baselineSha must be a 7-40 hex git SHA", "baselineSha");
	const candidateBranch = input.candidateBranch;
	if (candidateBranch !== void 0 && (!isNonBlankString(candidateBranch) || !isValidRefName(candidateBranch))) return authorityFailure("INVALID_AUTHORITY", "candidateBranch must be a valid git ref name", "candidateBranch");
	const allowedPaths = input.allowedPaths;
	if (allowedPaths !== void 0 && !isDenseStringArray(allowedPaths, () => true)) return authorityFailure("INVALID_AUTHORITY", "allowedPaths must be a dense array of non-blank strings", "allowedPaths");
	const protectedBranches = input.protectedBranches;
	if (protectedBranches !== void 0 && !isDenseStringArray(protectedBranches, isValidRefName)) return authorityFailure("INVALID_AUTHORITY", "protectedBranches must be a dense array of valid git ref names", "protectedBranches");
	const taskReference = input.taskReference;
	if (taskReference !== void 0 && !isNonBlankString(taskReference)) return authorityFailure("INVALID_AUTHORITY", "taskReference must be a non-blank string", "taskReference");
	const observedAt = input.observedAt;
	if (observedAt !== void 0 && (typeof observedAt !== "string" || Number.isNaN(Date.parse(observedAt)))) return authorityFailure("INVALID_AUTHORITY", "observedAt must be a parseable date string", "observedAt");
	const snapshot = Object.freeze({
		taskId,
		source,
		...repository !== void 0 ? { repository } : {},
		...baselineRef !== void 0 ? { baselineRef } : {},
		...baselineSha !== void 0 ? { baselineSha } : {},
		...candidateBranch !== void 0 ? { candidateBranch } : {},
		...allowedPaths !== void 0 ? { allowedPaths: Object.freeze([...allowedPaths]) } : {},
		protectedBranches: Object.freeze([...protectedBranches ?? DEFAULT_PROTECTED_BRANCHES]),
		...taskReference !== void 0 ? { taskReference } : {},
		...observedAt !== void 0 ? { observedAt } : {}
	});
	return Object.freeze({
		ok: true,
		snapshot
	});
}
/**
* Normalize a provider-reported failure envelope. A well-formed
* `{ code, message }` is preserved (frozen); anything else becomes a canonical
* malformed-failure error.
*/
function normalizeProviderError(rawError) {
	if (isPlainRecord(rawError)) {
		const code = rawError.code;
		const message = rawError.message;
		if ((code === "AUTHORITY_UNAVAILABLE" || code === "INVALID_AUTHORITY") && isNonBlankString(message)) return Object.freeze({
			code,
			message
		});
	}
	return Object.freeze({
		code: "INVALID_AUTHORITY",
		message: "provider returned a malformed failure envelope"
	});
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
function normalizeProviderResult(raw, kind) {
	if (!isPlainRecord(raw)) return authorityFailure("INVALID_AUTHORITY", "provider returned a malformed result envelope");
	if (raw.ok === true) {
		const canonical = validateAuthority(raw.snapshot);
		if (!canonical.ok) return canonical;
		if (canonical.snapshot.source !== kind) return authorityFailure("INVALID_AUTHORITY", `snapshot source "${canonical.snapshot.source}" does not match provider kind "${kind}"`, "source");
		return canonical;
	}
	if (raw.ok === false) return Object.freeze({
		ok: false,
		error: normalizeProviderError(raw.error)
	});
	return authorityFailure("INVALID_AUTHORITY", "provider returned a malformed result envelope");
}
//#endregion
export { normalizeProviderResult as n, validateAuthority as r, authorityFailure as t };
