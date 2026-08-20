# IH-1 Reliable Installer — Clean-Room Qualification (2026-08-20)

Terminal classification: **`IH1_RELIABLE_INSTALLER_QUALIFIED_READY_FOR_GPT_REVIEW`**

> R1 update: post-install verification is now **effective-binding based** (exact
> id → name of the five default rows, failing closed on wrong/overridden names and
> ambiguous duplicate ids), and the quickstart documents a **pinned acquisition
> step**. This record reflects the R1 final installer (`6800da3…`).

## Candidate binding

- Candidate branch: `dsh/ih-1-reliable-installer-2026-08-20`.
- **R1 clean-room qualified source / installer commit:** `6800da3f4e1de06b7d5af199974c9110c95f5433`.
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
git -C governed-workflow-for-dsh checkout 6800da3f4e1de06b7d5af199974c9110c95f5433
cd governed-workflow-for-dsh
```

## Installer script

```sh
node scripts/install-dsh-governed-workflow.mjs --profile <name> --ref <40-hex-sha> [--dsh <path>]
```

- Requires an immutable `--ref` (full 40-hex); refuses to install from floating
  `main` (verified: invalid `--ref` → `installer error: --ref must be a full
  40-character lowercase hex commit SHA`, exit 1).
- Installs via `dsh plugin add … --ignore-scripts` (no global script-safety
  relaxation; package-specific scripts-disabled distribution only).
- **Post-install (effective binding):** runs `dsh --profile <name> --dump-config`,
  parses the governed layer, and asserts the exact id → name binding of the five
  default rows. Fails closed on a missing layer/row, a wrong/overridden name, or
  an ambiguous (duplicate) row id — so a profile/home/CLI patch mis-binding is
  detected.
- Does not enable the GitHub Issue authority bootstrap; does not request/store
  credentials; no new runtime dependency (Node built-ins only).

## Observed results (R1 final installer, source `6800da3…`)

- **acquisition:** PASS — pinned clone + checkout resolved the installer.
- **install (installer, scripts-disabled):** PASS — `dsh-governed-workflow@github:…#6800da3…`
  installed with `--ignore-scripts` (pnpm warned "build scripts were ignored");
  `lib/index.js` present; profile dependency pinned to the exact commit.
- **effective-binding verification:** PASS — installer reported
  `installed dsh-governed-workflow@6800da3… into profile "ih1r1" (governed bundle
  effective binding verified)`; `--dump-config` showed the exact five id → name
  bindings and no GitHub bootstrap row.
- **boot:** PASS — load-level boot printed all five governed services loaded,
  default no-authority fail-closed, no unsolicited GitHub request.
- **remove/cleanup:** PASS — `dsh plugin --profile ih1r1 remove
  dsh-governed-workflow` removed the dependency and all governed rows.
- **fail-closed:** PASS — invalid `--ref` and missing `--ref`/`--profile` are
  rejected before any install.

## Focused tests

`test/installer.spec.ts` (16 tests): argument validation, immutable-ref
requirement, command construction, and effective-binding verification
(correct-binding pass; missing layer, missing row, wrong-name override,
duplicate/ambiguous id, and missing-name-binding failures).

## Repository validation

- `pnpm typecheck` PASS.
- `pnpm test` PASS — 183 tests / 13 files (167 existing + 16 installer).
- `pnpm build` PASS (tracked `lib/**` drift clean).
- `git diff --check` PASS.

## Compatibility caveats (observed, non-blocking)

- Fresh profile pnpm resolved `11.22.0` via Corepack (repo pins `11.7.0`).
- The DSH CLI's own transitive native build scripts remain ignored by pnpm
  (`node-pty`, `koffi`, `subprocess-local`, `protobufjs`, `genai`) — unrelated to
  `dsh-governed-workflow`; boot was unaffected.
- Only a Windows clean-room was performed; no Linux/macOS verification is claimed.
