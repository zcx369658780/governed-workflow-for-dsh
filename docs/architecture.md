# Architecture

This document describes the module boundaries for `dsh-governed-workflow`: what
is implemented, what is designed, and what is deliberately reserved for later
independently authorized tasks.

## Status

**V0.6 governed-builder Skill.** V0 (bootstrap), V0.1 (governance core), V0.2
(authority core), V0.3 (evidence core — durable reload upstream-blocked), V0.4
(Bash runtime guard), and V0.5 (mutation guard expansion) are accepted. This
stage adds the first public `governed-builder` Skill. The plugin is
**authority-capable + evidence-recording + monotonic mutation-tool guard
(`bash` / `write` / `edit`) + `governed-builder` Skill**; durable evidence reload
remains upstream-blocked; path/Git/GitHub hard enforcement and the network
authority provider remain future work.

## Design principle

> **Skills instruct agent behavior; runtime plugins enforce non-bypassable
> invariants.**

The governed workflow is split along this line from the start:

- **Skills** (natural-language instruction, the `governed-builder` Skill) tell
  the agent *how to behave* — guidance the model reads and follows.
- **Runtime plugins** (this package, via Cordis) enforce *invariants that
  cannot be skipped by prompt* — authority resolution, tool guards, and
  evidence capture that hold regardless of what the model is told.

Everything a prompt can be talked out of belongs in the runtime plugin;
everything that is a judgment call belongs in the Skill.

## Current structure

```
package.json              # declares dsh.bundle.patch -> cordis.patch.yml
cordis.patch.yml          # mounts the governance + evidence + guard + skill services
src/index.ts              # package entry: default-exports GovernanceService
src/lifecycle.ts          # pure lifecycle state machine
src/authority.ts          # authority model, runtime validation, provider contract
src/config-provider.ts    # config-backed reference provider (offline)
src/governance.ts         # GovernanceService (ctx.governance) + authority integration
src/evidence.ts           # governance SessionEventMap events, validation, projection
src/evidence-service.ts   # GovernanceEvidenceService (ctx.governanceEvidence)
src/guard.ts              # pure runtime guard policy evaluator (V0.4/V0.5)
src/guard-service.ts      # GovernanceToolGuardService (ctx.governanceGuard)
src/governed-builder-skill.ts  # governed-builder Skill registration
test/*.spec.ts            # offline lifecycle/authority/evidence/guard/skill tests + real-Context tests
tsdown.config.ts          # self-contained ESM transpile (the `prepare` build)
```

## Implemented

| Version | Module | Responsibility |
|---|---|---|
| V0.1 | Lifecycle state machine | Pure, deterministic builder-side states `UNINITIALIZED → AUTHORITY_OBSERVED → TASK_ADMITTED → RUNNING → BLOCKED \| COMPLETED → REVIEW_PENDING`. Invalid transitions fail closed; no builder-authorized `ACCEPTED`. |
| V0.1 | Governance Service (`ctx.governance`) | Holds the lifecycle and authorized transitions. Not a model-facing tool. |
| V0.2 | Authority model + validation | Provider-neutral `AuthoritySnapshot`; `validateAuthority()` rejects missing/invalid fields, unknown keys, malformed arrays, and prototype-chain tricks, returning a deeply frozen snapshot. |
| V0.2 | Authority Provider contract | `AuthorityProvider` with explicit success/failure `resolve()`; the governance core depends on the contract, never a concrete provider. |
| V0.2 | Config-backed reference provider | Offline provider supplied via DSH plugin configuration. Deterministic, credential-free. |
| V0.2 | Governance authority integration | `observeAuthority()` re-validates provider output at admission and advances `UNINITIALIZED → AUTHORITY_OBSERVED` only on valid resolution. |
| V0.3 | Governance evidence vocabulary | Merge-extensible `SessionEventMap` events: `governance/authority-observed`, `governance/authority-rejected`, `governance/lifecycle-transition`. Non-surface, append-only. |
| V0.3 | Evidence recorder (`ctx.governanceEvidence`) | Appends canonical facts to an explicit `Session`; re-validates/sanitizes input; never records raw provider payloads. |
| V0.3 | Evidence projection + flush | `project()` returns governance evidence in sequence order (fails closed on malformed recognized events); `flush()` delegates to the verified `ctx.sessions.flush()` checkpoint. |
| V0.4–V0.5 | Runtime guard policy (`ctx.governanceGuard`) | A single monotonic `ctx.tools.guard()` denying the mutation-capable tools `bash`, `write`, and `edit` with no accepted authority or in a terminal state. Reads live governance state; not model-facing; never mutates arguments, parses Bash, or enforces paths. |
| V0.6 | Governed builder Skill (`governed-builder`) | A runtime-registered, provider-neutral operating procedure for the Builder role. Behavioral guidance only; never advances the lifecycle, installs authority, or unlocks mutation. |

