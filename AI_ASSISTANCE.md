# AI assistance

This repository is developed with AI assistance. Its very purpose is to
migrate a GPT-guided, Codex-executed development workflow onto DeepSeek
Harness (DSH), so AI involvement is not incidental — it is the subject of the
project.

## How AI is used here

- **Task authority.** Work is issued as GitHub issues by a human-independent
  reviewer (GPT) and executed by an AI builder under bootstrap/governance
  boundaries. No AI self-accepts, self-merges, or closes its own tasks.
- **Code and documentation.** AI drafts code and prose; a human owner remains
  the final product authority and merges only after independent review.
- **No secrets.** AI assistance must never commit secrets, API keys,
  credentials, local machine paths, or private configuration. This is a
  hard, non-bypassable rule.

## Expectations for contributors

- Review AI output as you would any other contribution; do not merge on AI
  say-so.
- Prefer small, reviewable changes with a linked task/issue.
- Respect the [governed workflow](docs/architecture.md) boundaries: builders do
  not modify `main`, do not self-accept, and leave acceptance to the owner.
