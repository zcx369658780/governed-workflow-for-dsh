import { a as buildLifecycleTransitionPayload, c as INVALID_TRANSITION, d as nextState, f as transition, i as buildAuthorityRejectedPayload, l as LIFECYCLE_ACTIONS, n as EVIDENCE_SCHEMA_VERSION, o as isGovernanceEvidenceEvent, r as buildAuthorityObservedPayload, s as projectEvidence, t as GovernanceEvidenceService, u as LIFECYCLE_STATES } from "./evidence-service-DBaO3HOd.js";
import { n as normalizeProviderResult, r as validateAuthority, t as authorityFailure } from "./authority-Cq3uspKj.js";
import { a as PROTECTED_MUTATION_TOOLS, i as GOVERNANCE_DENY_TERMINAL_STATE, n as GOVERNANCE_DENY_NOT_RUNNING, o as evaluateGovernanceToolPolicy, r as GOVERNANCE_DENY_NO_AUTHORITY, t as GovernanceToolGuardService } from "./guard-service-3CzllAHc.js";
import { GOVERNED_BUILDER_SKILL_NAME, GovernedBuilderSkill, governedBuilderSkill } from "./governed-builder-skill.js";
import { GITHUB_ACCEPT, GITHUB_API_ORIGIN, GITHUB_API_VERSION, GITHUB_ISSUE_KIND, GITHUB_USER_AGENT, GitHubIssueAuthorityProvider, MAX_BLOCK_BYTES, MAX_RESPONSE_BYTES, buildGitHubIssueUrl, parseV1AuthorityBlock, validateGitHubIssueConfig } from "./github-issue-provider.js";
import { GITHUB_BOOTSTRAP_DEFAULT_TIMEOUT_MS, GITHUB_BOOTSTRAP_MAX_TIMEOUT_MS, GITHUB_BOOTSTRAP_MIN_TIMEOUT_MS, GitHubIssueAuthorityService } from "./github-issue-authority-service.js";
import { BUILDER_TRANSITION_ACTIONS, GOVERNANCE_STATUS_TOOL, GOVERNANCE_TRANSITION_TOOL, LifecycleToolService } from "./lifecycle-tool-service.js";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
//#region src/config-provider.ts
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
var ConfigAuthorityProvider = class {
	raw;
	kind = "config";
	/**
	* @param raw - the raw `authority` value from plugin configuration.
	*/
	constructor(raw) {
		this.raw = raw;
	}
	resolve(_options) {
		return validateAuthority(this.raw);
	}
};
//#endregion
//#region src/governance.ts
/** Whether an optional signal is already aborted (fresh read, no cross-await narrowing). */
function isAborted(signal) {
	return signal !== void 0 && signal.aborted;
}
/**
* Race a provider result against an abort signal, so a provider that ignores
* the signal and never settles cannot hang the observation. The abort listener
* is registered `{ once: true }` and removed on provider settlement, so no
* listener leaks. Rejection on abort is indistinguishable from a provider
* rejection at this layer; the caller disambiguates with `isAborted(signal)`.
*/
function resolveWithAbort(promise, signal) {
	if (signal === void 0) return Promise.resolve(promise);
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(/* @__PURE__ */ new Error("authority observation aborted"));
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
		Promise.resolve(promise).then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(error);
		});
	});
}
/**
* The trusted state core for `dsh-governed-workflow`: a Cordis service holding
* the builder-side lifecycle and the accepted authority. V0.2 adds the
* authority capability — a provider-neutral contract plus a config-backed
* reference provider — while still enforcing nothing on tool calls.
*/
var GovernanceService = class extends Service {
	static Config = z.object({ authority: z.any() });
	currentState = "UNINITIALIZED";
	lastResult = null;
	acceptedAuthoritySnapshot = null;
	provider;
	/**
	* Create and register the service on `ctx.governance`. Registration is
	* performed by the Cordis `Service` base and is automatically undone when
	* the owning fiber unloads.
	* @param ctx - Cordis context that owns the service.
	* @param config - validated plugin configuration.
	*/
	constructor(ctx, config = {}) {
		super(ctx, "governance");
		const configProvider = new ConfigAuthorityProvider(config.authority);
		this.provider = configProvider;
		console.log("[governed-workflow] governance service loaded");
		const observed = this.admitResolvedAuthority(configProvider.kind, configProvider.resolve());
		if (observed.ok) console.log(`[governed-workflow] authority observed: ${observed.snapshot.taskId}`);
		else console.log(`[governed-workflow] authority ${observed.error.code}`);
	}
	/** Return a freshly built, safely copied view of the current state. */
	snapshot() {
		return {
			state: this.currentState,
			lastResult: this.lastResult,
			authority: this.acceptedAuthoritySnapshot
		};
	}
	/** The accepted authority snapshot, or null before a successful observation. */
	acceptedAuthority() {
		return this.acceptedAuthoritySnapshot;
	}
	/**
	* Apply an authorized lifecycle action through the pure state machine.
	* Invalid actions fail closed: the result reports the error and the current
	* state is left untouched.
	* @param action - the lifecycle action to apply.
	* @returns the transition result.
	*/
	apply(action) {
		if (action === "OBSERVE_AUTHORITY") {
			const failure = Object.freeze({
				ok: false,
				from: this.currentState,
				action,
				error: Object.freeze({
					code: INVALID_TRANSITION,
					from: this.currentState,
					action,
					message: "OBSERVE_AUTHORITY requires a validated authority — use observeAuthority()"
				})
			});
			this.lastResult = failure;
			return failure;
		}
		const result = transition(this.currentState, action);
		if (result.ok) this.currentState = result.to;
		this.lastResult = result;
		return result;
	}
	/**
	* Shared canonical admission: normalize/revalidate a resolved provider result
	* and, on success, admit exactly one frozen snapshot through the
	* `OBSERVE_AUTHORITY` boundary. When the lifecycle has already left
	* `UNINITIALIZED` (authority already accepted), a later observation returns a
	* truthful failure and never overwrites the winner.
	*/
	admitResolvedAuthority(providerKind, raw) {
		const result = normalizeProviderResult(raw, providerKind);
		if (!result.ok) return result;
		const transitionResult = transition(this.currentState, "OBSERVE_AUTHORITY");
		if (!transitionResult.ok) {
			this.lastResult = transitionResult;
			return authorityFailure("INVALID_AUTHORITY", "authority is already accepted; a later observation cannot overwrite it");
		}
		this.currentState = transitionResult.to;
		this.acceptedAuthoritySnapshot = result.snapshot;
		this.lastResult = transitionResult;
		return result;
	}
	/**
	* Awaitable, cancellable authority observation. Resolves the provider
	* synchronously or asynchronously, catches sync throws and async rejections,
	* re-checks cancellation after the await and before admission, and admits the
	* canonical frozen snapshot through the single shared admission boundary.
	*
	* Cancellation is fail-closed: an aborted observation never admits authority
	* and never overwrites an already accepted snapshot. A provider that ignores
	* the signal still cannot unlock authority after the caller aborts.
	* @param provider - optional override; defaults to the configured provider.
	* @param options - optional `signal` for cancellation.
	* @returns the normalized explicit success/failure result.
	*/
	async observeAuthority(provider, options = {}) {
		const resolved = provider ?? this.provider;
		const kind = resolved.kind;
		if (typeof kind !== "string" || kind.trim() !== kind || kind.length === 0) return authorityFailure("INVALID_AUTHORITY", "authority provider kind must be a non-blank string");
		const signal = options.signal;
		if (isAborted(signal)) return authorityFailure("INVALID_AUTHORITY", "authority observation was aborted before it began");
		if (this.acceptedAuthoritySnapshot !== null) return authorityFailure("INVALID_AUTHORITY", "authority is already accepted; observation was not started");
		let raw;
		try {
			raw = await resolveWithAbort(resolved.resolve(options), signal);
		} catch {
			if (isAborted(signal)) return authorityFailure("INVALID_AUTHORITY", "authority observation was aborted during resolve()");
			return authorityFailure("INVALID_AUTHORITY", "authority provider threw or rejected during resolve()");
		}
		if (isAborted(signal)) return authorityFailure("INVALID_AUTHORITY", "authority observation was aborted before admission");
		return this.admitResolvedAuthority(kind, raw);
	}
};
//#endregion
export { BUILDER_TRANSITION_ACTIONS, ConfigAuthorityProvider, EVIDENCE_SCHEMA_VERSION, GITHUB_ACCEPT, GITHUB_API_ORIGIN, GITHUB_API_VERSION, GITHUB_BOOTSTRAP_DEFAULT_TIMEOUT_MS, GITHUB_BOOTSTRAP_MAX_TIMEOUT_MS, GITHUB_BOOTSTRAP_MIN_TIMEOUT_MS, GITHUB_ISSUE_KIND, GITHUB_USER_AGENT, GOVERNANCE_DENY_NOT_RUNNING, GOVERNANCE_DENY_NO_AUTHORITY, GOVERNANCE_DENY_TERMINAL_STATE, GOVERNANCE_STATUS_TOOL, GOVERNANCE_TRANSITION_TOOL, GOVERNED_BUILDER_SKILL_NAME, GitHubIssueAuthorityProvider, GitHubIssueAuthorityService, GovernanceEvidenceService, GovernanceService, GovernanceService as default, GovernanceToolGuardService, GovernedBuilderSkill, INVALID_TRANSITION, LIFECYCLE_ACTIONS, LIFECYCLE_STATES, LifecycleToolService, MAX_BLOCK_BYTES, MAX_RESPONSE_BYTES, PROTECTED_MUTATION_TOOLS, authorityFailure, buildAuthorityObservedPayload, buildAuthorityRejectedPayload, buildGitHubIssueUrl, buildLifecycleTransitionPayload, evaluateGovernanceToolPolicy, governedBuilderSkill, isGovernanceEvidenceEvent, nextState, normalizeProviderResult, parseV1AuthorityBlock, projectEvidence, transition, validateAuthority, validateGitHubIssueConfig };
