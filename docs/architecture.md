# Architecture

This document describes the module boundaries for `dsh-governed-workflow`: what
is implemented, what is designed, and what is deliberately reserved for later
independently authorized tasks.

## Status

**V0.8 public GitHub Issue authority provider.** V0 (bootstrap), V0.1
(governance core), V0.2 (authority core), V0.3 (evidence core — durable reload
upstream-blocked), V0.4 (Bash runtime guard), V0.5 (mutation guard expansion),
V0.6 (governed-builder Skill), and V0.7 (async authority resolution) are
accepted. This stage ships an **explicit opt-in** public, unauthenticated,
read-only GitHub.com Issue authority provider (`kind: github-issue`) plus a
lifecycle-owned bootstrap. GitHub identity is provider-derived; no
token/private-repo/GraphQL/comment authority, polling, or replacement semantics
ship yet.

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
src/github-issue-provider.ts    # public GitHub Issue authority provider (V0.8)
src/github-issue-authority-service.ts  # opt-in lifecycle-owned GitHub bootstrap (V0.8)
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
| V0.7 | Async authority resolution | `AuthorityProvider.resolve()` may be synchronous or asynchronous (cancellable); `observeAuthority()` is awaitable, fail-closed on abort, and race-safe — at most one snapshot is ever admitted, with no replacement semantics. |
| V0.8 | Public GitHub Issue authority provider | `kind: github-issue`. One unauthenticated read-only GET of a fixed `https://api.github.com` endpoint; parses exactly one strict V1 machine-readable Issue-body block; derives `source`/`repository`/`taskId`/`taskReference` from the configured target; returns a canonical `AuthorityResult` for the V0.7 admission path. |
| V0.8 | GitHub bootstrap service | Explicit opt-in, lifecycle-owned, timeout-bounded, cancellable bootstrap that awaits `ctx.governance.observeAuthority(provider, { signal })`. Absent from the default bundle, so no network request occurs unless a profile enables it. |

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

## Async authority resolution (V0.7)

`AuthorityProvider.resolve(options?)` may now return a synchronous
`AuthorityResult` or a `PromiseLike<AuthorityResult>`, and receives an optional
`AbortSignal`. `GovernanceService.observeAuthority()` is awaitable and:

- validates a nonblank `provider.kind` and an already-aborted signal **before**
  invoking the provider;
- catches synchronous throws and asynchronous rejections;
- re-checks cancellation **after** the await and before admission, so a provider
  that ignores the signal still cannot unlock authority after abort;
- normalizes/revalidates the resolved value through the canonical
  `normalizeProviderResult()` boundary;
- admits at most one snapshot via the shared `OBSERVE_AUTHORITY` boundary.

**Concurrency / no-replacement semantics:** the first observation to reach the
admission boundary wins; any later (including concurrent-loser) observation
returns a truthful structured failure and never overwrites the accepted
snapshot. A provider is not invoked at all once authority is already accepted.
There is no authority replacement/refresh in V0.7.

The built-in `ConfigAuthorityProvider` remains synchronous, and the constructor
performs a deterministic synchronous bootstrap through the same shared admission
helper — no detached/background promise exists.

## Public GitHub Issue authority (V0.8)

`GitHubIssueAuthorityProvider` (`kind: github-issue`) is the first real network
authority adapter. It is **public, unauthenticated, read-only, and one-shot**.

### Authority-block contract

The Issue body must contain **exactly one** V1 marker:

```text
<!-- dsh-governed-workflow-authority:v1
{ ...JSON... }
-->
```

Rules (all fail-closed):

- missing block → `AUTHORITY_UNAVAILABLE`;
- duplicate markers/blocks or an unsupported version → `INVALID_AUTHORITY`;
- malformed JSON / non-object JSON / unknown keys / oversized block →
  `INVALID_AUTHORITY`;
- the block may supply only `baselineRef`, `baselineSha`, `candidateBranch`,
  `allowedPaths`, `protectedBranches` — identity/provenance keys are rejected as
  unknown keys;
- a literal marker example inside a fenced code block is ignored (the parser
  strips fenced code regions before locating the block);
- the extracted substring is bounded (64 KiB) before `JSON.parse`.

### Derived identity/provenance

For configured `OWNER/REPO` + issue `N`:

