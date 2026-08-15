import { r as validateAuthority } from "./authority-Cq3uspKj.js";
import { Service } from "@deepseek-ai/cordis";
//#region src/lifecycle.ts
/**
* Pure, Cordis-independent builder-side lifecycle state machine.
*
* This module carries no DSH/Cordis/GitHub imports so it can be unit-tested
* without booting anything, and so the transition logic stays fully separable
* from service plumbing.
*
* V0.1 builder lifecycle:
*
*   UNINITIALIZED
*     -> AUTHORITY_OBSERVED
*     -> TASK_ADMITTED
*     -> RUNNING
*     -> BLOCKED | COMPLETED
*     -> REVIEW_PENDING
*
* There is deliberately **no** builder-authorized `ACCEPTED` state or
* transition: acceptance belongs to the reviewer/owner, never to the builder.
* `BLOCKED` is a legitimate terminal builder outcome (it may be submitted to
* review), not an exception that authorizes continuation.
*/
const LIFECYCLE_STATES = [
	"UNINITIALIZED",
	"AUTHORITY_OBSERVED",
	"TASK_ADMITTED",
	"RUNNING",
	"BLOCKED",
	"COMPLETED",
	"REVIEW_PENDING"
];
const LIFECYCLE_ACTIONS = [
	"OBSERVE_AUTHORITY",
	"ADMIT_TASK",
	"RUN",
	"BLOCK",
	"COMPLETE",
	"SUBMIT_REVIEW"
];
/** Stable machine-readable code for a rejected transition. */
const INVALID_TRANSITION = "INVALID_TRANSITION";
/**
* The single source of truth for the V0.1 transition table. An absent entry is
* an invalid (fail-closed) transition.
*/
const TRANSITIONS = {
	UNINITIALIZED: { OBSERVE_AUTHORITY: "AUTHORITY_OBSERVED" },
	AUTHORITY_OBSERVED: { ADMIT_TASK: "TASK_ADMITTED" },
	TASK_ADMITTED: { RUN: "RUNNING" },
	RUNNING: {
		BLOCK: "BLOCKED",
		COMPLETE: "COMPLETED"
	},
	BLOCKED: { SUBMIT_REVIEW: "REVIEW_PENDING" },
	COMPLETED: { SUBMIT_REVIEW: "REVIEW_PENDING" },
	REVIEW_PENDING: {}
};
/**
* The next state for `action` from `from`, or `undefined` when the transition
* is not allowed. Pure: no mutation, no I/O.
*
* Own-property checks fail closed against prototype-chain lookups: a plain
* `TRANSITIONS[from][action]` would resolve inherited `Object.prototype`
* members (`"constructor"`, `"toString"`, `"hasOwnProperty"`, …) for untyped or
* version-skewed callers instead of returning `undefined`, which would let a
* hostile action name masquerade as a valid transition.
*/
function nextState(from, action) {
	if (!Object.hasOwn(TRANSITIONS, from)) return void 0;
	const rows = TRANSITIONS[from];
	return Object.hasOwn(rows, action) ? rows[action] : void 0;
}
/**
* Attempt a deterministic, fail-closed transition. Returns an immutable result:
* on success it carries `to`; on failure it carries a structured error and
* leaves any caller-held state untouched (it never mutates external state).
*/
function transition(from, action) {
	const to = nextState(from, action);
	if (to !== void 0) return Object.freeze({
		ok: true,
		from,
		action,
		to
	});
	return Object.freeze({
		ok: false,
		from,
		action,
		error: Object.freeze({
			code: INVALID_TRANSITION,
			from,
			action,
			message: `invalid transition: cannot apply ${action} from ${from}`
		})
	});
}
//#endregion
//#region src/evidence.ts
/**
* Governance evidence vocabulary (V0.3). Merge-extensible `SessionEventMap`
* members, all non-surface (log-only) and append-only. Payloads contain only
* canonical/sanitized data — never raw provider output, secrets, or caller-owned
* mutable objects.
*
* `append` does not accept an `ignorable` flag in the current DSH, so these
* events are unmarked (required). See the compatibility doc for the
* reconstruction implication.
*/
/** Evidence schema version stamped into every governance event. */
const EVIDENCE_SCHEMA_VERSION = 1;
/** The V0.3 governance event types this projector validates (fail-closed). */
const RECOGNIZED_GOVERNANCE_TYPES = /* @__PURE__ */ new Set([
	"governance/authority-observed",
	"governance/authority-rejected",
	"governance/lifecycle-transition"
]);
/** Upper bound for human-readable failure messages recorded as evidence. */
const MAX_MESSAGE_LENGTH = 512;
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
/** Bound a failure message, truncating overlong strings. */
function boundMessage(message) {
	return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
}
/** True when the record has no own keys beyond the allowed set. */
function ownKeysExactly(value, allowed) {
	const allowedSet = new Set(allowed);
	return Object.keys(value).every((key) => allowedSet.has(key));
}
function isLifecycleState(value) {
	return typeof value === "string" && LIFECYCLE_STATES.includes(value);
}
function isLifecycleAction(value) {
	return typeof value === "string" && LIFECYCLE_ACTIONS.includes(value);
}
/**
* Build a canonical `governance/authority-observed` payload, re-validating the
* snapshot through the canonical validator so only a detached, frozen
* `AuthoritySnapshot` is recorded (never a caller-owned mutable object).
* Throws on invalid input — the caller must not have appended anything.
*/
function buildAuthorityObservedPayload(input) {
	const result = validateAuthority(input);
	if (!result.ok) throw new Error(`governance evidence: invalid authority snapshot: ${result.error.message}`);
	return Object.freeze({
		schemaVersion: 1,
		authority: result.snapshot
	});
}
/**
* Build a sanitized `governance/authority-rejected` payload. Only canonical
* fields are kept (bounded message); no rejected raw object is recorded.
* Throws on invalid input.
*/
function buildAuthorityRejectedPayload(input) {
	if (!isPlainRecord(input)) throw new Error("governance evidence: authority-rejected input must be a plain object");
	const code = input.code;
	if (code !== "AUTHORITY_UNAVAILABLE" && code !== "INVALID_AUTHORITY") throw new Error("governance evidence: authority-rejected requires a canonical authority error code");
	const message = input.message;
	if (!isNonBlankString(message)) throw new Error("governance evidence: authority-rejected requires a non-blank message");
	const providerKind = input.providerKind;
	if (providerKind !== void 0 && !isNonBlankString(providerKind)) throw new Error("governance evidence: authority-rejected providerKind must be a non-blank string");
	const field = input.field;
	if (field !== void 0 && !isNonBlankString(field)) throw new Error("governance evidence: authority-rejected field must be a non-blank string");
	return Object.freeze({
		schemaVersion: 1,
		...providerKind !== void 0 ? { providerKind } : {},
		code,
		...field !== void 0 ? { field } : {},
		message: boundMessage(message)
	});
}
/**
* Build a canonical `governance/lifecycle-transition` payload. Throws on
* malformed/untyped runtime input so a bad value can never corrupt the log.
*/
function buildLifecycleTransitionPayload(input) {
	if (!isPlainRecord(input)) throw new Error("governance evidence: lifecycle-transition input must be a plain object");
	const from = input.from;
	if (!isLifecycleState(from)) throw new Error("governance evidence: lifecycle-transition requires a valid from state");
	const action = input.action;
	if (!isLifecycleAction(action)) throw new Error("governance evidence: lifecycle-transition requires a valid action");
	const ok = input.ok;
	if (typeof ok !== "boolean") throw new Error("governance evidence: lifecycle-transition requires a boolean ok");
	if (ok) {
		const to = input.to;
		if (!isLifecycleState(to)) throw new Error("governance evidence: lifecycle-transition success requires a valid to state");
		if (nextState(from, action) !== to) throw new Error(`governance evidence: lifecycle-transition claims an impossible transition ${from} --${action}--> ${to}`);
		return Object.freeze({
			schemaVersion: 1,
			from,
			action,
			ok: true,
			to
		});
	}
	if (nextState(from, action) !== void 0) throw new Error(`governance evidence: lifecycle-transition claims a failure for a valid transition ${from} --${action}`);
	const error = input.error;
	if (!isPlainRecord(error) || error.code !== "INVALID_TRANSITION" || !isNonBlankString(error.message)) throw new Error("governance evidence: lifecycle-transition failure requires code INVALID_TRANSITION and a non-blank message");
	return Object.freeze({
		schemaVersion: 1,
		from,
		action,
		ok: false,
		error: Object.freeze({
			code: error.code,
			message: boundMessage(error.message)
		})
	});
}
function isAuthorityObservedData(value) {
	if (!isPlainRecord(value) || value.schemaVersion !== 1) return false;
	if (!ownKeysExactly(value, ["schemaVersion", "authority"])) return false;
	return validateAuthority(value.authority).ok;
}
function isAuthorityRejectedData(value) {
	if (!isPlainRecord(value) || value.schemaVersion !== 1) return false;
	if (!ownKeysExactly(value, [
		"schemaVersion",
		"providerKind",
		"code",
		"field",
		"message"
	])) return false;
	const code = value.code;
	if (code !== "AUTHORITY_UNAVAILABLE" && code !== "INVALID_AUTHORITY") return false;
	if (!isNonBlankString(value.message)) return false;
	if (value.providerKind !== void 0 && !isNonBlankString(value.providerKind)) return false;
	if (value.field !== void 0 && !isNonBlankString(value.field)) return false;
	return true;
}
function isLifecycleTransitionData(value) {
	if (!isPlainRecord(value) || value.schemaVersion !== 1) return false;
	if (!isLifecycleState(value.from) || !isLifecycleAction(value.action)) return false;
	if (value.ok === true) {
		if (!ownKeysExactly(value, [
			"schemaVersion",
			"from",
			"action",
			"ok",
			"to"
		])) return false;
		if (!isLifecycleState(value.to)) return false;
		return nextState(value.from, value.action) === value.to;
	}
	if (value.ok === false) {
		if (!ownKeysExactly(value, [
			"schemaVersion",
			"from",
			"action",
			"ok",
			"error"
		])) return false;
		if (nextState(value.from, value.action) !== void 0) return false;
		const error = value.error;
		if (!isPlainRecord(error) || !ownKeysExactly(error, ["code", "message"])) return false;
		return error.code === "INVALID_TRANSITION" && isNonBlankString(error.message);
	}
	return false;
}
/** Narrow a session event to a well-formed governance evidence event. */
function isGovernanceEvidenceEvent(event) {
	switch (event.type) {
		case "governance/authority-observed": return isAuthorityObservedData(event.data);
		case "governance/authority-rejected": return isAuthorityRejectedData(event.data);
		case "governance/lifecycle-transition": return isLifecycleTransitionData(event.data);
		default: return false;
	}
}
/**
* Project a session's raw append-only events down to governance evidence in
* sequence order, ignoring unrelated events (including future/unknown
* `governance/*` types, which this V0.3 projector does not yet own). Only the
* recognized V0.3 types are validated, and a recognized event with malformed
* data fails closed (throws) rather than fabricating facts.
*/
function projectEvidence(events) {
	const result = [];
	for (const event of events) {
		if (!(typeof event.type === "string" && RECOGNIZED_GOVERNANCE_TYPES.has(event.type))) continue;
		if (!isGovernanceEvidenceEvent(event)) throw new Error(`governance evidence: malformed ${event.type} event at seq ${event.seq}`);
		result.push(event);
	}
	return result;
}
//#endregion
//#region src/evidence-service.ts
/**
* The governance evidence recorder: a typed, non-model-facing Cordis capability
* that appends canonical governance facts to an **explicit** `Session` supplied
* by the caller. It never guesses a global session and never broadcasts into
* every live session.
*
* Recording is append-only; durability is a separate, explicit `flush()` that
* delegates to the verified `ctx.sessions.flush(session)` checkpoint.
*/
var GovernanceEvidenceService = class extends Service {
	static inject = ["sessions"];
	constructor(ctx) {
		super(ctx, "governanceEvidence");
		console.log("[governed-workflow] evidence service loaded");
	}
	/**
	* Record a successfully admitted canonical authority. The snapshot is
	* re-validated and detached, so a caller-owned mutable object can never be
	* recorded (and later mutation cannot affect appended evidence).
	*/
	recordAuthorityObserved(session, snapshot) {
		return session.append("governance/authority-observed", buildAuthorityObservedPayload(snapshot));
	}
	/** Record a structured failed authority observation (no rejected raw payload). */
	recordAuthorityRejected(session, info) {
		return session.append("governance/authority-rejected", buildAuthorityRejectedPayload(info));
	}
	/** Record one lifecycle transition attempt/result. */
	recordLifecycleTransition(session, result) {
		return session.append("governance/lifecycle-transition", buildLifecycleTransitionPayload(result));
	}
	/**
	* Translate an accepted `AuthorityResult` into the matching evidence record.
	* Convenience only: it does not change the result or lifecycle semantics and
	* never triggers a duplicate transition.
	*/
	recordAuthorityResult(session, result, providerKind) {
		if (result.ok) return this.recordAuthorityObserved(session, result.snapshot);
		return this.recordAuthorityRejected(session, {
			providerKind,
			code: result.error.code,
			field: result.error.field,
			message: result.error.message
		});
	}
	/** Project this plugin's governance evidence from a session, in sequence order. */
	project(session) {
		return projectEvidence(session.events);
	}
	/**
	* Request an explicit durability checkpoint for `session` through the verified
	* DSH flush API. Returns whether a durability listener participated; with no
	* persistence backend installed this resolves `false` (no fake guarantee).
	*/
	flush(session) {
		return this.ctx.sessions.flush(session);
	}
};
//#endregion
export { buildLifecycleTransitionPayload as a, INVALID_TRANSITION as c, nextState as d, transition as f, buildAuthorityRejectedPayload as i, LIFECYCLE_ACTIONS as l, EVIDENCE_SCHEMA_VERSION as n, isGovernanceEvidenceEvent as o, buildAuthorityObservedPayload as r, projectEvidence as s, GovernanceEvidenceService as t, LIFECYCLE_STATES as u };
