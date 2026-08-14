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

**V0 bootstrap.** This is a minimal, installable/loadable plugin-bundle
skeleton. It proves the DSH build/test/load path and reserves — but does **not**
implement — the governance modules. See
[docs/architecture.md](docs/architecture.md) for the design map.

## Install

```sh
# from npm (when published)
dsh plugin --profile demo add dsh-governed-workflow

# from this git checkout (TypeScript sources build via the prepare script;
# pnpm >=10 requires an allowBuilds entry the first time)
dsh plugin --profile demo add github:zcx369658780/governed-workflow-for-dsh
dsh --profile demo --dump-config   # confirm the governed-workflow layer
dsh --profile demo                 # observe "[governed-workflow] plugin loaded"
```

## Development

```sh
pnpm install
pnpm build       # transpile src/ -> lib/
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
```

## Documentation

- [Architecture and module boundaries](docs/architecture.md)
- [DSH compatibility](docs/dsh-compatibility.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [AI assistance](AI_ASSISTANCE.md)
- [Trademark notice](TRADEMARK_NOTICE.md)

## License

[MIT](LICENSE)
