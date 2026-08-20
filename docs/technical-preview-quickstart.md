# Technical Preview Quickstart (5–10 minutes)

A concise, copy-paste guide for a technically capable DeepSeek Harness user with
GitHub access and no knowledge of this project's internal history.

`dsh-governed-workflow` is an **independent community plugin** for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It is
**not affiliated with or endorsed by DeepSeek**. DeepSeek Harness itself is in
**developer preview** and may introduce breaking changes.

> Distribution for this Developer Technical Preview is a **GitHub source install
> from an exact pinned commit**. The package is **not published to npm**.

## 1. What the plugin gives you

It reproduces a Codex-style governed Builder workflow inside DSH, where:

```text
GitHub Issue authority
  -> DSH observes authority (AUTHORITY_OBSERVED)
  -> ADMIT_TASK -> RUN
  -> Builder work
  -> BLOCK | COMPLETE
  -> SUBMIT_REVIEW
  -> independent human/GPT review decides acceptance/merge
```

In practical terms:

- Task authority is **explicit** (a public GitHub Issue with a machine-readable block).
- Mutation stays **frozen** until the lifecycle is exactly `RUNNING`.
- Terminal Builder states (`BLOCKED`, `COMPLETED`, `REVIEW_PENDING`) **freeze mutation again**.
- Acceptance/merge stays **outside Builder control** — the Builder cannot self-accept.

## 2. Tested prerequisites

| Item | Fact |
|---|---|
| DSH CLI | npm `@deepseek-ai/dsh` `0.1.0-rc.6` |
| DSH upstream | developer preview; breaking changes may occur |
| Node | plugin declares `^22.19.0 \|\| >=24.0.0`; clean-room qualified on `24.14.0` |
| pnpm | repo `11.7.0`; clean-room profile install resolved `11.21.0` via Corepack |
| GitHub | a public GitHub.com Issue; no credentials/PAT/token |

These are qualified/tested facts, not a broad support guarantee for arbitrary
future DSH releases.

## 3. Fresh profile + pinned GitHub install

### Step 0 — acquire the installer (pinned)

The installer is a repository script, so a fresh environment must first obtain it
from a **pinned commit** (never floating `main`):

```sh
git clone https://github.com/zcx369658780/governed-workflow-for-dsh.git
git -C governed-workflow-for-dsh checkout dee7a2573e40df7b3f7c63c8ee29efd30ebccd97
cd governed-workflow-for-dsh
```

### Canonical path: the maintained installer

Run the acquired installer with an **explicit immutable commit**:

```sh
node scripts/install-dsh-governed-workflow.mjs --profile governed --ref dee7a2573e40df7b3f7c63c8ee29efd30ebccd97
```

- `--ref` is **required** (a full 40-character commit SHA) — the installer
  refuses to install from floating `main`.
- The installer runs `dsh plugin --profile <name> add github:…#<ref>
  --ignore-scripts` (no global script-safety relaxation) and then verifies the
  effective governed bundle layer — the exact id → name binding of the five
  default rows — via `--dump-config`, failing closed on a wrong/overridden name
  or an ambiguous (duplicate) row id.
- It never enables the GitHub Issue authority bootstrap and never reads
  credentials.

### Equivalent native command

The installer wraps this native DSH command (scripts-disabled, pinned):

```sh
dsh plugin --profile governed add github:zcx369658780/governed-workflow-for-dsh#dee7a2573e40df7b3f7c63c8ee29efd30ebccd97 --ignore-scripts
```

### Historical RH-1 qualification provenance

The earlier RH-1 clean-room qualification used commit
`897f39a309638dabe99859d83a2160a5913734f9` with the `prepare`/`allowBuilds` path.
That SHA remains valid **historical qualification evidence**, not the canonical
current install coordinate (the package now ships tracked prebuilt `lib/**`, so
`--ignore-scripts` install is sufficient and no `allowBuilds` entry is required).

### Expected first-run safety gate (legacy `prepare` path only)

If you install a **pre-IH-1 commit without `--ignore-scripts`**, pnpm ≥10 refuses
to run a git dependency's `prepare` build until it is allowed, failing with:

```text
ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED
```

`dsh` prints the **exact package key to copy**. Add that narrow key to the fresh
profile's `pnpm-workspace.yaml` (under `$DSH_HOME/profiles/<name>/`), then re-run
the `add`. The RH-1-proven shape is:

```yaml
allowBuilds:
  dsh-governed-workflow@https://codeload.github.com/zcx369658780/governed-workflow-for-dsh/tar.gz/897f39a309638dabe99859d83a2160a5913734f9: true
```

Copy the key pnpm actually prints (it must match the resolved git fetch). This
grants permission to run **that reviewed package's** install-time `prepare` — the
reason exact-SHA pinning matters. Do **not** use global build-script relaxation
or broad dangerous bypasses.

## 4. Verify installation before use

```sh
dsh --profile governed --dump-config
```

Success looks like:

- exactly **one** `# == dsh-governed-workflow` layer;
- exactly **five** default rows: governance, evidence, mutation guard,
  `governed-builder` Skill, lifecycle tools;
