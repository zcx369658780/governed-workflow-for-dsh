# IH-1 Reliable Installer — Clean-Room Qualification (2026-08-20)

Terminal classification: **`IH1_RELIABLE_INSTALLER_QUALIFIED_READY_FOR_GPT_REVIEW`**

## Candidate binding

- Candidate branch: `dsh/ih-1-reliable-installer-2026-08-20`.
- **Clean-room qualified install source:** `f4cd731393bc97760041a69db6144f9aae9541dd`
  (the pinned commit whose tracked `lib/**` + `package.json` were installed
  scripts-disabled). The installer script
  (`scripts/install-dsh-governed-workflow.mjs`) and its focused tests were
  clean-room exercised against this source; the candidate head also carries the
  final cross-platform runner refinement and the docs updates.
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

## Canonical install path (native, scripts-disabled)

```sh
dsh plugin --profile <name> add github:zcx369658780/governed-workflow-for-dsh#<40-hex-sha> --ignore-scripts
```

Observed result (against `f4cd731393bc97760041a69db6144f9aae9541dd`):

- installed `dsh-governed-workflow@github:…#f4cd731…` with `--ignore-scripts`;
- installed `node_modules/dsh-governed-workflow/lib/index.js` present (tracked
  prebuilt `lib/**`, no `prepare` required);
- profile dependency pinned to the exact commit (not a floating branch).

## Installer script

```sh
node scripts/install-dsh-governed-workflow.mjs --profile <name> --ref <40-hex-sha> [--dsh <path>]
```

- Requires an immutable `--ref` (full 40-hex); refuses to install from floating
  `main` (verified: missing `--ref` → `installer error: --ref <40-hex-commit> is
  required (refusing to install from floating main)`, exit 1).
- Installs via `dsh plugin add … --ignore-scripts` (no global script-safety
  relaxation; package-specific scripts-disabled distribution only).
- Post-install: runs `dsh --profile <name> --dump-config` and fails unless the
  `# == dsh-governed-workflow` layer and all five default rows are present.
- Does not enable the GitHub Issue authority bootstrap; does not request/store
  credentials; no new runtime dependency (Node built-ins only).

## Observed results

- **install (native + installer):** PASS — pinned commit installed, `lib/index.js`
  present, `--dump-config` shows exactly the governed layer + five rows
  (`governed-workflow`, `-evidence`, `-guard`, `-skill`, `-lifecycle-tools`), no
  GitHub bootstrap row.
- **boot:** PASS — load-level boot printed all five governed services loaded
  (`governance`, `evidence`, `guard`, `skill`, `lifecycle-tools`), default
  no-authority fail-closed, no unsolicited GitHub request.
- **remove/cleanup:** PASS — `dsh plugin --profile <name> remove
  dsh-governed-workflow` removed the dependency and all governed rows from
  `--dump-config`.
- **fail-closed:** PASS — missing/invalid `--ref` and `--profile` are rejected
  before any install.

## Focused tests

`test/installer.spec.ts` (12 tests): argument validation, immutable-ref
requirement, command construction (`--ignore-scripts`, pinned `github:` spec,
dump-config args), and post-install dump-config verification (layer + five rows,
missing-row and missing-layer failure cases).

## Repository validation

- `pnpm typecheck` PASS.
- `pnpm test` PASS — 179 tests / 13 files (167 existing + 12 installer).
- `git diff --check` PASS.

## Compatibility caveats (observed, non-blocking)

- Fresh profile pnpm resolved `11.22.0` via Corepack (repo pins `11.7.0`); the
  install behaved identically to prior `11.21.0` observations.
- The DSH CLI's own transitive native build scripts remain ignored by pnpm
  (`node-pty`, `koffi`, `subprocess-local`, `protobufjs`, `genai`) — unrelated to
  `dsh-governed-workflow`; boot was unaffected.
- Only a Windows clean-room was performed in this task; no Linux/macOS
  verification is claimed.
