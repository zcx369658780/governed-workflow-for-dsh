# Architecture

This document describes the module boundaries for `dsh-governed-workflow`: what
is implemented, what is designed, and what is deliberately reserved for later
independently authorized tasks.

## Status

**V0.2 authority core.** The V0 bootstrap skeleton (Issue #1) and the V0.1
governance core (Issue #3) are accepted. This stage adds the first trustworthy
authority capability — a provider-neutral contract, a runtime-validated
immutable authority snapshot, and a config-backed reference provider — and
integrates it with the governance service. The plugin is **authority-capable,
not yet tool-enforcing**: it observes and records an authority but enforces
nothing on tool calls.

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
package.json             # declares dsh.bundle.patch -> cordis.patch.yml
cordis.patch.yml         # the bundle layer: inserts the governed-workflow row
src/index.ts             # package entry: default-exports GovernanceService
src/lifecycle.ts         # pure, Cordis-independent lifecycle state machine
src/authority.ts         # authority model, runtime validation, provider contract
src/config-provider.ts   # config-backed reference provider (offline)
src/governance.ts        # GovernanceService (ctx.governance) + authority integration
test/*.spec.ts           # offline lifecycle/authority tests + real-Context service tests
tsdown.config.ts         # self-contained ESM transpile (the `prepare` build)
```

## Implemented

| Version | Module | Responsibility |
|---|---|---|
| V0.1 | Lifecycle state machine | Pure, deterministic builder-side states `UNINITIALIZED → AUTHORITY_OBSERVED → TASK_ADMITTED → RUNNING → BLOCKED \| COMPLETED → REVIEW_PENDING`. Invalid transitions fail closed; no builder-authorized `ACCEPTED`. |
| V0.1 | Governance Service (`ctx.governance`) | Holds the lifecycle, a safely-copied snapshot, and authorized transitions. Not a model-facing tool. |
| V0.2 | Authority model + validation | Provider-neutral `AuthoritySnapshot`; `validateAuthority()` rejects missing/invalid fields, unknown keys, malformed arrays, and prototype-chain tricks, and returns a deeply frozen snapshot. No secrets/tokens. |
| V0.2 | Authority Provider contract | `AuthorityProvider` with explicit success/failure `resolve()`; the governance core depends on the contract, never a concrete provider. |
| V0.2 | Config-backed reference provider | Offline provider whose authority is supplied via DSH plugin configuration. Deterministic, credential-free, and never embeds personal paths/tokens. |
| V0.2 | Governance authority integration | `observeAuthority()` resolves through the provider and advances `UNINITIALIZED → AUTHORITY_OBSERVED` only on valid resolution; failure leaves state and the accepted snapshot unchanged. |

## Trust model (current boundary)

- **Model and tool calls are untrusted inputs.** Anything the model passes into
  governance is treated as untrusted and runtime-validated.
- **Authority/config/provider outputs must be runtime validated.** TypeScript
  types are not a trust boundary; `validateAuthority()` performs the checks.
- **Same-process third-party plugins with arbitrary JavaScript execution are
  not assumed hostile in V0.x.** Code granted arbitrary in-process execution
  can subvert the process itself, so V0.2 does not claim to stop it.
- **Future runtime guards protect agent/tool behavior**, not malicious code
  already granted arbitrary in-process execution.

## Reserved for later tasks (not implemented)

| Module | Responsibility (future) |
|---|---|
| GitHub Issue / network authority provider | Fetch authority from GitHub REST/GraphQL/`gh`; implements the same `AuthorityProvider` contract without changing the governance core. |
| Monotonic hard tool guard / `tools/pre-execute` policy | Enforce non-bypassable rules regardless of prompt. |
| Approval integration | Read-only policy advice and approval surfaces. |
| Durable governance SessionEvent evidence | Append governance facts to the DSH session log. |
| `governed-builder` Skill | Instruction-level guidance for agents acting as the builder role. |
| Policy profiles (`strict`, `standard`, `fast`) | Named compositions selectable per session. |
| Reviewer orchestration / successor automation | Multi-agent review and automatic successor creation. |
| Release / npm publication | Publishing automation. |

## How it plugs into DSH

DSH composes a running tree from ordered `cordis.patch.yml` layers. This package
is a **bundle**: its `package.json` declares `dsh.bundle.patch`, so `dsh plugin
--profile <name> add dsh-governed-workflow` joins the layer stack and its patch
inserts the `governed-workflow` row. That row mounts the package's default
export — the `GovernanceService` class — registering `ctx.governance`.

The config-backed authority is supplied through the row's `config` (or a user
profile/`--patch` override by row id):

```yaml
- id: governed-workflow
  config:
    authority:
      taskId: issue-5
      source: config
      repository: owner/repo
      baselineRef: main
      baselineSha: 0123456789abcdef0123456789abcdef01234567
```

A valid authority is observed at load (`UNINITIALIZED → AUTHORITY_OBSERVED`);
unavailable/invalid authority fails closed and leaves the lifecycle unchanged.

## Non-goals for the current task

- GitHub REST/GraphQL/`gh` authority fetching;
- network clients or credentials;
- Git/path/shell tool enforcement;
- `tools/pre-execute` or monotonic `ctx.tools.guard()` policy;
- approval workflows;
- durable SessionEvent evidence;
- model-facing governance tools;
- `governed-builder` Skill;
- policy profiles;
- reviewer/multi-agent orchestration;
- automatic successor creation;
- release/npm publish automation;
- dashboard/custom UI.