- **no** `github-issue-authority-service` row (the network bootstrap is not
  enabled by default).

Then boot:

```sh
dsh --profile governed
```

Expected default (no authority) behavior: governance loads fail-closed
(`authority AUTHORITY_UNAVAILABLE`), and protected mutation tools are denied
with `GOVERNANCE_DENY_NO_AUTHORITY`. No GitHub request is made by default.

## 5. Copy-paste GitHub Issue authority block

Put this V1 block at the **top** of a public, **open** GitHub Issue body
(replace placeholders with your own values):

```text
<!-- dsh-governed-workflow-authority:v1
{
  "baselineRef": "main",
  "baselineSha": "<40-hex-baseline-SHA>",
  "candidateBranch": "<dedicated-branch>",
  "allowedPaths": ["src/**"],
  "protectedBranches": ["main"]
}
-->
```

- `allowedPaths` is **authority metadata / guidance only** — it is **not** hard
  filesystem containment.
- The Issue must be **open**; a closed Issue or a PR payload fails closed.
- Repository identity is configured **outside** the block and is provider-derived;
  the block cannot override `source`/`repository`/`taskId`/`taskReference`.
- The public provider is **unauthenticated, read-only, one-shot**, fixed to
  `https://api.github.com`. No `PAT`/`GITHUB_TOKEN`/`GH_TOKEN` is used.
- The default bundle makes **no** GitHub request until the bootstrap is enabled.

## 6. Enable the public Issue authority bootstrap

Add this patch operation to your profile's own patch layer
(`$DSH_HOME/profiles/<name>/cordis.patch.yml`):

```yaml
- insert:
    - id: governed-workflow-github
      name: dsh-governed-workflow/github-issue-authority-service
      config:
        repository: OWNER/REPO
        issueNumber: 123
        timeoutMs: 12000   # optional, 1000–60000, default 12000
```

`repository` must be exactly `OWNER/REPO`; `issueNumber` must be a positive safe
integer. On boot the bootstrap performs one unauthenticated GET and admits the
Issue's authority, reaching `AUTHORITY_OBSERVED`.

## 7. Builder lifecycle usage

Model-facing tools: `governance_status` (read-only) and `governance_transition`.

1. Check `governance_status` to confirm state and accepted authority.
2. After `AUTHORITY_OBSERVED`, call `governance_transition(ADMIT_TASK)`.
3. Call `governance_transition(RUN)`.
4. Perform the authorized Builder work (mutation is now allowed in `RUNNING`).
5. From `RUNNING` only: `COMPLETE` on success, or `BLOCK` on a truthful blocker.
6. Call `governance_transition(SUBMIT_REVIEW)`.
7. Stop for independent review.

**pre-RUNNING blocker rule:** if execution cannot validly reach `RUNNING`, do
**not** call `BLOCK` merely to manufacture a terminal state — `BLOCK`/`COMPLETE`
are only valid from `RUNNING`, and the current state is already fail-closed.
Report a truthful external `BLOCKED_<reason>` and stop.

`governance_transition` exposes only: `ADMIT_TASK`, `RUN`, `BLOCK`, `COMPLETE`,
`SUBMIT_REVIEW`. There is **no** model-facing `OBSERVE_AUTHORITY`, `ACCEPTED`,
merge, close, release, or successor action.

## 8. Trust boundary — what is and is not enforced

**Hard-enforced at the verified runtime seam:**

- accepted authority prerequisite;
- RUNNING-only mutation gate for `bash`, `write`, `edit`;
- terminal-state mutation freeze;
- lifecycle transition allowlist.

**NOT hard-enforced (documented limitations, not hidden):**

- `allowedPaths` filesystem containment;
- Bash/Git command semantic parsing;
- protected-branch Git semantics;
- GitHub merge/close/successor actions;
- authenticated/private GitHub authority;
- arbitrary same-process hostile plugin containment;
- reviewer/owner `ACCEPTED` state/tool.

**Evidence durability:** in-memory governance evidence append/replay works;
first-party persisted SessionEvent load/resume remains **upstream-blocked** (the
V0.3 `ignorable` limitation). This limitation is stated, not worked around.

## 9. End-to-end success condition

The preview is operating correctly when you can observe:

- [ ] pinned plugin installed from the exact SHA;
- [ ] five-row `--dump-config` (no default GitHub bootstrap);
- [ ] default no-authority mutation denial;
- [ ] Issue bootstrap reaches `AUTHORITY_OBSERVED` when enabled;
- [ ] mutation denied before `RUNNING`;
- [ ] authorized mutation allowed in `RUNNING`;
- [ ] `COMPLETE`/`BLOCK` freezes mutation;
- [ ] `SUBMIT_REVIEW` reaches `REVIEW_PENDING`;
- [ ] the independent reviewer — not the Builder — decides acceptance/merge.

See [RH-1 clean-room qualification evidence](release/TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md)
for the exact commands, versions, and observed results behind this quickstart.
