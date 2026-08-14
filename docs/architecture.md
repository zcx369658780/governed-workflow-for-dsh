# Architecture

This document describes the module boundaries for `dsh-governed-workflow`: what
is implemented, what is designed, and what is deliberately reserved for later
independently authorized tasks.

## Status

**V0.3 durable evidence core.** V0 (bootstrap), V0.1 (governance core), and
V0.2 (authority core) are accepted. This stage adds the durable audit substrate:
merge-extensible governance session events, a typed evidence recorder targeting
an explicit `Session`, a non-surface projection/audit helper, and an explicit
flush checkpoint. The plugin is **authority-capable + durable governance
evidence, not yet tool-enforcing**.

## Design principle

> **Skills instruct agent behavior; runtime plugins enforce non-bypassable
> invariants.**

The governed workflow is split along this line from the start:

- **Skills** (natural-language instruction, future `governed-builder`) tell the
  agent *how to behave* — guidance the model reads and follows.
- **Runtime plugins** (this package, via Cordis) enforce *invariants that
  cannot be skipped by prompt* — authority resolution, tool guards, and
  evidence capture that hold regardless of what the model is told.

Everything a prompt can be talked out of belongs in the runtime plugin;
everything that is a judgment call belongs in the Skill.

## Current structure

```
package.json              # declares dsh.bundle.patch -> cordis.patch.yml
cordis.patch.yml          # mounts the governance + evidence services
src/index.ts              # package entry: default-exports GovernanceService
src/lifecycle.ts          # pure lifecycle state machine
src/authority.ts          # authority model, runtime validation, provider contract
src/config-provider.ts    # config-backed reference provider (offline)
src/governance.ts         # GovernanceService (ctx.governance) + authority integration
src/evidence.ts           # governance SessionEventMap events, validation, projection
src/evidence-service.ts   # GovernanceEvidenceService (ctx.governanceEvidence)
test/*.spec.ts            # offline lifecycle/authority/evidence tests + real-Context tests
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

## Evidence events (V0.3)

- `governance/authority-observed` — a successfully admitted canonical authority
  (`{ schemaVersion: 1, authority: AuthoritySnapshot }`).
- `governance/authority-rejected` — a structured failed observation
  (`{ schemaVersion: 1, providerKind?, code, field?, message }`), no raw payload.
- `governance/lifecycle-transition` — one transition attempt/result
  (`{ schemaVersion: 1, from, action, ok, to?, error? }`).

All are non-surface (log-only): they are not in `SurfaceEventType`, so
`Session.deriveMessages()` never projects them into model-visible history.

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
| Monotonic hard tool guard / `tools/pre-execute` policy | Enforce non-bypassable rules regardless of prompt. |
| Guard allow/deny evidence events | Record tool-policy decisions once the guard exists. |
| Approval integration | Read-only policy advice and approval surfaces. |
| `governed-builder` Skill | Instruction-level guidance for agents acting as the builder role. |
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

## How it plugs into DSH

DSH composes a running tree from ordered `cordis.patch.yml` layers. This package
is a **bundle**: its `package.json` declares `dsh.bundle.patch`, so `dsh plugin
--profile <name> add dsh-governed-workflow` joins the layer stack and its patch
inserts two rows — `governed-workflow` (the `GovernanceService`) and
`governed-workflow-evidence` (the `GovernanceEvidenceService`).

## Non-goals for the current task

- GitHub REST/GraphQL/`gh` authority fetching;
- network clients or credentials;
- Git/path/shell tool enforcement;
- `tools/pre-execute` or monotonic `ctx.tools.guard()` policy;
- tool allow/deny decision logic;
- approval workflows;
- model-facing governance tools;
- `governed-builder` Skill;
- policy profiles;
- reviewer/multi-agent orchestration;
- automatic successor creation;
- release/npm publish automation;
- persistence backend;
- dashboard/custom UI.