## Evidence events (V0.3)

- `governance/authority-observed` — a successfully admitted canonical authority
  (`{ schemaVersion: 1, authority: AuthoritySnapshot }`).
- `governance/authority-rejected` — a structured failed observation
  (`{ schemaVersion: 1, providerKind?, code, field?, message }`), no raw payload.
- `governance/lifecycle-transition` — one transition attempt/result
  (`{ schemaVersion: 1, from, action, ok, to?, error? }`).

All are non-surface (log-only): they are not in `SurfaceEventType`, so
`Session.deriveMessages()` never projects them into model-visible history.

## Runtime guard (V0.5)

The runtime-enforcing slice uses the verified monotonic `ctx.tools.guard()`
seam. Exactly one guard is registered (owned by its fiber, removed on unload)
and, at each protected mutation-tool call, reads the live `ctx.governance`
snapshot and applies:

- no accepted authority → deny (`GOVERNANCE_DENY_NO_AUTHORITY`);
- terminal state (`BLOCKED` / `COMPLETED` / `REVIEW_PENDING`) → deny
  (`GOVERNANCE_DENY_TERMINAL_STATE`);
- non-terminal state with authority → no opinion (`undefined`).

The exact V0.5 enforcement boundary:

- protects DSH tool calls named `bash`, `write`, and `edit`;
- requires an accepted authority and freezes these mutation tools after
  terminal states;
- **read/discovery tools (`read`, `read_image`, `grep`, `glob`, …) are not
  gated** by this slice — absence of authority prevents mutation, not
  observation;
- does **not** enforce `allowedPaths` / path containment, and does not parse
  Bash for Git semantics, protected-branch, `gh`, or alias/wrapper/subprocess
  behavior;
- does not claim to contain arbitrary same-process code;
- does not protect GitHub/MCP actions;
- does not durably record guard decisions (deferred by the accepted upstream
  SessionEvent blocker) — the guard emits no new `governance/*` SessionEvent.

## Governed builder Skill (V0.6)

The instruction-layer counterpart to the runtime guard: a single
runtime-registered Skill named `governed-builder` (via the verified
`ctx.skills.register()` surface), carrying the provider-neutral operating
procedure for a repository Builder under external task authority. Its semantic
sections cover: role/authority (Builder, not acceptor), read/discovery versus
mutation, task execution discipline, Git/delivery, fail-closed `BLOCKED`
semantics, and the evidence/completion report.

It contains an explicit **runtime enforcement vs guidance** truth section:
runtime-enforced are only the mutation-tool gates (`bash` / `write` / `edit`,
terminal-state freeze, read/discovery not gated); everything else —
protected-branch Git, path allowlists, GitHub merge/close/successor, network
authority fetching, and independent acceptance itself — is behavioral guidance.

Loading or invoking the Skill never advances the governance lifecycle, installs
authority, or unlocks mutation. It adds no `SessionEvent` type.

## Trust model (current boundary)

- **Model and tool calls are untrusted inputs.** Anything the model passes into
  governance is treated as untrusted and runtime-validated.
