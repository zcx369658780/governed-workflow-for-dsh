# DSH compatibility

This document records the DeepSeek Harness (DSH) version and interface surface
the plugin was inspected against and smoke-tested with. It is the single place
to update when re-verifying against a newer DSH.

## Tested baseline

| Component | Version / revision |
|---|---|
| DSH source checkout | `0.1.0-rc.5` |
| DSH git revision | `47f943859bef60e4160492346772ded9b24f765a` |
| `@deepseek-ai/dsh` (npm, latest at inspection) | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-session` (npm, type/unit-tested) | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-tools` / `dsh-system-prompt` / `dsh-llm` (npm, guard unit-tested) | `0.1.0-rc.6` |
| `@deepseek-ai/dsh-skill` (npm, skill unit-tested) | `0.1.0-rc.6` |
| `@deepseek-ai/cordis` | `4.0.1` |
| `@deepseek-ai/schemastery` | `3.18.1` |
| Node.js | `^22.19.0 || >=24.0.0` (tested on `24.14.0`) |
| pnpm | `11.7.0` |

The DSH load smoke tests (V0–V0.3) ran against the local `0.1.0-rc.5` checkout
at the revision above, via `pnpm dsh` (source execution). Type and unit tests
for the V0.3 evidence surface run against the npm-published
`@deepseek-ai/dsh-session@0.1.0-rc.6` (the only npm line whose API — including
the `ignorable` envelope marker — matches the checkout).

## RH-1 external clean-room qualification (accepted)

RH-1 qualified the accepted V0.9 payload **from a fresh environment outside the
development checkout** using the npm-distributed DSH CLI. Distinguish these
external facts from the historical source-checkout observations above.

| Component | RH-1 clean-room result |
|---|---|
| DSH CLI | npm `@deepseek-ai/dsh` **0.1.0-rc.6** (bin `dsh`), fresh install |
| OS/platform | Windows 10.0.26200 (x64) |
| Node | `24.14.0` |
| npm | `11.9.0` |
| pnpm | repo build `11.7.0`; fresh-profile install resolved **11.21.0** via Corepack |
| Qualified plugin runtime SHA | `897f39a309638dabe99859d83a2160a5913734f9` |
| Install | `dsh plugin --profile <name> add github:zcx369658780/governed-workflow-for-dsh#897f39a…` |
| allowBuilds | first run `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`; narrow package-specific `allowBuilds` key unblocked; `prepare` (tsdown) built `lib/` self-contained |
| Composition | fresh-profile `--dump-config` = exactly five default rows (governance, evidence, guard, skill, lifecycle tools); no GitHub bootstrap by default |
| Boot | clean boot; services loaded; default no-authority fail-closed; no unsolicited GitHub request |
| Public Issue authority | one unauthenticated GET, no `Authorization` header, `AUTHORITY_OBSERVED` |

The full evidence (pack inventory, lifecycle sequence, isolation proof, caveats)
is in
[`docs/release/TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md`](release/TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md).

## Interface surface relied upon

| Interface | Used for | Reference |
|---|---|---|
| `dsh.bundle.patch` manifest field | Declaring this package as a bundle | `packages/bundle/base/package.json` |
| `cordis.patch.yml` (`insert:` rows with `id` / `name` / `config`) | Mounting the governance + evidence services | `docs/user/develop/basic/publish.md` |
| Cordis `Service` class + `super(ctx, name)` | `GovernanceService` and `GovernanceEvidenceService` | `vendor/cordis/src/service.ts` |
| TypeScript declaration merging (`declare module '@deepseek-ai/cordis'`) | Typing `ctx.governance` / `ctx.governanceEvidence` | `docs/user/develop/framework/service.md` |
| Schemastery `static Config` + `constructor(ctx, config)` | Config-backed authority via plugin configuration | `vendor/schemastery/src/index.ts` |
| `SessionEventMap` declaration merging (`declare module '@deepseek-ai/dsh-session/types'`) | Governance evidence event types | `packages/core/session/src/types.ts` |
| `Session.append(type, data, ...opts)` | Appending evidence (non-surface: no `surfaceOp`) | `packages/core/session/src/index.ts` |
| `Session.deriveMessages()` | Non-surface verification (evidence adds no model message) | `packages/core/session/src/index.ts` |
| `ctx.sessions.flush(session)` | Explicit durability checkpoint | `packages/core/session/src/index.ts` |
| `Session.create(id, { seed })` | Replay/seed verification | `packages/core/session/src/index.ts` |
| `ctx.tools.guard(guard)` + `ToolGuard` (`(exec) => string \| undefined`) | Monotonic runtime guard seam (denial after `tools/pre-execute`, before body) | `packages/core/tools/src/index.ts` |
| `ctx.tools.register(definition)` (fiber-owned) + `defineTool({ name, parameters, output, execute })` | Model-facing `governance_status` / `governance_transition` tools | `packages/core/tools/src/index.ts` + `schema.ts` |
| `ToolRuntime.execute(input)` + `ToolExecution` (`name`, `arguments`) | Deterministic guard/tool unit tests; Code Mode sub-dispatches traverse this same pipeline | `packages/core/tools/src/index.ts` |
| `ctx.skills.register(SkillRegistration)` + `ctx.skills.list()` / `ctx.skills.get()` | Runtime-registered `governed-builder` Skill | `packages/skill/skill/src/index.ts` |
| Cordis `ctx.effect(execute, label)` (returns an awaitable disposer) | Lifecycle-owned GitHub authority bootstrap (abort + timer cleanup on dispose) | `vendor/cordis/src/fiber.ts` |
| Node global `fetch` / `RequestInit` / `Response` | Default public GitHub.com transport (unauthenticated GET) | Node ≥18 standard library |
| `prepare` build script + pnpm `allowBuilds` | Git-hosted TypeScript install path | `docs/user/develop/basic/publish.md` |

