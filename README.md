# governed-workflow-for-dsh

Independent community plugin for DeepSeek Harness. Not affiliated with or endorsed by DeepSeek.

Policy-enforced, evidence-first governed workflows for DeepSeek Harness agents.

`dsh-governed-workflow` migrates a GPT-issued, builder-executed development
workflow onto [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
("dsh"): an authoritative GitHub task is issued, an agent builder implements it
on a dedicated branch, and a reviewer accepts independently. The long-term goal
is a runtime plugin that makes the workflow's invariants non-bypassable, paired
with a `governed-builder` Skill for instruction-level guidance.

## Status

**V0.9 / Developer Technical Preview.** Owner Technical Preview decision = **GO**;
the project is distributed today as an **exact-pinned public GitHub source
install**. A GitHub prerelease/tag has **not yet been created**, and the package
is **not published to npm**. OMDSH author-side intake preparation is complete
through OMDSH-1, but OMDSH Workshop independent review, current-baseline
verification, and Registry admission remain **pending** (not approved / not
admitted).

V0 (bootstrap), V0.1 (governance core), V0.2 (authority core), V0.3 (evidence
core — durable reload upstream-blocked), V0.4 (Bash runtime guard), V0.5
(mutation guard expansion), V0.6 (governed-builder Skill), V0.7 (async authority
resolution), V0.8 (public GitHub Issue authority provider), and V0.9 (builder
lifecycle tools + RUNNING-only guard) are accepted. The project is
**authority-capable + evidence-recording + RUNNING-only monotonic mutation guard
(`bash` / `write` / `edit`) + model-facing lifecycle tools + `governed-builder`
Skill + opt-in public GitHub Issue authority**; durable evidence reload remains
upstream-blocked; path/Git hard enforcement, authenticated/private GitHub
authority, and authority replacement remain future work.

**New users: start with the
[Technical Preview quickstart](docs/technical-preview-quickstart.md).** See
[docs/architecture.md](docs/architecture.md) for the full design.

## Skill vs runtime plugin

- **`governed-builder` Skill** is the *behavioral operating procedure* — the
  guidance a Builder follows (authority refresh, read-before-mutate, fail-closed
  `BLOCKED`, independent review, evidence reporting). It is model/user-loadable
  instructions, **not** an authority boundary and **not** a SessionEvent.
- **Runtime plugins** (`ctx.governanceGuard`, `ctx.governance`,
  `ctx.governanceEvidence`) enforce *non-bypassable invariants*. Loading or
  invoking the Skill never advances the lifecycle, installs authority, or
  unlocks mutation.

## Hard runtime boundary vs guidance (at a glance)

**Hard-enforced at the verified ToolRuntime seam:** accepted authority
prerequisite; RUNNING-only mutation gate for `bash`/`write`/`edit`; terminal-state
mutation freeze; lifecycle transition allowlist (`ADMIT_TASK`, `RUN`, `BLOCK`,
`COMPLETE`, `SUBMIT_REVIEW` only).

**Not hard-enforced (behavioral guidance or future work):** `allowedPaths`
filesystem containment, Bash/Git semantic parsing, protected-branch Git
semantics, GitHub merge/close/successor actions, authenticated/private GitHub
authority, reviewer/owner `ACCEPTED` state/tool, arbitrary same-process hostile
plugin containment.

## OMDSH / runtime disclosure

- **Integration:** DSH Profile Bundle / `harness-profile`.
- **Verified DSH baseline:** `@deepseek-ai/dsh@0.1.0-rc.6` only.
- **Activation / dispose:** `restart-profile`; dispose `unknown` at whole-bundle
  Workshop-manifest level.
- **Named capability:** model-facing read-only `governance_status`.
- **Permissions/effects:** registers DSH tools, a Skill, a ToolRuntime mutation
  guard, and appends Session evidence; the **opt-in** public GitHub Issue
  authority provider may perform one fixed-host unauthenticated GitHub.com read.
- **Default network:** none unless the GitHub authority bootstrap is explicitly
  enabled. **Credentials:** none read by the described provider/runtime path.
  **Subprocess/native code:** none as plugin runtime behavior.
- **Scripts-disabled readiness:** tracked prebuilt `lib/**`; OMDSH-1
  install/remove/reinstall evidence in
  [docs/OMDSH_REVIEW.md](docs/OMDSH_REVIEW.md).
- **Tests:** repository CI covers 167 tests / 12 files at OMDSH-1 acceptance,
  plus typecheck/build and a fail-closed `lib/**` drift gate — repository
  evidence, not OMDSH certification.
- **Market state:** Workshop submission / independent verification / Registry
  admission pending.

See [docs/OMDSH_REVIEW.md](docs/OMDSH_REVIEW.md),
[docs/dsh-compatibility.md](docs/dsh-compatibility.md),
[docs/architecture.md](docs/architecture.md), and [SECURITY.md](SECURITY.md).

## Evidence

Governance facts are appended to an explicit `Session` as non-surface events
(`governance/authority-observed`, `governance/authority-rejected`,
`governance/lifecycle-transition`). They add no model-visible message and are
projected back in sequence order for audit/replay. Recording is append-only;
`flush()` requests the DSH durability checkpoint (no-op without a persistence
backend).

**Durable-reload limitation:** current DSH exposes no way to mark these events
`ignorable` and no public runtime registration for out-of-repo event types, so
first-party persisted load/resume refuses a log containing them — **even when
this plugin is installed**. In-memory append/replay works; durable reload is an
upstream capability blocker. See
[docs/dsh-compatibility.md](docs/dsh-compatibility.md).

## Install (Developer Technical Preview)

This preview is distributed as a **GitHub source install from an exact pinned
commit**. It is **not published to npm**.

### OMDSH-1 merged (pre-OMDSH-2) package source

```sh
dsh plugin --profile governed add github:zcx369658780/governed-workflow-for-dsh#266f40e0b5eda5b82f1b25444f9f044db65c7634
```

`266f40e0b5eda5b82f1b25444f9f044db65c7634` is the accepted OMDSH-1 merged /
pre-OMDSH-2 package source: it carries the same accepted runtime semantics plus
tracked prebuilt `lib/**` (so scripts-disabled consumption does not depend on
`prepare` generating `lib/**`), `dshWorkshop`, and `docs/OMDSH_REVIEW.md`.

> The final OMDSH Agent Submission `release.ref` / immutable public source SHA
> will be re-bound by GPT/Owner to the final merged public SHA **after OMDSH-2 is
> accepted and merged**, so the formal submission includes the OMDSH-2
> README/release-truth convergence. Do not treat this pre-OMDSH-2 SHA as the
> final submission coordinate.

### Historical RH-1 qualification reference

`897f39a309638dabe99859d83a2160a5913734f9` remains the clean-room Technical
Preview qualification evidence SHA (RH-1). The
[quickstart](docs/technical-preview-quickstart.md) still uses this historical
SHA; it is valid qualification provenance, not the current OMDSH-ready
submission coordinate.

See [docs/technical-preview-quickstart.md](docs/technical-preview-quickstart.md)
for the complete 5–10 minute walkthrough (authority Issue block, GitHub bootstrap
row, boot/dump-config, and lifecycle usage).

## Configure an authority (optional)

The config-backed reference provider reads an authority from the plugin row's
`config` (or a profile/`--patch` override by row id):

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
No secrets, credentials, or personal machine paths belong in the snapshot.

## Public GitHub Issue authority (V0.8, opt-in)

A second, **explicit opt-in** bootstrap can obtain authority from one public
GitHub.com Issue. It is **not** part of the default bundle — installing
`dsh-governed-workflow` with no GitHub configuration issues **zero** network
requests. To enable it, add a profile/`--patch` row for
`dsh-governed-workflow/github-issue-authority-service`:

```yaml
- id: governed-workflow-github
  name: dsh-governed-workflow/github-issue-authority-service
  config:
    repository: zcx369658780/governed-workflow-for-dsh
    issueNumber: 17
    timeoutMs: 12000   # optional, 1000–60000, default 12000
```

The provider performs **one unauthenticated read-only** GET of
`https://api.github.com/repos/{owner}/{repo}/issues/{n}` and parses **exactly
one** V1 machine-readable authority block from the Issue body:

```text
<!-- dsh-governed-workflow-authority:v1
{
  "baselineRef": "main",
  "baselineSha": "f3866974951aedec10c44da01eca3b111c7e3001",
  "candidateBranch": "dsh/v0-8-public-github-issue-authority",
  "protectedBranches": ["main"]
}
-->
```

Boundaries:

- **Identity is provider-derived, not body-supplied.** The block may set only
  `baselineRef`, `baselineSha`, `candidateBranch`, `allowedPaths`,
  `protectedBranches`; `taskId`/`source`/`repository`/`taskReference` are
  derived from the configured `OWNER/REPO#N` and cannot be overridden.
- **No-network-by-default.** The provider/bootstrap are opt-in and absent from
  `cordis.patch.yml`.
- **Public, unauthenticated only.** No `Authorization` header, no token/env
  credential lookup, no private repos, no authenticated fallback. GitHub's
  unauthenticated primary rate limit (currently **60 requests/hour per
  originating IP**) is an external GitHub constraint, not a plugin guarantee;
  a `403`/`429` fails closed with no retry.
- **Fixed host / SSRF boundary.** The API origin is fixed to
  `https://api.github.com`; repository/issue config is strictly validated and
  path segments are URL-encoded; redirects/transfers fail closed rather than
  being followed; no configurable base URL exists.
- **Issue vs PR.** A payload carrying a `pull_request` key is rejected; closed
  or missing Issues fail closed.
- **One-shot snapshot semantics.** One resolution admits one frozen snapshot;
  later Issue edits do not mutate it, and there is no polling or replacement.

Malformed/duplicate/missing blocks, oversized or malformed responses, and
unexpected HTTP states all fail closed. Failure leaves governance
`UNINITIALIZED` and the mutation guard denying. The V0.3 durable-evidence-reload
blocker is unchanged.

## Builder lifecycle tools (V0.9, default)

The default bundle also mounts two **model-facing** lifecycle tools:

- `governance_status` — read-only bounded summary (`state`, `authorityAccepted`,
  accepted `taskId`, last transition summary). Never mutates state.
- `governance_transition` — applies exactly one builder-authorized action
  (`ADMIT_TASK`, `RUN`, `BLOCK`, `COMPLETE`, `SUBMIT_REVIEW`) through the
  canonical state machine.

The intended hard runtime sequence is:

```text
no authority        -> mutation denied
AUTHORITY_OBSERVED  -> mutation denied (NOT_RUNNING) -> ADMIT_TASK
TASK_ADMITTED       -> mutation denied (NOT_RUNNING) -> RUN
RUNNING             -> mutation may proceed          -> BLOCK | COMPLETE
BLOCKED / COMPLETED -> mutation denied terminal      -> SUBMIT_REVIEW
REVIEW_PENDING      -> mutation denied terminal; independent reviewer decides
```

`OBSERVE_AUTHORITY` and any acceptance/reviewer transition are **not** exposed
to the model; there is no builder-authorized `ACCEPTED` state. These tools are
local/no-network, so the default bundle still performs zero network requests
unless the V0.8 GitHub bootstrap is explicitly enabled.

## Development

```sh
pnpm install
pnpm build       # transpile src/ -> lib/
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
```

## Documentation

- [Architecture, module boundaries, and trust model](docs/architecture.md)
- [DSH compatibility](docs/dsh-compatibility.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [AI assistance](AI_ASSISTANCE.md)
- [Trademark notice](TRADEMARK_NOTICE.md)

## License

[MIT](LICENSE)