- **Authority/config/provider outputs must be runtime validated.** TypeScript
  types are not a trust boundary; `validateAuthority()` and
  `normalizeProviderResult()` perform the checks.
- **Evidence APIs validate at admission.** The recorder re-validates/sanitizes
  every payload before `session.append`, so malformed input fails closed and
  never partially appends; caller-owned mutable objects are detached.
- **Same-process third-party plugins with arbitrary JavaScript execution are
  not assumed hostile in V0.x.** Code granted arbitrary in-process execution
  can subvert the process itself.
- **Future runtime guards protect agent/tool behavior**, not malicious code
  already granted arbitrary in-process execution.

## Reserved for later tasks (not implemented)

| Module | Responsibility (future) |
|---|---|
| GitHub Issue / network authority provider | Fetch authority from GitHub; implements the same `AuthorityProvider` contract. |
| Broader Git/path hard enforcement | Extend the V0.5 monotonic guard beyond the `bash`/`write`/`edit` tool names to Git/path/GitHub semantics and Bash-command parsing. |
| Guard allow/deny evidence events | Durable tool-policy decision recording once an upstream-compatible event path exists. |
| Approval integration | Read-only policy advice and approval surfaces. |
| Policy profiles (`strict`, `standard`, `fast`) | Named compositions selectable per session. |
| Reviewer orchestration / successor automation | Multi-agent review and automatic successor creation. |
| Release / npm publication | Publishing automation. |

## Explicit-session recorder boundary

The evidence recorder operates on an **explicit `Session` supplied by the
caller**. It never guesses a global current session and never broadcasts into
every live session. Governance state is currently one plugin-instance/task
context; multi-session orchestration is not yet a solved public API, and V0.3
invents no cross-session broadcasting semantics.

## Append vs persistence-flush

Recording (`session.append`) commits a fact to the authoritative in-memory
session log. `flush()` requests the verified `ctx.sessions.flush()` durability
checkpoint, which only reaches storage if a persistence backend is installed;
with no backend it resolves `false` and claims no disk durability.

**Durable-reload capability boundary (upstream blocker).** The three governance
evidence event types are out-of-repo and therefore outside the first-party
generated `KNOWN_SESSION_EVENT_TYPES` set; `Session.append` exposes no way to
set the envelope `ignorable` marker, and there is no public runtime
registration surface for out-of-repo event types. The first-party
`PersistenceCoordinator.assertEventsSupported()` therefore refuses a persisted
log containing these events — even when this plugin is installed. In-memory
append and direct `Session.create(seed)` replay work; first-party durable
load/resume does not. This is recorded as a terminal upstream capability
blocker (`BLOCKED_UPSTREAM_*`), not as a supported durable guarantee.

## How it plugs into DSH

DSH composes a running tree from ordered `cordis.patch.yml` layers. This package
is a **bundle**: its `package.json` declares `dsh.bundle.patch`, so `dsh plugin
--profile <name> add dsh-governed-workflow` joins the layer stack and its patch
inserts four rows — `governed-workflow` (the `GovernanceService`),
`governed-workflow-evidence` (the `GovernanceEvidenceService`),
`governed-workflow-guard` (the `GovernanceToolGuardService`), and
`governed-workflow-skill` (the `GovernedBuilderSkill`).

## Non-goals for the current task

- GitHub Issue/network authority provider;
- protected-branch Git runtime enforcement;
- `allowedPaths` / canonical path enforcement;
- new filesystem interception policy;
- Bash/Git command parsing (the guard gates tool names, not command semantics);
- GitHub merge/close/successor runtime enforcement;
- durable guard-decision SessionEvents (deferred by the accepted upstream
  SessionEvent blocker);
- workaround for the V0.3 durable-reload blocker;
- approval workflows;
- automatic lifecycle admission/run transitions;
- policy profiles;
- reviewer/multi-agent orchestration;
- successor automation;
- release/npm publication;
- persistence backend;
- dashboard/custom UI.