## Compatibility risks

- **DSH is in developer preview** and states there will be
  compatibility-breaking changes. The bundle manifest, patch syntax, the
  `Service` base class, the Schemastery config surface, and the session event
  envelope are the most likely to shift; re-verify before each release.
- **Version skew.** The npm latest (`@deepseek-ai/dsh@0.1.0-rc.6`) is newer than
  the tested checkout (`0.1.0-rc.5`). The plugin is smoke-tested against the
  checkout revision; the npm `@deepseek-ai/dsh-session@0.1.0-rc.6` types match
  the checkout's session API (including `ignorable`). Compatibility claims are
  not silently broadened beyond these two tested surfaces.
- **`ignorable` is not settable via `Session.append`; first-party durable reload
  is an upstream blocker.** The envelope supports an `ignorable: true` marker,
  but `Session.append` writes only `type`/`seq`/`time`/`data` with no option to
  set it, and there is no public runtime registration surface for out-of-repo
  event types (`KNOWN_SESSION_EVENT_TYPES` is a generated first-party set; its
  comment defers out-of-repo registration). `PersistenceCoordinator.
  assertEventsSupported()` (verified in `session-persistence/src/coordinator.ts`)
  refuses any stored event where `!KNOWN_SESSION_EVENT_TYPES.has(type) &&
  event.ignorable !== true`, throwing `SessionFormatUnsupportedError`.
  Consequently governance evidence events can be appended, flushed, and replayed
  through the direct `Session.create(seed)` path, but a **first-party persisted
  load/resume refuses the log even when this plugin is installed**. This is a
  current upstream capability blocker, not a false ignorable claim.
- **Git installs require a `prepare` allowlist.** pnpm ≥10 refuses to run a git
  dependency's `prepare` script until the consumer adds the package key to the
  profile's `pnpm-workspace.yaml` under `allowBuilds`. RH-1 proved the exact
  narrow key shape (`dsh-governed-workflow@https://codeload.github.com/...tar.gz/<sha>: true`)
  and that the retry runs `prepare` (tsdown) self-contained.
- **pnpm is resolved via Corepack in a fresh profile.** The repo pins
  `pnpm@11.7.0`; RH-1's fresh profile resolved `11.21.0` through Corepack, and
  `prepare` ran identically under both. This is an observed environment fact,
  not a promise of a fixed pnpm version for every consumer.
- **GitHub REST is an external surface, not a DSH surface.** The V0.8 provider
  uses `GET https://api.github.com/repos/{owner}/{repo}/issues/{n}` with
  `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and
  a stable `dsh-governed-workflow` User-Agent. The unauthenticated primary rate
  limit (currently 60 requests/hour per originating IP) and the
  redirect/transfer behavior (301 on transferred issues) are current GitHub
  constraints, not plugin guarantees; the provider fails closed on `403`/`429`
  and refuses to follow redirects.
- **Types are authored but not shipped yet.** The governance/authority/evidence
  types and their `SessionEventMap`/`Context` merges are fully typed in source
  (typecheck passes), but the package still ships JS only, so external consumers
  cannot yet import the type augmentations.
