# IH-1 Reliable Installer — Clean-Room Qualification (2026-08-20)

Terminal classification: **`IH1_RELIABLE_INSTALLER_QUALIFIED_READY_FOR_GPT_REVIEW`**

> R3 update: `parseTopLevelEntries` now honors the DSH dump indentation
> boundary — only `- id:` rows at document column 0 are top-level entries, and
> only the direct 2-space field level carries a row's `name`. Nested ids/names
> inside `config:` blocks never participate in binding checks (nested ids cannot
> satisfy a missing row; nested `config.name` is not the row name). This record
> reflects the R3 final installer (`dee7a25…`); boot/load-level evidence is
> carried forward from the R2 route (R3 changed only the verifier parser).

## Candidate binding

- Candidate branch: `dsh/ih-1-reliable-installer-2026-08-20`.
- **R3 clean-room qualified source / installer commit:** `dee7a2573e40df7b3f7c63c8ee29efd30ebccd97`.
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
git -C governed-workflow-for-dsh checkout dee7a2573e40df7b3f7c63c8ee29efd30ebccd97
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
  --dump-config`, parses **all top-level** entries across every provenance
  section (only `- id:` at document column 0, with `name:` at the direct 2-space
  field level — nested ids/names inside `config:` are ignored), and requires each
  governed id to occur **exactly once** with the exact id → name binding. Fails
  closed on a missing layer/row, a wrong/overridden name, or a globally ambiguous
  (duplicate) row id — so a later profile/home/CLI section inserting the same
  governed id is detected. The governed provenance header is recognized both as
  `# == dsh-governed-workflow` and `# == dsh-governed-workflow, patched by …` (a
  legal config-only patch suffix is not misread as the bundle being absent).
- Does not enable the GitHub Issue authority bootstrap; does not request/store
  credentials; no new runtime dependency (Node built-ins only).

## Observed results (R3 final installer, source `dee7a25…`)

- **acquisition:** PASS — pinned clone + checkout of `dee7a25…` resolved the installer.
- **install (installer, scripts-disabled):** PASS — `dsh-governed-workflow@github:…#dee7a25…`
  installed with `--ignore-scripts` (pnpm warned "build scripts were ignored");
  `lib/index.js` present; profile dependency pinned to the exact commit.
- **real `--dump-config` verification:** PASS — installer reported
  `installed dsh-governed-workflow@dee7a25… into profile "ih1r3" (governed bundle
  effective binding verified)` against the real composed `--dump-config`; nested
  `config` id/name cases are excluded by the indentation-boundary parser
  (adversarial unit tests cover them).
- **boot:** carried forward from the R2 route (R3 changed only the verifier
  parser; the install/execution path is unchanged) — R2 load-level boot printed
  all five governed services loaded, default no-authority fail-closed, no
  unsolicited GitHub request.
- **remove/cleanup:** PASS — `dsh plugin --profile ih1r3 remove
  dsh-governed-workflow` removed the dependency and all governed rows.
- **fail-closed:** PASS — missing `--ref` and invalid `--ref` are rejected
  before any install (both exit 1).

## Focused tests

`test/installer.spec.ts` (21 tests): argument validation, immutable-ref
requirement, command construction, and **global** effective-binding verification —
correct-binding pass; `, patched by …` suffix pass; missing layer/row fail;
wrong-name override fail; later-provenance duplicate id fail; duplicate id with
wrong name fail; globally unique id with wrong name fail; nested governed
id/name in an unrelated row config ignored (PASS); nested governed row does not
satisfy a missing top-level row (FAIL); nested `config.name` is not the row name
(FAIL); cross-section top-level parsing.

## Repository validation

- `pnpm typecheck` PASS.
- `pnpm test` PASS — 188 tests / 13 files (167 existing + 21 installer).
- `pnpm build` PASS (tracked `lib/**` drift clean).
- `git diff --check` PASS.

## Compatibility caveats (observed, non-blocking)

- Fresh profile pnpm resolved `11.22.0` via Corepack (repo pins `11.7.0`).
- The DSH CLI's own transitive native build scripts remain ignored by pnpm
  (`node-pty`, `koffi`, `subprocess-local`, `protobufjs`, `genai`) — unrelated to
  `dsh-governed-workflow`; boot was unaffected.
- Only a Windows clean-room was performed; no Linux/macOS verification is claimed.
