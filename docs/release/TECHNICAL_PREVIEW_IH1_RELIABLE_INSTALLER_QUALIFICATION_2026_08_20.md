# IH-1 Reliable Installer — Clean-Room Qualification (2026-08-20)

Terminal classification: **`IH1_RELIABLE_INSTALLER_QUALIFIED_READY_FOR_GPT_REVIEW`**

> R2 update: `verifyEffectiveBinding` is now **global** — it parses every
> top-level entry of the composed `--dump-config` (across all provenance
> sections), requires each governed id to occur **exactly once** with the exact
> id → name binding, and recognizes both `# == dsh-governed-workflow` and
> `# == dsh-governed-workflow, patched by …` provenance headers. This record
> reflects the R2 final installer (`32f05b8…`).

## Candidate binding

- Candidate branch: `dsh/ih-1-reliable-installer-2026-08-20`.
- **R2 clean-room qualified source / installer commit:** `32f05b8cfe2dea17301761d1ef21651209e965e9`.
- Baseline `main` at task start: `540f65d6753566d1cae820577577f0ed75e9fc43`.

## Clean-room environment

| Component | Observed |
|---|---|
| OS/platform | Windows 10.0.26200 (x64) |
| Node | v24.14.0 |
| npm | 11.9.0 |
| pnpm | 11.22.0 (Corepack-resolved in the fresh profile) |
| DSH CLI | npm `@deepseek-ai/dsh@0.1.0-rc.6` (fresh install) |
| Disposable root | `$TEMP/ih1-qual/` (disjoint from the dev checkout) |

## Acquisition (pinned, no floating `main`)

```sh
git clone https://github.com/zcx369658780/governed-workflow-for-dsh.git
git -C governed-workflow-for-dsh checkout 32f05b8cfe2dea17301761d1ef21651209e965e9
cd governed-workflow-for-dsh
```

## Installer script

```sh
node scripts/install-dsh-governed-workflow.mjs --profile <name> --ref <40-hex-sha> [--dsh <path>]
```

- Requires an immutable `--ref` (full 40-hex); refuses to install from floating
  `main` (verified: invalid `--ref` → `installer error: --ref must be a full
  40-character lowercase hex commit SHA`, exit 1; missing `--ref` → refuses to
  install from floating main, exit 1).
- Installs via `dsh plugin add … --ignore-scripts` (no global script-safety
  relaxation; package-specific scripts-disabled distribution only).
- **Post-install (global effective binding):** runs `dsh --profile <name>
  --dump-config`, parses **all** top-level entries across every provenance
  section, and requires each governed id to occur **exactly once** with the exact
  id → name binding. Fails closed on a missing layer/row, a wrong/overridden
  name, or a globally ambiguous (duplicate) row id — so a later profile/home/CLI
  section inserting the same governed id is detected. The governed provenance
  header is recognized both as `# == dsh-governed-workflow` and
  `# == dsh-governed-workflow, patched by …` (a legal config-only patch suffix is
  not misread as the bundle being absent).
- Does not enable the GitHub Issue authority bootstrap; does not request/store
  credentials; no new runtime dependency (Node built-ins only).

## Observed results (R2 final installer, source `32f05b8…`)

- **acquisition:** PASS — pinned clone + checkout of `32f05b8…` resolved the installer.
- **install (installer, scripts-disabled):** PASS — `dsh-governed-workflow@github:…#32f05b8…`
  installed with `--ignore-scripts` (pnpm warned "build scripts were ignored");
  `lib/index.js` present; profile dependency pinned to the exact commit.
- **global effective-binding verification:** PASS — installer reported
  `installed dsh-governed-workflow@32f05b8… into profile "ih1r2" (governed bundle
  effective binding verified)` against the real composed `--dump-config`; the
  `, patched by …` suffix form and a config-only patch (same id/name) also
  verified PASS, and a later-section duplicate governed id verified FAIL.
- **boot:** PASS — load-level boot printed all five governed services loaded,
  default no-authority fail-closed, no unsolicited GitHub request.
- **remove/cleanup:** PASS — `dsh plugin --profile ih1r2 remove
  dsh-governed-workflow` removed the dependency and all governed rows.
- **fail-closed:** PASS — missing/invalid `--ref` and `--profile` are rejected
  before any install.

## Focused tests

`test/installer.spec.ts` (18 tests): argument validation, immutable-ref
requirement, command construction, and **global** effective-binding verification —
correct-binding pass; `, patched by …` suffix pass; missing layer/row fail;
wrong-name override fail; later-provenance duplicate id fail; duplicate id with
wrong name fail; globally unique id with wrong name fail; cross-section top-level
parsing.

## Repository validation

- `pnpm typecheck` PASS.
- `pnpm test` PASS — 185 tests / 13 files (167 existing + 18 installer).
- `pnpm build` PASS (tracked `lib/**` drift clean).
- `git diff --check` PASS.

## Compatibility caveats (observed, non-blocking)

- Fresh profile pnpm resolved `11.22.0` via Corepack (repo pins `11.7.0`).
- The DSH CLI's own transitive native build scripts remain ignored by pnpm
  (`node-pty`, `koffi`, `subprocess-local`, `protobufjs`, `genai`) — unrelated to
  `dsh-governed-workflow`; boot was unaffected.
- Only a Windows clean-room was performed; no Linux/macOS verification is claimed.
