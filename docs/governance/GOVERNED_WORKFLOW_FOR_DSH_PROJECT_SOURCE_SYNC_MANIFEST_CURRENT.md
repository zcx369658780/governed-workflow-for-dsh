# Governed Workflow for DSH — Project Source Sync Manifest (CURRENT)

> Compact import manifest for ChatGPT Project Sources.

## Identity

- **Repository:** `zcx369658780/governed-workflow-for-dsh`
- **Source `main` SHA used for this generation:** `658261924d225792998c495d97209e2dcaa06714`
  (re-fetch live `origin/main` before relying on this).
- **Generation date:** 2026-08-15
- **Current accepted product stage:** **V0.9** (builder lifecycle tools + RUNNING-only guard).
- **Generation provenance:** this canonical set was produced by the docs-only sync
  task **Issue #21 — Project Source Sync after V0.9** (delivered as PR #22).
  Issue #21 is generation/synchronization provenance, **not** an active task.
- **Post-acceptance current state:** once PR #22 is independently accepted/merged
  and Issue #21 is closed — active product implementation task = **NONE**; active
  docs-sync task = **NONE**; next intended activity = **release-hardening
  planning**; do **not** resume Issue #21; do **not** auto-create V0.10.

## Canonical file set (exactly five)

1. `GOVERNED_WORKFLOW_FOR_DSH_SYSTEM_RULES_CURRENT.md` — stable system rules:
   roles, precedence, authority, lifecycle, guard, evidence, recovery.
2. `GOVERNED_WORKFLOW_FOR_DSH_CAPABILITIES_LIMITS_AND_TRUST_BOUNDARY_CURRENT.md` —
   factual capability matrix: hard vs guidance vs opt-in vs blocked vs not-implemented.
3. `GOVERNED_WORKFLOW_FOR_DSH_RELEASE_READINESS_CURRENT.md` — Technical Preview
   (~88%) and Public v0.1 (~72%) readiness + blocker classification.
4. `GOVERNED_WORKFLOW_FOR_DSH_PROJECT_SOURCE_SYNC_MANIFEST_CURRENT.md` — this
   manifest: canonical set, precedence, stage, and handoff instructions.
5. `GOVERNED_WORKFLOW_FOR_DSH_SESSION_HANDOFF_AFTER_V0_9_2026_08_15.md` — compact
   first-read handoff for a fresh GPT session.

All five live under `docs/governance/`.

## Reading precedence for a new GPT session

1. `SESSION_HANDOFF_AFTER_V0_9_2026_08_15` (first, compact orientation).
2. `SYSTEM_RULES_CURRENT` (authoritative operating rules).
3. `CAPABILITIES_LIMITS_AND_TRUST_BOUNDARY_CURRENT` (what is/isn't enforced).
4. `RELEASE_READINESS_CURRENT` (shipping state and blockers).
5. `PROJECT_SOURCE_SYNC_MANIFEST_CURRENT` (this file — provenance and precedence).

Always confirm against live GitHub `main`; these docs are derived recovery
artifacts and never override live code or a newer authoritative task.

## Post-acceptance instruction

After these docs are independently accepted and merged, the **Owner** should:

1. Add/replace **exactly these five files** in ChatGPT Project Sources.
2. Retire any superseded project-source summaries, so contradictory `CURRENT`
   files are not kept side by side.
3. Perform the new-session handoff using the `SESSION_HANDOFF_AFTER_V0_9` file.

After acceptance/merge, Issue #21 and PR #22 are **closed provenance**, not
active tasks: the recovery state is no active product task and no active docs-sync
task, with release-hardening planning as the next intended activity. Do **not**
resume Issue #21 and do **not** auto-create V0.10.

The Builder does **not** have authority to mutate ChatGPT Project Sources directly.

## Contents boundary

These docs contain no secrets, local machine paths, tokens, or private
conversation text. They describe the accepted code/truth at the recorded SHA only.
