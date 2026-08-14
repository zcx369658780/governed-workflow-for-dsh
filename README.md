# governed-workflow-for-dsh

Independent community plugin for DeepSeek Harness. Not affiliated with or endorsed by DeepSeek.

Policy-enforced, evidence-first governed workflows for DeepSeek Harness agents.

`dsh-governed-workflow` migrates a GPT-issued, builder-executed development
workflow onto [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
("dsh"): an authoritative GitHub task is issued, an agent builder implements it
on a dedicated branch, and a reviewer accepts independently. The long-term goal
is a runtime plugin that makes the workflow's invariants non-bypassable, paired
with a `governed-builder` Skill for instruction-level guidance.

## Status

**V0.3 evidence core — durable reload upstream-blocked.** V0 (bootstrap),
V0.1 (governance core), and V0.2 (authority core) are accepted. This stage
adds the evidence audit substrate: merge-extensible governance session events,
a typed evidence recorder (`ctx.governanceEvidence`) targeting an explicit
`Session`, a non-surface projection/audit helper, and an explicit flush
checkpoint. The plugin is **authority-capable + evidence-recording, not yet
tool-enforcing** (first-party durable reload is upstream-blocked). See
[docs/architecture.md](docs/architecture.md) for the design map, evidence
vocabulary, and trust model.

## Evidence

Governance facts are appended to an explicit `Session` as non-surface events
(`governance/authority-observed`, `governance/authority-rejected`,
`governance/lifecycle-transition`). They add no model-visible message and are
projected back in sequence order for audit/replay. Recording is append-only;
`flush()` requests the DSH durability checkpoint (no-op without a persistence
backend).

**Durable-reload limitation:** current DSH exposes no way to mark these events
`ignorable` and no public runtime registration for out-of-repo event types, so
first-party persisted load/resume refuses a log containing them — **even when
this plugin is installed**. In-memory append/replay works; durable reload is an
upstream capability blocker. See
[docs/dsh-compatibility.md](docs/dsh-compatibility.md).

## Install

```sh
# from npm (when published)
dsh plugin --profile demo add dsh-governed-workflow

# from this git checkout (TypeScript sources build via the prepare script;
# pnpm >=10 requires an allowBuilds entry the first time)
dsh plugin --profile demo add github:zcx369658780/governed-workflow-for-dsh
```

## Configure an authority (optional)

The config-backed reference provider reads an authority from the plugin row's
`config` (or a profile/`--patch` override by row id):

```yaml
- id: governed-workflow
  config:
    authority:
      taskId: issue-5
      source: config
      repository: owner/repo
      baselineRef: main
      baselineSha: 0123456789abcdef0123456789abcdef01234567
```

A valid authority is observed at load (`UNINITIALIZED → AUTHORITY_OBSERVED`);
unavailable/invalid authority fails closed and leaves the lifecycle unchanged.
No secrets, credentials, or personal machine paths belong in the snapshot.

## Development

```sh
pnpm install
pnpm build       # transpile src/ -> lib/
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
```

## Documentation

- [Architecture, module boundaries, and trust model](docs/architecture.md)
- [DSH compatibility](docs/dsh-compatibility.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [AI assistance](AI_ASSISTANCE.md)
- [Trademark notice](TRADEMARK_NOTICE.md)

## License

[MIT](LICENSE)
