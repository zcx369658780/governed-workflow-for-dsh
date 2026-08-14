# Architecture

This document describes the planned module boundaries for
`dsh-governed-workflow`. It is a **design map**, not an implementation record:
the V0 bootstrap ships only the loadable plugin/bundle skeleton, and every
module below is **reserved, not implemented**.

## Status

**Bootstrap.** The package currently proves that DeepSeek Harness (DSH) can
develop, build, test, and load its own third-party plugin/bundle. It carries no
governance logic.

## Design principle

> **Skills instruct agent behavior; runtime plugins enforce non-bypassable
> invariants.**

The governed workflow is split along this line from the start:

- **Skills** (natural-language instruction, `governed-builder`) tell the agent
  *how to behave* — they are guidance that the model reads and follows.
- **Runtime plugins** (this package, via Cordis) enforce *invariants that
  cannot be skipped by prompt* — authority resolution, tool guards, and
  evidence capture that hold regardless of what the model is told.

Everything a prompt can be talked out of belongs in the runtime plugin;
everything that is a judgment call belongs in the Skill.

## Current V0 structure

```
package.json        # declares dsh.bundle.patch -> cordis.patch.yml
cordis.patch.yml    # the bundle layer: inserts the governed-workflow plugin row
src/index.ts        # minimal plugin entry (name + apply + one reversible effect)
test/               # vitest smoke/unit tests
tsdown.config.ts    # self-contained ESM transpile (the `prepare` build)
```

The plugin exports a Cordis `name` and an `apply(ctx)` function. V0 registers
no service, no tool, and no event listener — only a load marker and one empty
effect that demonstrates the reversible-effect contract.

## Planned module boundaries (reserved, not implemented)

Each of these is a future, independently authorized task. V0 must not start
them.

| Module | Responsibility (future) |
|---|---|
| Governance Service / lifecycle state machine | Own the task lifecycle (e.g. issue → executing → review-ready → accepted) and drive transitions from durable evidence. |
| Authority Provider abstraction | A seam that answers "what is the single authoritative task right now?" with pluggable backends. |
| Initial `git-main` authority provider | Resolve the authoritative task from a GitHub issue/PR on the `main` branch, with SHA pinning. |
| Soft policy / approval integration | Read-only policy advice and approval surfaces that consult the permission service. |
| Monotonic hard tool guard | Enforce non-bypassable, monotonic rules (e.g. never push to `main`, never self-accept) regardless of prompt. |
| Durable governance session events / evidence observer | Append governance facts (authority snapshot, guard decisions, artifacts) to the DSH session log. |
| `governed-builder` Skill | Instruction-level guidance for agents acting as the builder role. |
| Policy profiles (`strict`, `standard`, `fast`) | Named compositions of the above, selectable per session. |

## How it plugs into DSH

DSH composes a running tree from ordered `cordis.patch.yml` layers. This
package is a **bundle**: its `package.json` declares `dsh.bundle.patch`, so
when a user runs `dsh plugin --profile <name> add dsh-governed-workflow` (from
npm or `github:...`), the bundle joins the profile's layer stack and its patch
inserts the `governed-workflow` row. Loading order and override semantics follow
the [DSH publish guide](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md).

## Non-goals for V0

The Issue #1 non-goals apply in full: no GitHub API automation, no issue/PR
automation, no state machine, no authority parsing, no Git/path/shell policy
enforcement, no monotonic deny rules, no approval workflows, no durable
evidence events, no reviewer orchestration, no successor creation, and no
dashboards or custom UI.
