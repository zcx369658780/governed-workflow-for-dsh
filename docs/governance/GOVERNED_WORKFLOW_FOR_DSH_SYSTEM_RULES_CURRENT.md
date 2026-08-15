# Governed Workflow for DSH — System Rules (CURRENT)

> Canonical, system-rule-grade recovery layer for `zcx369658780/governed-workflow-for-dsh`.
> These are **stable operating rules**, not a chronological task diary.
> **If this document ever conflicts with live GitHub `main`, live `main` wins.**

## Identity and disclaimer

- `dsh-governed-workflow` is an **independent community plugin** for
  [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) ("DSH").
  It is **not affiliated with or endorsed by DeepSeek**.
- Purpose: migrate a GPT-issued, builder-executed, reviewer-accepted development
  workflow onto DSH, making its invariants non-bypassable at the runtime seam and
  pairing them with a behavioral `governed-builder` Skill.

## Repository and authority precedence

1. **Live GitHub `main` is the sole implementation/factual authority.**
2. Current official DSH source/docs may be re-read when compatibility facts need refresh.
3. Old Issues/PRs are provenance, not current truth when they conflict with `main`.
4. These canonical docs are **derived recovery artifacts** and never override live code/`main`.
5. **Never infer current state from previous chat memory.** Re-fetch and re-read.

## Roles and permission boundaries

| Role | Authority |
|---|---|
| **Owner** | Final product authority. Owns the repository and decides release/acceptance. |
| **GPT Governor-Reviewer** | Issues tasks (authoritative Issues), performs **independent** review and acceptance. |
| **Builder** (DSH agent) | Implements the authoritative task on a dedicated branch, pushes a PR, reports evidence. |

**Builder hard limits** (runtime + rule):

- Must **not** self-accept, self-merge, or self-close an accepted task.
- Must **not** create or activate a successor task.
- Must **not** modify or push the protected/default branch (`main`).
- Must **not** reinterpret or broaden the task scope beyond the authoritative Issue.
- Independent review/acceptance is **outside** the Builder surface.

## Refresh-current-truth rule

Before acting, refresh live `origin/main`, read the current authoritative task
source (Issue/PR/config/other Governor-specified source), and follow its current
scope exactly. Authority over the task is external; it is never inferred from
stale chat, prior completion, the Builder's own plan, or branch existence.

## Read/discovery vs mutation

- Read/discovery tools (`read`, `read_image`, `grep`, `glob`, `search`, …) are
  **not** gated by the mutation guard and may be used before authority/mutation.
- The mutation guard is **tool-name based**, not command-semantics based:
  running `git status`/`diff`/`log` through the protected `bash` tool still
  requires accepted authority + `RUNNING`.
- Mutation must wait for **accepted** authority, never merely an in-progress fetch.

## Authority contract (provider-neutral)

- `AuthorityProvider.resolve(options?)` returns a canonical `AuthorityResult`
  (sync or async), optionally receiving an `AbortSignal`.
- Output is re-validated at the governance admission boundary
  (`validateAuthority` + `normalizeProviderResult`): unknown keys, malformed
  arrays, prototype tricks, and `source != provider.kind` all fail closed.
- Exactly one snapshot is admitted (race-safe, no overwrite, no replacement).
- Identity/provenance (`taskId`, `source`, `repository`, `taskReference`) are
  provider-owned or omitted; the task body cannot override them.

## Public GitHub Issue V1 authority block (high level)

The V0.8 provider reads a strict machine-readable block from a public GitHub
Issue body:

```text
<!-- dsh-governed-workflow-authority:v1
{ ...JSON policy fields... }
-->
```

- Exactly one V1 block; missing → fail closed; duplicate/unknown-key/malformed → fail closed.
- Only policy fields are block-suppliable: `baselineRef`, `baselineSha`,
  `candidateBranch`, `allowedPaths`, `protectedBranches`.
- Identity (`source`, `repository`, `taskId`, `taskReference`) is derived from the
  configured `OWNER/REPO#N` and cannot be body-overridden.
- Transport: one unauthenticated read-only GET to the fixed `https://api.github.com`;
  no token/credential lookup, no retry, redirects/PRs/closed Issues fail closed.

## Canonical lifecycle and exact transition legality

States: `UNINITIALIZED → AUTHORITY_OBSERVED → TASK_ADMITTED → RUNNING → BLOCKED | COMPLETED → REVIEW_PENDING`.
There is **no `ACCEPTED` state** and no builder-authorized acceptance transition.

| From | Legal action | To |
|---|---|---|
| `UNINITIALIZED` | `OBSERVE_AUTHORITY` (only via `observeAuthority()`, not the model tool) | `AUTHORITY_OBSERVED` |
| `AUTHORITY_OBSERVED` | `ADMIT_TASK` | `TASK_ADMITTED` |
| `TASK_ADMITTED` | `RUN` | `RUNNING` |
| `RUNNING` | `BLOCK` | `BLOCKED` |
| `RUNNING` | `COMPLETE` | `COMPLETED` |
| `BLOCKED` | `SUBMIT_REVIEW` | `REVIEW_PENDING` |
| `COMPLETED` | `SUBMIT_REVIEW` | `REVIEW_PENDING` |
| `REVIEW_PENDING` | (terminal) | — |