- `source = github-issue`;
- `repository = OWNER/REPO`;
- `taskId = github-issue:OWNER/REPO#N`;
- `taskReference = https://github.com/OWNER/REPO/issues/N`.

The Issue body cannot override these. `observedAt` is omitted (GitHub
`updated_at` is not the local observation time).

### Config + fixed-host/SSRF boundary

- fixed API origin `https://api.github.com`; no configurable base URL;
- repository config is exactly two nonblank `OWNER/REPO` segments (alphanumeric
  at both ends, `._-` in the middle — rejects empty segments and `.`/`..`);
- path segments are URL-encoded before the endpoint is built;
- issue number must be a positive safe integer;
- `redirect: 'error'` plus a 3xx-status guard — redirects/transfers fail closed
  rather than being followed;
- no GitHub Enterprise/custom host support.

### Transport

Each `resolve()` performs **at most one** GET with `Accept:
application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, a stable
`dsh-governed-workflow` User-Agent, and the caller's `AbortSignal`. There is
**no `Authorization` header** and **no token/env credential lookup**. `404`/`410`
(unavailable), `403`/`429` (rate-limited/forbidden — no retry), other non-2xx,
and network rejection all fail closed without leaking raw response bodies. The
full response is bounded (~1 MiB) before `JSON.parse`; malformed JSON →
`INVALID_AUTHORITY`. The response envelope must be a plain object whose
`number` equals the configured issue, `state === "open"`, `body` is a string,
and which carries no own `pull_request` key (a PR is not an Issue).

### Lifecycle-owned bootstrap + no-default-network

`GitHubIssueAuthorityService` is the opt-in bootstrap. It borrows
`ctx.governance` and starts `observeAuthority(provider, { signal })` inside a
`ctx.effect(...)`: the effect disposer aborts the in-flight observation and
clears the timeout timer on disposal/unload. A bounded timeout (default 12 s,
configurable 1–60 s) aborts the same observation signal; no retry follows a
timeout, and a timeout result is fail-closed. The provider's transport is
injectable for deterministic offline tests, but the URL is always constructed by
the provider module, so the injection surface is not an arbitrary runtime URL
escape hatch.

**No network by default:** the service is **not** listed in `cordis.patch.yml`,
so installing the bundle issues zero GitHub requests unless a profile adds the
`dsh-governed-workflow/github-issue-authority-service` row. If config-backed
authority is already accepted, the bootstrap performs zero fetches (the V0.7
`observeAuthority()` pre-check preserves precedence/no-overwrite).

### One-shot snapshot semantics

V0.8 fetches one Issue snapshot for one admission. Later Issue edits do not
mutate the accepted snapshot; there is no polling, refresh, or replacement, and
task closure after acceptance does not retroactively change the snapshot. The
terminal lifecycle guard remains the mutation freeze.

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
| Authenticated / private GitHub authority | PAT / `GITHUB_TOKEN` / `GH_TOKEN` / OAuth / GitHub App auth, private repositories, and authenticated fallback (deliberately out of V0.8 scope). |
| GitHub Enterprise / GraphQL / comment authority | Custom API base URLs, GraphQL authority, and Issue-comment authority (not in V0.8). |
| Authority replacement / polling | Refresh or replace an already accepted snapshot; live polling (V0.8 is one-shot). |
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

- PAT / `GITHUB_TOKEN` / `GH_TOKEN` / OAuth / GitHub App authentication;
- private repository authority;
- GitHub Enterprise/custom API base URL;
- GraphQL authority;
- Issue comment authority;
- PR-as-authority;
- automatic retries/backoff/polling;
- authority replacement/refresh after acceptance;
- GitHub write/mutation operations;
- protected-branch Git runtime enforcement;
- `allowedPaths` / canonical path enforcement;
- Bash/Git command parsing (the guard gates tool names, not command semantics);
- GitHub merge/close/successor runtime enforcement;
- durable guard-decision SessionEvents (deferred by the accepted upstream
  SessionEvent blocker);
- workaround for the V0.3 durable-reload blocker;
- approval workflows;
- automatic lifecycle admission/run transitions (the bootstrap admits authority
  only — never `ADMIT_TASK` / `RUN`);
- policy profiles;
- reviewer/multi-agent orchestration;
- successor automation;
- release/npm publication;
- persistence backend;
- dashboard/custom UI.
