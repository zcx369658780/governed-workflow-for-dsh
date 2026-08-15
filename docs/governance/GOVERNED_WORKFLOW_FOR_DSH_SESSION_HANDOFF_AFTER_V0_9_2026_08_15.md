# Governed Workflow for DSH — Session Handoff after V0.9 (2026-08-15)

> **Read this first.** Compact orientation for a fresh GPT session.
> Repo: `zcx369658780/governed-workflow-for-dsh`. Independent community plugin (not DeepSeek-affiliated).

## Handoff-time truth

- **Recorded `main` SHA:** `658261924d225792998c495d97209e2dcaa06714`.
- **Re-fetch live `origin/main` before acting** — this SHA may be stale.
- **Accepted product stage:** **V0.9** (accepted foundation: V0.1 lifecycle,
  V0.2 authority, V0.3 evidence, V0.4/V0.5 guard, V0.6 Skill, V0.7 async authority,
  V0.8 public GitHub Issue authority, V0.9 lifecycle tools + RUNNING-only guard).

## Current runtime chain (hard)

```text
authority (observe) -> AUTHORITY_OBSERVED -> ADMIT_TASK -> TASK_ADMITTED
  -> RUN -> RUNNING -> BLOCK | COMPLETE -> SUBMIT_REVIEW -> REVIEW_PENDING
```

- Mutation (`bash`/`write`/`edit`) allowed **only** in `RUNNING` with accepted
  authority; denied otherwise (NO_AUTHORITY / NOT_RUNNING / TERMINAL_STATE).
- Model tools: `governance_status` (read-only), `governance_transition`
  (ADMIT_TASK/RUN/BLOCK/COMPLETE/SUBMIT_REVIEW only — no OBSERVE_AUTHORITY, no ACCEPTED).

## Blocker semantics (exact)

- **pre-RUNNING blocker:** do **NOT** call BLOCK — already fail-closed; stop and
  return a truthful `BLOCKED_<reason>` completion report.
- **RUNNING blocker:** call `BLOCK`, then `SUBMIT_REVIEW`.
- `COMPLETE` only from `RUNNING`. `COMPLETE`/`REVIEW_PENDING` are not acceptance.

## V0.8 GitHub Issue authority (opt-in)

- Public, unauthenticated, one read-only GET to fixed `api.github.com`; strict V1
  body block; identity provider-derived; no token/retry/redirect-following.
- Opt-in only — **no default network traffic**.

## Accepted hard guard / tool boundaries

- Protected mutation tools: `bash`, `write`, `edit` — RUNNING-only.
- Read/discovery and the lifecycle tools are not gated by that slice.
- Skill guidance (protected-branch/path/GitHub/acceptance) is **not** runtime-enforced.

## V0.3 upstream blocker (unchanged)

- First-party durable SessionEvent reload refuses out-of-repo `governance/*` types
  (no `ignorable` marker setter). In-memory evidence works; durable reload blocked.

## Release readiness snapshot

- Developer Technical Preview ≈ **88%**; Public v0.1 ≈ **72%**.
- Blockers: external clean install/boot smoke, quickstart, compatibility statement,
  pack/prepare verification, distribution decision, release record.

## Current tasks

- **Active product implementation task:** **NONE**.
- **Current task:** docs-only Project Source Sync (Issue #21).
- **Next intended activity after handoff:** **release-hardening planning** — not
  automatic V0.10 feature expansion.

## Do this next

1. Re-fetch live `origin/main`.
2. Read the canonical docs in this order: `SYSTEM_RULES_CURRENT`,
   `CAPABILITIES_LIMITS_AND_TRUST_BOUNDARY_CURRENT`, `RELEASE_READINESS_CURRENT`,
   `PROJECT_SOURCE_SYNC_MANIFEST_CURRENT`.
3. Confirm the current authoritative GitHub task before doing any work.

## No old-chat-memory reliance

When GitHub `main` or current canonical docs disagree with old chat memory, the
live artifacts win. Never infer current state from prior conversation.
