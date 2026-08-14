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
| `ToolRuntime.execute(input)` + `ToolExecution` (`name`, `arguments`) | Deterministic guard unit tests; Code Mode sub-dispatches traverse this same pipeline | `packages/core/tools/src/index.ts` |
| `ctx.skills.register(SkillRegistration)` + `ctx.skills.list()` / `ctx.skills.get()` | Runtime-registered `governed-builder` Skill | `packages/skill/skill/src/index.ts` |
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
  profile's `pnpm-workspace.yaml` under `allowBuilds`.
- **Types are authored but not shipped yet.** The governance/authority/evidence
  types and their `SessionEventMap`/`Context` merges are fully typed in source
  (typecheck passes), but the package still ships JS only, so external consumers
  cannot yet import the type augmentations.
