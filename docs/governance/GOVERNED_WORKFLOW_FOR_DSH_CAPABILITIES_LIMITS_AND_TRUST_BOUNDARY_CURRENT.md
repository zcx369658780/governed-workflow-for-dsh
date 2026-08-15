# Governed Workflow for DSH — Capabilities, Limits, and Trust Boundary (CURRENT)

> Factual matrix of the accepted V0–V0.9 surface of `dsh-governed-workflow`.
> Recorded against live `main` SHA `658261924d225792998c495d97209e2dcaa06714`
> (refresh before relying on this). No "fully secure"/"non-bypassable governance"
> claims beyond the exact verified seams.

## Status key

- **Hard** = implemented AND non-bypassable at the verified runtime seam.
- **Guidance** = implemented, behavioral/instruction-layer only (Skill).
- **Opt-in** = implemented but not enabled by default.
- **Blocked** = implemented partially; a first-party/upstream capability blocks the rest.
- **Not implemented** = explicitly out of scope; must not be claimed.

## Implemented capability matrix

| Capability | Version | Status | Notes / exact seam |
|---|---|---|---|
| Builder lifecycle state machine | V0.1 | Hard | Pure `transition()` table; invalid transitions fail closed; no `ACCEPTED`. |
| Governance service (`ctx.governance`) | V0.1 | Hard | Holds lifecycle + accepted authority; `apply(action)` + `observeAuthority()`. |
| Provider-neutral authority model + validation | V0.2 | Hard | `validateAuthority()` rejects unknown keys / malformed arrays / prototype tricks; deep-frozen snapshot. |
| Authority admission boundary | V0.2 | Hard | `normalizeProviderResult()` re-validates and enforces `source === provider.kind`; single no-overwrite admission. |
| Config-backed offline authority provider | V0.2 | Hard | Sync `ConfigAuthorityProvider`; deterministic sync bootstrap. |
| Evidence vocabulary + recorder + projection | V0.3 | Blocked | In-memory append/replay works; first-party durable reload upstream-blocked. |
| Mutation runtime guard (`ctx.governanceGuard`) | V0.4/V0.5/V0.9 | Hard | One `ctx.tools.guard()`; live-state read; RUNNING-only for `bash`/`write`/`edit`. |
| Governed-builder Skill | V0.6 | Guidance | `ctx.skills.register()`; never advances lifecycle/installs authority/unlocks mutation. |
| Async/cancellable authority observation | V0.7 | Hard | `observeAuthority()` awaitable; abort fail-closed; race-safe single admission; no overwrite. |
| Public GitHub Issue authority provider | V0.8 | Opt-in | `kind: github-issue`; fixed `api.github.com`; one unauthenticated GET; strict V1 block parser. |
| GitHub bootstrap service | V0.8 | Opt-in | Lifecycle-owned, timeout-bounded, cancellable; absent from default bundle. |
| Model-facing lifecycle tools | V0.9 | Hard | `governance_status` (read-only) + `governance_transition` (5-action allowlist). |

## Protected tools and lifecycle tools (current)

- **Protected mutation tools (hard-denied unless RUNNING + accepted authority):**
  `bash`, `write`, `edit`. Denial codes: `GOVERNANCE_DENY_NO_AUTHORITY`,
  `GOVERNANCE_DENY_TERMINAL_STATE`, `GOVERNANCE_DENY_NOT_RUNNING`.
- **Model-facing lifecycle tools:** `governance_status`, `governance_transition`.
  Transition allowlist = `ADMIT_TASK`, `RUN`, `BLOCK`, `COMPLETE`, `SUBMIT_REVIEW`.
  `OBSERVE_AUTHORITY` and any acceptance action are **not** model-facing.
- **Not gated by the mutation slice:** read/discovery tools and the lifecycle tools.

## Public GitHub Issue provider boundary (V0.8)

- Fixed origin `https://api.github.com`; no configurable base URL (SSRF boundary).
- Strict `OWNER/REPO` + positive-safe-integer issue config; URL-encoded segments.
- One GET per `resolve()`; no retry/backoff/polling/comment fetch; `redirect: 'error'`.
- No `Authorization` header, no token/env credential lookup; public-only.
- Envelope must be a plain object with matching `number`, `state === 'open'`,
  string `body`, and no own `pull_request` key. 404/410/403/429/redirect/oversized/
  malformed all fail closed without leaking raw bodies.
- Identity is provider-derived; the body block cannot override it.

## Async cancellation / no-overwrite (V0.7)

- `observeAuthority(provider, { signal })` races provider settlement vs abort, so
  an abort settles fail-closed even if the provider never settles.
- Late resolve/reject after abort cannot mutate state; abort listener is cleaned up.
- First successful admission wins; later/concurrent observations fail truthfully
  and never overwrite the accepted snapshot. No replacement/refresh/polling.

## Evidence behavior (V0.3)

- Events: `governance/authority-observed`, `governance/authority-rejected`,
  `governance/lifecycle-transition`; non-surface (log-only), append-only, sanitized.
- Recorder re-validates/sanitizes; never records raw provider payloads or secrets.
- **Upstream blocker:** first-party `PersistenceCoordinator.assertEventsSupported()`
  refuses out-of-repo `governance/*` types because `Session.append` cannot set
  `ignorable`; durable load/resume is therefore blocked even when installed.

## Default bundle rows (current)

`cordis.patch.yml` inserts five local rows: `governed-workflow`,
`governed-workflow-evidence`, `governed-workflow-guard`, `governed-workflow-skill`,
`governed-workflow-lifecycle-tools`. The V0.8 GitHub bootstrap is **not** among
them → **no default network traffic**.

## DSH / Node compatibility observations

- DSH checkout `0.1.0-rc.5` @ `47f943859bef60e4160492346772ded9b24f765a`;
  npm `@deepseek-ai/dsh` `0.1.0-rc.6`; Cordis `4.0.1`; Schemastery `3.18.1`.
- Node `^22.19.0 || >=24.0.0` (smoke-tested on `24.14.0`); pnpm `11.7.0`.
- DSH is in developer preview; compatibility-breaking changes are expected.

## Trust boundary / attack surface (explicit)

- **Model and tool calls are untrusted inputs** — runtime-validated at admission.
- **Authority/provider output is untrusted** — re-validated; provenance enforced.
- **Evidence payloads are re-validated/sanitized** before `session.append`.
- **Same-process third-party plugins with arbitrary JS execution are not assumed
  hostile in V0.x** — code granted in-process execution can subvert the process.
- **The guard is tool-name based**, not command-semantics based: it does not parse
  Bash/Git semantics, does not enforce `allowedPaths`/path containment, does not
  protect GitHub/MCP actions, and does not claim to contain arbitrary same-process code.

## Explicitly not implemented (must not be claimed)

- Path containment / `allowedPaths` canonical enforcement.
- Git protected-branch command enforcement; Bash/Git semantic parsing.
- GitHub merge/close/successor runtime enforcement.
- Authenticated/private GitHub authority; GitHub Enterprise/GraphQL/comment/PR authority.
- Authority replacement/refresh/polling.
- Durable guard-decision SessionEvents.
- Reviewer/owner `ACCEPTED` state or accept tool.
- Multi-agent reviewer orchestration; policy profiles; successor automation.
- Release/npm publication (not yet performed).
