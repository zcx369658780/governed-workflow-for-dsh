# OMDSH Review — dsh-governed-workflow (Profile Bundle intake evidence)

> Concise audit record for OMDSH Workshop intake. This document is **not** OMDSH
> approval and **not** Registry admission — those remain separate Owner/GPT and
> OMDSH maintainer steps.

## Baseline and candidate binding

- **Refreshed `origin/main`:** `2562b659d271715a00aed2375d2a08ac6a05302b` (Merge PR #26).
- **OMDSH Workshop revision consulted:** `omdsh-dev/dsh-hub-workshop` @
  `40841e789ef2f2bcd2d90d3e5586877409da31a8`
  (`INTAKE.md`, `package-manifest.schema.json`, `submission.schema.json`,
  `scripts/intake.mjs` + `workshop-manifest-lib.mjs`).
- **Current public baseline:** `@deepseek-ai/dsh@0.1.0-rc.6`.
- **Scripts-disabled verified runtime SHA:** `5730680724da83b38eab46c5a72ef0a265022b50`.
- **Final candidate head:** the PR head that includes this file (recorded in the
  completion comment; the v2 submission binds `release.ref` to that exact head).

## Project classification

- **kind:** `extension` · **category:** `workflow`
- **management:** `profile-bundle` / **protocol:** `harness-profile`
- **artifact:** `cordis.patch.yml` (the accepted five-row default bundle layer)

## Package manifest summary (`package.json#dshWorkshop`)

`omdsh-workshop-package/v1` · `type: plugin` · `integration.protocol: harness-profile`
· `install.mode: transactional` (adapter `profile-bundle`, `generation-rollback`,
`touchesCurrentBeforeActivation: false`) · `lifecycle.activation: restart-profile`,
`dispose: unknown` · `compatibility.dshVersions: ["0.1.0-rc.6"]` · capability
`governance-status` (kind `tool`).

Validated against the current `package-manifest.schema.json` (JSON Schema
2020-12) and the Workshop `validateWorkshopManifest` — both pass with no errors.

## Scripts-disabled distribution proof

The pinned commit now **tracks the canonical prebuilt `lib/**`** (10 files,
built by `tsdown` from `src/**`; CI enforces `git diff --exit-code -- lib` after a
clean rebuild). A fresh profile install with `--ignore-scripts`:

1. fetched `github:zcx369658780/governed-workflow-for-dsh#5730680…` (pnpm warned
   "build scripts were ignored");
2. the installed package contained `lib/index.js` (the declared `main`) without
   running `prepare`;
3. `dsh --profile omdsh1 --dump-config` showed the expected five default rows
   (governance, evidence, guard, skill, lifecycle tools) and **no** GitHub bootstrap;
4. normal boot loaded all five governed services with no fatal error and no
   unsolicited GitHub request.

## Real capability invocation

`governance_status` was invoked through the installed package via the ToolRuntime
with empty arguments. Observed (bounded, read-only, matches the manifest target):

```json
{ "state": "UNINITIALIZED", "authorityAccepted": false, "taskId": null,
  "lastAction": null, "lastOk": null, "lastFrom": null, "lastTo": null }
```

## Remove / reinstall

`dsh plugin --profile omdsh1 remove dsh-governed-workflow` removed the dependency
and the governed-workflow layer/rows (dump-config no longer listed them); the
base profile remained composable. Reinstall reproduced the same pinned commit
and dump-config listed exactly the five rows again — **no duplicates**.

## Permissions / external-effects declaration and trust boundary

Declared `permissions` (derived from repository truth, not speculative):

`harness:tool`, `harness:skill`, `harness:guard`, `session:append`,
`network:read`, `credentials:none`, `subprocess:none`, `native-code:none`.

- The bundle registers model-facing lifecycle tools (`governance_status`,
  `governance_transition`), a ToolRuntime mutation guard, and the
  `governed-builder` Skill.
- Evidence is appended through the DSH Session service (`session:append`).
- The default bundle is **no-network**; the **opt-in** public GitHub Issue
  authority provider can perform one fixed-host unauthenticated GitHub.com read
  when explicitly enabled (`network:read`). It reads no credentials/tokens
  (`credentials:none`), spawns no subprocesses (`subprocess:none`), and loads no
  native code (`native-code:none`).
- `network:none` is intentionally **not** declared because the opt-in GitHub
  provider exists.

## Known limitations

- V0.3 durable custom SessionEvent reload is upstream-blocked (in-memory evidence
  works; first-party persisted load/resume does not).
- No hard `allowedPaths` filesystem containment; no Bash/Git semantic parsing or
  protected-branch enforcement; no GitHub merge/close/successor runtime enforcement.
- GitHub authority is public, unauthenticated, read-only, one-shot (fixed
  `api.github.com`); no private/authenticated/GHE/GraphQL/comment/PR authority.
- No reviewer/owner `ACCEPTED` state/tool; independent review is outside the runtime.

## Evidence fields

- `install` and `remove`: this file (install, boot, capability, remove, and
  reinstall are recorded above).
- `failureIsolation`: `null` — no OMDSH-compatible failure-injection evidence is
  produced in this task.
- `hotReload`: `null` — hot reload is not claimed; activation is `restart-profile`.

## Confirmation

This record does **not** claim OMDSH approval, Registry admission, or any
verification beyond the scripts-disabled install/dump/boot/capability/remove/
reinstall truth above. The OMDSH submission is a separate Owner/GPT step.
