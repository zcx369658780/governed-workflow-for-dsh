import { Service } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/lifecycle-tool-service.ts
/**
* V0.9 model-facing builder lifecycle tools.
*
* Registers exactly two bounded, fiber-owned tools on the normal ToolRuntime:
*
* - `governance_status`  — read-only governance state summary;
* - `governance_transition` — apply one builder-authorized lifecycle action
*   through the canonical `ctx.governance.apply()` state machine.
*
* These tools make the accepted lifecycle usable in a model-driven Builder
* session WITHOUT granting acceptance/reviewer authority: there is no
* `OBSERVE_AUTHORITY` action, no `ACCEPTED` state/action, and no ability to
* create/replace authority, bypass the guard, or touch Git/GitHub state. The
* transition tool only delegates to the existing state machine — it duplicates
* no transition logic. The status tool never mutates state and exposes only
* bounded non-secret metadata.
*/
/** Model-facing tool names (exact, stable). */
const GOVERNANCE_STATUS_TOOL = "governance_status";
const GOVERNANCE_TRANSITION_TOOL = "governance_transition";
/**
* The only builder-authorized transitions a model may request. `OBSERVE_AUTHORITY`
* is deliberately absent: authority observation remains provider/governance-owned,
* and there is no `ACCEPTED` action anywhere.
*/
const BUILDER_TRANSITION_ACTIONS = [
	"ADMIT_TASK",
	"RUN",
	"BLOCK",
	"COMPLETE",
	"SUBMIT_REVIEW"
];
const STATUS_OUTPUT_SCHEMA = {
	type: "object",
	properties: {
		state: { type: "string" },
		authorityAccepted: { type: "boolean" },
		taskId: { oneOf: [{ type: "string" }, { type: "null" }] },
		lastAction: { oneOf: [{ type: "string" }, { type: "null" }] },
		lastOk: { oneOf: [{ type: "boolean" }, { type: "null" }] },
		lastFrom: { oneOf: [{ type: "string" }, { type: "null" }] },
		lastTo: { oneOf: [{ type: "string" }, { type: "null" }] }
	},
	additionalProperties: false
};
const TRANSITION_OUTPUT_SCHEMA = {
	type: "object",
	properties: {
		ok: { type: "boolean" },
		from: { type: "string" },
		action: { type: "string" },
		to: { oneOf: [{ type: "string" }, { type: "null" }] },
		code: { oneOf: [{ type: "string" }, { type: "null" }] },
		message: { oneOf: [{ type: "string" }, { type: "null" }] }
	},
	additionalProperties: false
};
/** Read-only status tool: returns bounded governance metadata, never mutating. */
function defineStatusTool(ctx) {
	return defineTool({
		name: GOVERNANCE_STATUS_TOOL,
		description: "Read the current governed-builder lifecycle state (read-only; never mutates state).",
		parameters: {},
		output: {
			schema: STATUS_OUTPUT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute() {
			const snapshot = ctx.governance.snapshot();
			const authority = snapshot.authority;
			const last = snapshot.lastResult;
			return {
				state: snapshot.state,
				authorityAccepted: authority !== null,
				taskId: authority?.taskId ?? null,
				lastAction: last?.action ?? null,
				lastOk: last?.ok ?? null,
				lastFrom: last?.from ?? null,
				lastTo: last !== null && last.ok ? last.to : null
			};
		}
	});
}
/** Transition tool: delegates one builder-authorized action to the canonical state machine. */
function defineTransitionTool(ctx) {
	return defineTool({
		name: GOVERNANCE_TRANSITION_TOOL,
		description: "Apply one builder-authorized lifecycle transition: ADMIT_TASK, RUN, BLOCK, COMPLETE, or SUBMIT_REVIEW.",
		parameters: { action: {
			type: "string",
			enum: BUILDER_TRANSITION_ACTIONS,
			required: true
		} },
		output: {
			schema: TRANSITION_OUTPUT_SCHEMA,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		async execute(args) {
			const result = ctx.governance.apply(args.action);
			if (result.ok) return {
				ok: true,
				from: result.from,
				action: result.action,
				to: result.to,
				code: null,
				message: null
			};
			return {
				ok: false,
				from: result.from,
				action: result.action,
				to: null,
				code: result.error.code,
				message: result.error.message
			};
		}
	});
}
/**
* Registers the two model-facing lifecycle tools (fiber-owned via the normal
* ToolRuntime registry). No second ToolRuntime, no custom dispatch path, no
* authority/acceptance escalation, and no network/filesystem/Git/GitHub work.
*/
var LifecycleToolService = class extends Service {
	static inject = ["tools", "governance"];
	constructor(ctx) {
		super(ctx, "governanceLifecycleTools");
		ctx.tools.register(defineStatusTool(ctx));
		ctx.tools.register(defineTransitionTool(ctx));
		console.log("[governed-workflow] lifecycle tools registered (governance_status, governance_transition)");
	}
};
//#endregion
export { BUILDER_TRANSITION_ACTIONS, GOVERNANCE_STATUS_TOOL, GOVERNANCE_TRANSITION_TOOL, LifecycleToolService, LifecycleToolService as default };
