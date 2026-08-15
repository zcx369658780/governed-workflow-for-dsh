# Technical Preview Release Candidate — 2026-08-15

> Owner/GPT shipping checklist for the **Developer Technical Preview**. This is
> not an architecture document and it is not a release/tag: no tag, prerelease,
> or npm publish has been created.

## Release target

- **Developer Technical Preview** — GitHub-installable and shareable to
  technically capable DSH users.
- **Accepted product stage:** V0.9.
- **Distribution for this preview:** GitHub source install from an exact pinned
  commit. **npm is NOT published.**

## Qualification reference

- RH-1 (accepted): clean-room pinned install, fresh profile, `allowBuilds`/
  `prepare`, pack, `--dump-config`, boot, full lifecycle, and public GitHub
  Issue authority — all PASS.
- **Qualified runtime SHA:** `897f39a309638dabe99859d83a2160a5913734f9`.
- RH-1 evidence: [`TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md`](TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md).
- RH-2 (this task): external quickstart, README, compatibility, and this
  release-candidate record.

## RH-2 candidate head binding

The final RH-2 candidate head is the PR head SHA. Record it here at merge time:
`<RH-2-final-head-SHA>` (filled by the reviewer/owner from the accepted PR, not
by the Builder). The user-facing install must reference the **RH-1-qualified
runtime SHA** `897f39a309638dabe99859d83a2160a5913734f9`, since RH-1/RH-2 merge
commits are documentation-only relative to that runtime payload.

## Tested compatibility matrix

| Component | Qualified |
|---|---|
| DSH CLI | npm `@deepseek-ai/dsh` `0.1.0-rc.6` |
| OS | Windows 10.0.26200 (x64) |
| Node | `24.14.0` (plugin declares `^22.19.0 \|\| >=24.0.0`) |
| pnpm | repo `11.7.0`; profile `11.21.0` via Corepack |
| Plugin runtime SHA | `897f39a309638dabe99859d83a2160a5913734f9` |

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
- No npm publication, no GitHub release/tag for this preview.

## Links

- Quickstart: [`../../docs/technical-preview-quickstart.md`](../../docs/technical-preview-quickstart.md)
- README: [`../../README.md`](../../README.md)
- Compatibility: [`../../docs/dsh-compatibility.md`](../../docs/dsh-compatibility.md)
- RH-1 evidence: [`TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md`](TECHNICAL_PREVIEW_RH1_CLEAN_ROOM_QUALIFICATION_2026_08_15.md)

## Final pre-release checks (Owner/GPT only, after RH-2 merge)

1. Re-fetch final `main`.
2. Verify no open release blocker.
3. Choose **HOLD** or **GO**.
4. If **GO**: create a GitHub **prerelease / Technical Preview tag** only then —
   not before.
5. Release notes must identify DSH as developer preview and this project as
   independent community software.

**Do not create the tag/release here.** The Builder has no authority to
self-accept, merge, close, tag, release, or publish.
