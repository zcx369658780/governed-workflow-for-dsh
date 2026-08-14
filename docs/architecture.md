# Architecture

This document describes the module boundaries for `dsh-governed-workflow`: what
is implemented, what is designed, and what is deliberately reserved for later
independently authorized tasks.

## Status

**V0.1 governance core.** The V0 bootstrap skeleton (Issue #1 / PR #2) was
accepted. This task adds the first real runtime primitive: a pure, fail-closed
builder-side lifecycle state machine and a typed `governance` Cordis service.
There is still **no** authority provider, tool guard, session evidence, Skill,
or policy profile — the plugin is not yet governance-enforcing.

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
package.json           # declares dsh.bundle.patch -> cordis.patch.yml
cordis.patch.yml       # the bundle layer: inserts the governed-workflow row
src/index.ts           # package entry: default-exports GovernanceService
src/lifecycle.ts       # pure, Cordis-independent lifecycle state machine
src/governance.ts      # typed GovernanceService (ctx.governance, declaration merging)
test/lifecycle.spec.ts # offline state-machine tests
test/governance.spec.ts# service load/transition/disposal tests (real Context)
tsdown.config.ts       # self-contained ESM transpile (the `prepare` build)
```

## Implemented (V0.1)

| Module | Responsibility |
|---|---|
| Lifecycle state machine | Pure, deterministic builder-side states `UNINITIALIZED → AUTHORITY_OBSERVED → TASK_ADMITTED → RUNNING → BLOCKED \| COMPLETED → REVIEW_PENDING`. Invalid transitions fail closed. There is no builder-authorized `ACCEPTED`. |
| Governance Service (`ctx.governance`) | A Cordis service exposing a safely-copied snapshot and authorized transitions through the state machine. Not a model-facing tool. |

## Reserved for later tasks (not implemented)

Each of these is a future, independently authorized task; the current task must
not start them.

| Module | Responsibility (future) |
|---|---|
| Authority Provider abstraction | A seam that answers "what is the single authoritative task right now?" with pluggable backends. The abstraction may bind Git state (branch/SHA) to a task source; the exact semantics are **not yet implemented or frozen**. |
| Initial `git-main` authority provider | A concrete provider that resolves the authoritative task from Git state and a task source (e.g. a GitHub issue). Its exact behavior is not yet defined. |
| Soft policy / approval integration | Read-only policy advice and approval surfaces that consult the permission service. |
| Monotonic hard tool guard | Enforce non-bypassable, monotonic rules (e.g. never push to `main`, never self-accept) regardless of prompt. |
| Durable governance session events / evidence observer | Append governance facts (authority snapshot, guard decisions, artifacts) to the DSH session log. |
| `governed-builder` Skill | Instruction-level guidance for agents acting as the builder role. |
| Policy profiles (`strict`, `standard`, `fast`) | Named compositions of the above, selectable per session. |
| GitHub API automation | Issue/PR clients and task-source automation. |

## How it plugs into DSH

DSH composes a running tree from ordered `cordis.patch.yml` layers. This package
is a **bundle**: its `package.json` declares `dsh.bundle.patch`, so when a user
runs `dsh plugin --profile <name> add dsh-governed-workflow` (from npm or
`github:...`), the bundle joins the profile's layer stack and its patch inserts
the `governed-workflow` row. That row mounts the package's default export — the
`GovernanceService` class — which registers itself as `ctx.governance`. Loading
order and override semantics follow the
[DSH publish guide](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md).

## Non-goals for the current task

- GitHub Issue/PR API clients;
- Authority Provider or `git-main` provider behavior;
- shell/Git/path policy enforcement;
- `tools/pre-execute` policy or monotonic `ctx.tools.guard()` rules;
- approval workflows;
- durable governance SessionEvent evidence;
- `governed-builder` Skill;
- strict/standard/fast profiles;
- reviewer/multi-agent orchestration;
- automatic successor creation;
- release/npm publish automation;
- dashboard/custom UI.
