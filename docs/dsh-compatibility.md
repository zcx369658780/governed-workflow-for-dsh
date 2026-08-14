# DSH compatibility

This document records the DeepSeek Harness (DSH) version and interface surface
the V0 skeleton was inspected against and smoke-tested with. It is the single
place to update when re-verifying against a newer DSH.

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

The load smoke test ran against the local `0.1.0-rc.5` checkout at the revision
above, via `pnpm dsh` (source execution). Compatibility is pinned to that
revision, not to a moving `main`.

## Interface surface relied upon

| Interface | Used for | Reference |
|---|---|---|
| `dsh.bundle.patch` manifest field | Declaring this package as a bundle whose patch file is `cordis.patch.yml` | `packages/bundle/base/package.json` |
| `cordis.patch.yml` (`insert:` rows with `id` / `name`) | The bundle layer that mounts the plugin | `docs/user/develop/basic/publish.md` |
| Cordis plugin module (`name`, `apply(ctx)`, `ctx.effect`) | The plugin entry point and reversible effects | `docs/user/develop/framework/index.md` |
| Profile composition (`dsh --profile <name>`, `--dump-config`, `--patch`) | Local load / resolution smoke test | `apps/cli/reference/README.md` |
| `dsh plugin --profile <name> add <pkg-or-git-spec>` | Installing the bundle into a profile | `apps/cli/reference/README.md` |
| `prepare` build script + pnpm `allowBuilds` | Git-hosted TypeScript install path | `docs/user/develop/basic/publish.md` |

## Compatibility risks

- **DSH is in developer preview** and states there will be
  compatibility-breaking changes. The bundle manifest and patch syntax above are
  the surface most likely to shift; re-verify `dsh.bundle.patch` and the row
  shape before each release.
- **Version skew.** The npm latest (`@deepseek-ai/dsh@0.1.0-rc.6`) is newer than
  the tested checkout (`0.1.0-rc.5`). The skeleton was verified against the
  checkout revision; it has not been re-verified against the published CLI.
- **Git installs require a `prepare` allowlist.** pnpm ≥10 refuses to run a git
  dependency's `prepare` script until the consumer adds the package key to the
  profile's `pnpm-workspace.yaml` under `allowBuilds`. This is a documented,
  expected step, not a defect.
- **No `.d.ts` emitted in V0.** The plugin is loaded by name (not type-imported
  by consumers), so V0 ships JS only. Types are reintroduced when the governance
  service/authority-provider modules export real services.