`BLOCK` and `COMPLETE` are **only legal from `RUNNING`**. All other transitions
fail closed (`INVALID_TRANSITION`) and leave state unchanged.

## pre-RUNNING blocker vs RUNNING blocker

- **pre-RUNNING blocker** (authority cannot be resolved, a required transition
  is denied, a prerequisite is unavailable before `RUNNING`): do **NOT** call
  `governance_transition(BLOCK)`. The state is already fail-closed and mutation
  is denied. Stop and return a truthful `BLOCKED_<reason>` completion report.
- **RUNNING blocker** (a runtime guard denies a required mutation, or an
  upstream/API limitation blocks a truthful implementation while running):
  call `governance_transition(BLOCK)`, then `SUBMIT_REVIEW`.
- `COMPLETE` is only valid from `RUNNING`.

## Model-facing lifecycle tools

Two bounded, fiber-owned tools exist (V0.9):

- `governance_status` — read-only summary (`state`, `authorityAccepted`,
  `taskId`, last-transition summary). Never exposes the full snapshot/`allowedPaths`/
  bodies/secrets; never mutates state.
- `governance_transition` — accepts exactly one of `ADMIT_TASK`, `RUN`, `BLOCK`,
  `COMPLETE`, `SUBMIT_REVIEW`; delegates to the canonical `ctx.governance.apply()`.

`OBSERVE_AUTHORITY` and any `ACCEPT`/`ACCEPTED` action are **not** model-facing.
The tools can never create/replace authority, call `observeAuthority()`, alter the
protected-tool set, disable the guard, or perform shell/filesystem/Git/GitHub work.

## Hard RUNNING-only mutation guard

Protected mutation tool names: **`bash`**, **`write`**, **`edit`**. Denial order:

1. no accepted authority → `GOVERNANCE_DENY_NO_AUTHORITY`;
2. `BLOCKED` / `COMPLETED` / `REVIEW_PENDING` → `GOVERNANCE_DENY_TERMINAL_STATE`;
3. `AUTHORITY_OBSERVED` / `TASK_ADMITTED` (authority but not `RUNNING`) → `GOVERNANCE_DENY_NOT_RUNNING`;
4. exactly `RUNNING` + accepted authority → allowed (no governance denial).

Read/discovery tools are not gated by this slice.

## Runtime hard invariants vs Skill guidance

- **Runtime-enforced (non-bypassable at the ToolRuntime boundary):** accepted
  authority requirement, RUNNING-only mutation gate, terminal-state mutation
  freeze, the transition-tool action allowlist.
- **Behavioral guidance only (`governed-builder` Skill):** protected-branch Git
  semantics, path allowlists/containment, GitHub merge/close/successor
  permissions, network/GitHub authority fetching, independent acceptance itself.

Do **not** claim path containment, Git protected-branch enforcement, GitHub merge
enforcement, private/authenticated GitHub authority, durable guard-decision
evidence, or reviewer acceptance runtime enforcement. None of these are implemented.

## Fail-closed BLOCKED semantics

`BLOCKED_<reason>` is a valid Builder terminal result. A BLOCKED (or other
terminal) result stops the invocation; do not self-repair outside scope. A denial
is final for that action — do not route around it.

## Candidate branch / independent review / exact-head merge discipline

- Work on the task-authorized dedicated branch, never `main`.
- Push a PR; report the **exact final candidate commit SHA** and CI run id.
- Do not self-accept, merge, or close. Independent review/acceptance is required.
- Do not force-push or rewrite accepted history.

## Evidence and the V0.3 durable-reload blocker

- Evidence events: `governance/authority-observed`, `governance/authority-rejected`,
  `governance/lifecycle-transition` — non-surface (log-only), append-only, sanitized.
- **Upstream blocker (unchanged):** first-party durable reload refuses out-of-repo
  `governance/*` SessionEvents because `Session.append` cannot set the `ignorable`
  marker and there is no public runtime registration for out-of-repo event types.
  In-memory append/replay works; first-party persisted load/resume does not.

## No-default-network

The V0.8 GitHub authority bootstrap is **opt-in** and absent from the default
bundle. Installing `dsh-governed-workflow` with no GitHub configuration performs
zero network requests.

## New-session recovery rules

1. Re-fetch live `origin/main` and treat its current tree as truth.
2. Read the canonical docs (see the sync manifest) in precedence order.
3. Confirm the current authoritative task from GitHub before acting.
4. When in doubt, fail closed and ask the Governor/Reviewer rather than guessing.

## Staleness disclaimer

These rules describe the accepted state at the recorded `main` SHA. If any
statement here disagrees with live code or a newer authoritative task, the live
artifact wins and these docs must be refreshed before being relied on.
