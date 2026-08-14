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
| `@deepseek-ai/cordis` | `4.0.1` |
| `@deepseek-ai/schemastery` | `3.18.1` |
| Node.js | `^22.19.0 || >=24.0.0` (tested on `24.14.0`) |
| pnpm | `11.7.0` |

The load smoke tests (V0, V0.1, V0.2) ran against the local `0.1.0-rc.5`
checkout at the revision above, via `pnpm dsh` (source execution). Compatibility
is pinned to that revision, not to a moving `main`.

## Interface surface relied upon

| Interface | Used for | Reference |
|---|---|---|
| `dsh.bundle.patch` manifest field | Declaring this package as a bundle whose patch file is `cordis.patch.yml` | `packages/bundle/base/package.json` |
| `cordis.patch.yml` (`insert:` rows with `id` / `name` / `config`) | The bundle layer that mounts the plugin and supplies its config | `docs/user/develop/basic/publish.md` |
| Cordis `Service` class + `super(ctx, name)` | The `GovernanceService` registered on `ctx.governance` | `vendor/cordis/src/service.ts` |
| TypeScript declaration merging (`declare module '@deepseek-ai/cordis'`) | Typing `ctx.governance` | `docs/user/develop/framework/service.md` |
| Schemastery `static Config` + `constructor(ctx, config)` | Config-backed authority via plugin configuration (`z.object`, `z.any`) | `vendor/schemastery/src/index.ts` |
| Cordis plugin lifecycle (`ctx.plugin`, fiber `dispose`, reversible effects) | Service load/disposal; tested with a real `new Context()` | `docs/cordis-api/service.md` |
| Profile composition (`dsh --profile <name>`, `--dump-config`, `--patch`) | Local load / resolution smoke test | `apps/cli/reference/README.md` |
| `dsh plugin --profile <name> add <pkg-or-git-spec>` | Installing the bundle into a profile | `apps/cli/reference/README.md` |
| `prepare` build script + pnpm `allowBuilds` | Git-hosted TypeScript install path | `docs/user/develop/basic/publish.md` |

## Compatibility risks

- **DSH is in developer preview** and states there will be
  compatibility-breaking changes. The bundle manifest, patch syntax, the
  `Service` base class, and the Schemastery config surface are the most likely
  to shift; re-verify before each release.
- **Version skew.** The npm latest (`@deepseek-ai/dsh@0.1.0-rc.6`) is newer than
  the tested checkout (`0.1.0-rc.5`). Re-checked during V0.1 and V0.2; the
  plugin is still verified against the checkout revision and has **not** been
  re-verified against the published CLI. Compatibility claims are not silently
  broadened.
- **Git installs require a `prepare` allowlist.** pnpm ≥10 refuses to run a git
  dependency's `prepare` script until the consumer adds the package key to the
  profile's `pnpm-workspace.yaml` under `allowBuilds`. This is a documented,
  expected step, not a defect.
- **Types are authored but not shipped yet.** The `governance` service, the
  authority model, and their `ctx.governance` declaration merging are fully
  typed in source (and typecheck passes), but the package still ships JS only,
  so external consumers cannot yet import the type augmentations. Types are
  reintroduced as a `.d.ts` when a later task wires provider/guard/evidence
  packages that must compile against the service.
