# Technical Preview RH-1 — Clean-Room Qualification (2026-08-15)

Terminal classification: **`TECHNICAL_PREVIEW_RH1_R1_PACK_INVENTORY_EVIDENCE_CONVERGED_PENDING_GPT_REVIEW`**

## 1–4. Baseline, branch, and candidate

- Refreshed `origin/main` SHA: `897f39a309638dabe99859d83a2160a5913734f9` (Merge PR #22).
- Pinned plugin under qualification: `github:zcx369658780/governed-workflow-for-dsh#897f39a309638dabe99859d83a2160a5913734f9` (exact commit; no branch/tag/HEAD substitution).
- Candidate branch: `dsh/rh-1-technical-preview-clean-room-qualification`.
- Final candidate commit: recorded in the PR head (`git rev-parse HEAD` after committing this report).

## 5. Exact toolchain versions

| Component | Version |
|---|---|
| OS/platform | Windows 10.0.26200 (x64) |
| Node | v24.14.0 |
| npm | 11.9.0 |
| pnpm | 11.7.0 (repo `packageManager`); profile install resolved **11.21.0** via Corepack |
| git | 2.53.0.windows.1 |
| DSH CLI | npm `@deepseek-ai/dsh` **0.1.0-rc.6** (bin `dsh`) |
| DSH source/docs consulted | checkout `0.1.0-rc.5` @ `47f943859bef60e4160492346772ded9b24f765a` (`docs/user/develop/basic/publish.md`) |
| Pinned plugin SHA | `897f39a309638dabe99859d83a2160a5913734f9` |

## 6. Clean-room isolation description

Qualification ran entirely from a disposable root under the system temp directory
(`$TEMP/rh1-qual/`), **disjoint from the `governed-workflow-for-dsh` development
checkout**. Isolated components:

- `dsh-cli/` — npm-distributed DSH CLI install (`@deepseek-ai/dsh@0.1.0-rc.6`).
- `home/` — `$DSH_HOME` (fresh, empty) and its `profiles/rh1` profile.
- `pack-src/` — fresh `git clone` of the pinned commit for pack sanity.
- `home/profiles/rh1/` — lifecycle/external-authority smoke workspace.

No development-checkout `node_modules`, `lib/`, workspace links, or prebuilt
artifacts were used. The installed package lives at
`$DSH_HOME/profiles/rh1/node_modules/dsh-governed-workflow`.

## 7. Pinned install / `allowBuilds` / `prepare` evidence

- First install: `dsh plugin --profile rh1 add github:zcx369658780/governed-workflow-for-dsh#897f39a…` **failed** with
  `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` — the expected pnpm ≥10 build-script safety gate.
- Remediation (narrow, package-specific; no global/dangerous bypass):
  ```yaml
  allowBuilds:
    dsh-governed-workflow@https://codeload.github.com/zcx369658780/governed-workflow-for-dsh/tar.gz/897f39a309638dabe99859d83a2160a5913734f9: true
  ```
  added to the fresh profile's `pnpm-workspace.yaml` only.
- Retry succeeded: the git package's `prepare` (`tsdown`) built the published
  entry points self-contained (`lib/` = 10 files, ~65.9 kB total) from the fetched
  source, then `dsh-governed-workflow` was installed.
- Provenance: profile `package.json` dependency =
  `"dsh-governed-workflow": "github:zcx369658780/governed-workflow-for-dsh#897f39a309638dabe99859d83a2160a5913734f9"`
  (pinned commit, not a moving branch); installed `node_modules/dsh-governed-workflow`
  is a real directory (not a `link:`/workspace symlink).

## 8. Pack / archive contents summary

In the isolated `pack-src` clone (`pnpm install --frozen-lockfile`, then `pnpm pack`):

- `prepare` = `tsdown` (builds from `src/`, self-contained; no sibling-monorepo assumption).
- Tarball `dsh-governed-workflow-0.1.0.tgz` contains exactly:
  - `package/lib/*.js` (10 built entries/chunks, incl. `index.js`, `guard-service.js`, `lifecycle-tool-service.js`, `github-issue-provider.js`, `github-issue-authority-service.js`);
  - `package/src/*.ts` (13 source files — declared in `files`);
  - `package/cordis.patch.yml`, `package/package.json`, `package/README.md`, `package/LICENSE`.
- **Not packaged:** `test/`, `docs/`, `.github/`, workflows, `pnpm-lock.yaml`, `node_modules/`, secrets/private files.
- `package.json` `files` boundary = `["lib","cordis.patch.yml","src"]`; `dsh.bundle.patch` → `./cordis.patch.yml`.

## 9. `--dump-config` composition proof

`dsh --profile rh1 --dump-config` showed the effective `# == dsh-governed-workflow`
layer with exactly the five default rows and no duplicate:

- `governed-workflow` (governance service)
- `governed-workflow-evidence` (evidence service)
- `governed-workflow-guard` (mutation guard)
- `governed-workflow-skill` (governed-builder Skill)
- `governed-workflow-lifecycle-tools` (lifecycle-tool service)

The opt-in `github-issue-authority-service` row is **absent** → default bundle does
not enable the network bootstrap.

## 10. Boot result

Booting `dsh --profile rh1` from the fresh profile printed (no fatal stderr):

```text
[governed-workflow] evidence service loaded
[governed-workflow] governance service loaded
[governed-workflow] authority AUTHORITY_UNAVAILABLE
[governed-workflow] mutation runtime guard registered (bash, write, edit)
[governed-workflow] lifecycle tools registered (governance_status, governance_transition)
```

No missing `lib/`, module-resolution, bundle-patch, peer-dependency, or injection
failure; no unsolicited GitHub authority request (authority is the synchronous
config provider reporting `AUTHORITY_UNAVAILABLE`).

## 11. Complete governed lifecycle smoke (installed package)

A Node script ran from `$DSH_HOME/profiles/rh1`, importing only the **installed**
`dsh-governed-workflow` package (peers resolved via the DSH flat fallback). Exact
observed sequence:

```text
UNINITIALIZED/no authority -> write denied GOVERNANCE_DENY_NO_AUTHORITY
                            -> read allowed (not gated)
observeAuthority            -> AUTHORITY_OBSERVED
                            -> write denied GOVERNANCE_DENY_NOT_RUNNING
governance_status           -> { state: AUTHORITY_OBSERVED, authorityAccepted: true, taskId: rh1-smoke }
governance_transition(OBSERVE_AUTHORITY) -> rejected (arg validation; not model-facing)
ADMIT_TASK                  -> TASK_ADMITTED
                            -> write denied GOVERNANCE_DENY_NOT_RUNNING
RUN                         -> RUNNING
                            -> write allowed (tool body invoked)
COMPLETE                    -> COMPLETED
                            -> write denied GOVERNANCE_DENY_TERMINAL_STATE (body not invoked)
SUBMIT_REVIEW               -> REVIEW_PENDING
                            -> write denied GOVERNANCE_DENY_TERMINAL_STATE
                            -> read still allowed
```

Final state `REVIEW_PENDING`. `governance_transition` exposed only
`ADMIT_TASK`/`RUN`/`BLOCK`/`COMPLETE`/`SUBMIT_REVIEW`; no model-facing
`OBSERVE_AUTHORITY` and no reviewer/owner `ACCEPTED` transition.

## 12. Optional public GitHub Issue authority result

A second installed-package smoke enabled the V0.8 bootstrap against this open
RH-1 Issue (#23) with a real unauthenticated fetch:

```text
state: AUTHORITY_OBSERVED
fetchCount: 1
authorizationSeen: false
taskId: github-issue:zcx369658780/governed-workflow-for-dsh#23
baselineSha: 897f39a309638dabe99859d83a2160a5913734f9
candidateBranch: dsh/rh-1-technical-preview-clean-room-qualification
snapshot frozen: true
```

No PAT/`GITHUB_TOKEN`/`GH_TOKEN`/OAuth/private-repo/credential was used.

## 13. Contamination / isolation proof (Phase G)

- Profile dependency is `github:…/#897f39a…`, **not** `link:`/`workspace:`.
- No `link:`/`workspace:` reference to the development checkout exists in profile files.
- Installed `node_modules/dsh-governed-workflow` is a real directory (its
  `cordis.patch.yml` is a pnpm store hardlink — normal pnpm install behavior, not a
  development-checkout link).
- The development checkout `git status` remained clean throughout — no runtime/product file changed.
- No release/tag/npm publish occurred.

## 14. Blockers / compatibility caveats

- **No blocking defect found.** Terminal classification is PASS.
- Minor observations (non-blocking):
  1. Profile pnpm resolved to **11.21.0** via Corepack (repo pins 11.7.0); `prepare` ran identically under both.
  2. `pnpm` emitted a peer-dependency warning during profile install; peers resolved at runtime via the DSH flat fallback and boot/smoke passed.
  3. The DSH CLI install itself left some DSH-owned transitive native build scripts ignored (`node-pty`, `koffi`, `subprocess-local`, `protobufjs`, `genai`) — unrelated to `dsh-governed-workflow`; boot was unaffected.

## 15–18. Scope and non-action confirmation

- Exact changed paths: only `docs/release/TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md`.
- No runtime/package/test/workflow/README/`docs/governance/*` changes.
- No self-accept, merge, close, successor creation, release/tag, or npm publish.
