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

**V0.8 public GitHub Issue authority provider.** V0 (bootstrap), V0.1
(governance core), V0.2 (authority core), V0.3 (evidence core — durable reload
upstream-blocked), V0.4 (Bash runtime guard), V0.5 (mutation guard expansion),
V0.6 (governed-builder Skill), and V0.7 (async authority resolution) are
accepted. V0.8 adds an explicit opt-in public GitHub.com Issue authority
provider using one unauthenticated read-only REST request and a strict V1
machine-readable Issue-body block. GitHub identity is provider-derived; no
token/private-repo/GraphQL/comment authority, polling, or replacement semantics
ship yet. The project is **authority-capable + evidence-recording + monotonic
mutation-tool guard (`bash` / `write` / `edit`) + `governed-builder` Skill +
opt-in public GitHub Issue authority**; durable evidence reload remains
upstream-blocked; path/Git hard enforcement, authenticated/private GitHub
authority, and authority replacement remain future work. See
[docs/architecture.md](docs/architecture.md).

## Skill vs runtime plugin

- **`governed-builder` Skill** is the *behavioral operating procedure* — the
  guidance a Builder follows (authority refresh, read-before-mutate, fail-closed
  `BLOCKED`, independent review, evidence reporting). It is model/user-loadable
  instructions, **not** an authority boundary and **not** a SessionEvent.
- **Runtime plugins** (`ctx.governanceGuard`, `ctx.governance`,
  `ctx.governanceEvidence`) enforce *non-bypassable invariants*. Loading or
  invoking the Skill never advances the lifecycle, installs authority, or
  unlocks mutation.

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

## Install

```sh
# from npm (when published)
dsh plugin --profile demo add dsh-governed-workflow

# from this git checkout (TypeScript sources build via the prepare script;
# pnpm >=10 requires an allowBuilds entry the first time)
dsh plugin --profile demo add github:zcx369658780/governed-workflow-for-dsh
```

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
