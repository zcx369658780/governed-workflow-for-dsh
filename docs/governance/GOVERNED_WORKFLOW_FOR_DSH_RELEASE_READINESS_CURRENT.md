# Governed Workflow for DSH — Release Readiness (CURRENT)

> Post-V0.9 release-readiness snapshot for external users.
> Recorded against live `main` SHA `658261924d225792998c495d97209e2dcaa06714`.
> Percentages are **heuristic planning indicators, not runtime facts**.

## Two distinct release targets

1. **Developer Technical Preview** — GitHub-installable and shareable to
   technically capable DSH users.
2. **Public v0.1 release** — intentionally published/tagged/package-ready release
   for broader external use.

## Readiness snapshot

| Target | Readiness | Remaining |
|---|---|---|
| Developer Technical Preview | **~88%** | ~12% |
| Public v0.1 | **~72%** | ~28% |

## Must-do before Developer Technical Preview

- Clean-room fresh-profile install from a **pinned GitHub commit**, including pnpm
  `allowBuilds` behavior.
- `--dump-config` / boot / governed lifecycle quickstart smoke **from outside the
  development checkout**.
- Concise 5–10 minute external-user quickstart with copy-paste sample authority
  Issue block and profile patch.
- Compatibility statement naming the exact tested DSH/npm/Node versions and preview nature.
- Package/pack content sanity check and install-time `prepare` verification.
- Tagged GitHub prerelease/release candidate created **only after independent review**.

## Must-do before public v0.1 (everything above, plus)

- Decide GitHub-only vs npm distribution; if npm, verify package-name
  availability/ownership and `npm pack`/publish dry-run contents.
- Pin/define a conservative supported DSH preview compatibility range and test it.
- Add a release checklist / release notes / changelog (or equivalent versioned record).
- At least one clean install/dogfood by an environment that is **not** the
  development worktree.
- Review README onboarding/security wording for an external user with no project chat context.

## Explicitly NOT required for v0.1 (documented post-v0.1 work, not v0.1 blockers)

- Authenticated/private GitHub authority.
- GitHub Enterprise / GraphQL / comment / PR authority.
- `allowedPaths` canonical path enforcement.
- Bash/Git command semantic parsing / protected-branch enforcement.
- GitHub merge/close/successor runtime enforcement.
- Authority replacement/refresh.
- Durable custom SessionEvent reload workaround.
- Reviewer `ACCEPTED` state/tool.
- Multi-agent reviewer orchestration.
- Custom UI/dashboard.

## Blocker classification

- **Release blockers (must be done before the corresponding target ships):** the
  two "Must-do" lists above — specifically the clean install + external boot smoke,
  quickstart docs, compatibility statement, pack/prepare verification, distribution
  decision, and release record. These gate shipping; they are not feature work.
- **Post-v0.1 features (documented, non-blocking):** everything in the
  "Explicitly NOT required" list, plus authority replacement and any further
  runtime-enforcement breadth. These are capabilities that may follow v0.1 but do
  not block it.

## V0.3 durable-reload blocker note

The V0.3 first-party durable SessionEvent reload blocker (upstream) remains and is
**not** a v0.1 release blocker: in-memory evidence append/replay works, and the
limitation is documented. It must be stated truthfully in release notes, not
worked around in this scope.
