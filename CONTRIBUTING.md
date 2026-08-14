# Contributing

Thanks for your interest in `dsh-governed-workflow`. This project migrates a
GPT-issued, builder-executed development workflow onto DeepSeek Harness, and
its contributions follow the same shape.

## Workflow

1. Work is issued as a GitHub issue (the task authority) by the reviewer/owner.
2. A builder implements it on a **dedicated branch** (never `main`).
3. The builder pushes the branch and opens a PR targeting `main`, or reports the
   exact branch and commit SHA for independent review.
4. The owner (or reviewer) accepts and merges. **Builders do not self-accept,
   self-merge, or close their own tasks.**

## Boundaries (bootstrap mode)

Until runtime governance exists, these are prompt-level rules:

- Do not modify or push directly to `main`.
- Do not self-accept, close, merge, or create successor tasks.
- Do not expand scope beyond the assigned issue.
- Do not add secrets, credentials, local machine paths, or private config.

## Development

```sh
pnpm install     # installs devDependencies and runs the prepare build
pnpm build       # transpile src/ -> lib/
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
```

Load the bundle into a local DSH profile to smoke-test it:

```sh
dsh plugin --profile demo add ./path/to/this/checkout
dsh --profile demo --dump-config   # confirm the governed-workflow layer
dsh --profile demo                 # observe "[governed-workflow] plugin loaded"
```

See [docs/architecture.md](docs/architecture.md) and
[docs/dsh-compatibility.md](docs/dsh-compatibility.md) for the design map and
the pinned DSH version.
