# Technical Preview Release Candidate — 2026-08-15

> Author/GPT record for the **Developer Technical Preview**. This is not a
> release/tag: no GitHub prerelease/tag and no npm publish has been created.

## Release target and state

- **Developer Technical Preview** — GitHub-installable and shareable to
  technically capable DSH users.
- **Accepted product stage:** V0.9.
- **Owner Technical Preview decision:** **GO**.
- **Actual GitHub release/tag state:** **none yet** — no tag/prerelease has been
  created; the remaining release-side action is only the actual Owner-side GitHub
  prerelease/tag creation if/when tooling/UI permits.
- **npm:** NOT published.
- **Distribution:** GitHub source install from an exact pinned commit (below).

## SHA role mapping

| Role | SHA |
|---|---|
| Historical RH-1 clean-room runtime qualification | `897f39a309638dabe99859d83a2160a5913734f9` |
| Accepted RH-2 PR head (docs-only quickstart/README/compat) | `a8128c1e0ae70881bb078da7e0e3c94bd849e557` |
| Accepted OMDSH-1 candidate head (dshWorkshop + tracked lib + drift gate) | `fc16eb867831fc92ed44bffe1d7783290a2cb7bc` |
| Accepted OMDSH-1 merged / pre-OMDSH-2 package source | `266f40e0b5eda5b82f1b25444f9f044db65c7634` |

`266f40e0b5eda5b82f1b25444f9f044db65c7634` is the **accepted OMDSH-1 merged /
pre-OMDSH-2 package source** (the `main` at OMDSH-1 merge). It is **not** the
final merged `main` once OMDSH-2 is accepted. The RH-1 SHA
`897f39a309638dabe99859d83a2160a5913734f9` remains the historical clean-room
qualification evidence and is **not** collapsed into any distribution coordinate.

The formal OMDSH Agent Submission `release.ref` / immutable public source SHA
will be re-bound by GPT/Owner to the final merged public SHA **after OMDSH-2 is
accepted and merged**, so the submission includes the OMDSH-2 README /
release-truth convergence.

## Qualification / hardening history

- **RH-1 (accepted):** clean-room pinned install, fresh profile,
  `allowBuilds`/`prepare`, pack, `--dump-config`, boot, full lifecycle, public
  GitHub Issue authority — all PASS. Evidence:
  [`TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md`](TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md).
- **RH-2 (accepted, docs-only relative to RH-1 runtime):** external quickstart,
  README, compatibility record, and this release-candidate record. PR head
  `a8128c1e0ae70881bb078da7e0e3c94bd849e557`.
- **OMDSH-1 (accepted):** author-side packaging/intake hardening — `dshWorkshop`
  manifest, tracked prebuilt `lib/**`, scripts-disabled consumption evidence, and
  a fail-closed generated-lib drift gate. No runtime-semantic change. Candidate
  head `fc16eb867831fc92ed44bffe1d7783290a2cb7bc`; accepted merged / pre-OMDSH-2
  package source `266f40e0b5eda5b82f1b25444f9f044db65c7634`.

## Tested compatibility matrix

| Component | Qualified |
|---|---|
| DSH CLI | npm `@deepseek-ai/dsh` `0.1.0-rc.6` |
| OS | Windows 10.0.26200 (x64) |
| Node | `24.14.0` (plugin declares `^22.19.0 \|\| >=24.0.0`) |
| pnpm | repo `11.7.0`; profile `11.21.0` via Corepack |
| Qualified runtime SHA (RH-1) | `897f39a309638dabe99859d83a2160a5913734f9` |

DSH is **developer preview**; compatibility claims are evidence-bound and must
not be broadened to arbitrary future releases.

## Security / trust-boundary summary

Hard-enforced at the verified seam: accepted authority prerequisite, RUNNING-only
mutation gate (`bash`/`write`/`edit`), terminal-state mutation freeze, lifecycle
transition allowlist. **Not** enforced: `allowedPaths` containment, Bash/Git
semantic parsing, protected-branch Git semantics, GitHub merge/close/successor
actions, authenticated/private GitHub authority, same-process hostile plugin
containment, reviewer `ACCEPTED` state/tool.

## Known limitations / non-blockers

- V0.3 durable custom SessionEvent reload is **upstream-blocked** (in-memory
  evidence works; first-party persisted load/resume does not).
- Public GitHub Issue authority is unauthenticated/read-only/one-shot; private/
  authenticated/GHE/GraphQL/comment/PR authority are out of scope for this preview.
- No npm publication; no GitHub release/tag for this preview (not yet created).

## OMDSH status (external, not implied by OMDSH-1)

OMDSH Workshop independent review, current-baseline verification, and Registry
admission are **future external states** — OMDSH-1 completed author-side intake
preparation only; it does **not** constitute OMDSH approval, verification, or
Registry admission.

## Links

- Quickstart: [`../../docs/technical-preview-quickstart.md`](../../docs/technical-preview-quickstart.md)
- README: [`../../README.md`](../../README.md)
- Compatibility: [`../../docs/dsh-compatibility.md`](../../docs/dsh-compatibility.md)
- RH-1 evidence: [`TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md`](TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md)
- OMDSH review: [`../OMDSH_REVIEW.md`](../OMDSH_REVIEW.md)

## Remaining release-side action (Owner only)

The only remaining release-side action is the actual Owner-side GitHub
prerelease/Technical Preview tag creation if/when tooling/UI permits; release
notes must identify DSH as developer preview and this project as independent
community software.

**Do not create the tag/release here.** The Builder has no authority to
self-accept, merge, close, tag, release, publish, or submit to OMDSH.
