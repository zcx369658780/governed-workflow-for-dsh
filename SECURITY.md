# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability. Instead,
report it privately to the repository owner (see the repository's contact
details) or, once governance tooling exists, through the channel that tooling
designates.

Include:

- a clear description of the vulnerability and its impact;
- steps to reproduce, or a minimal proof of concept;
- the affected version/revision.

The owner will acknowledge the report and coordinate a fix before any public
disclosure.

## Commit hygiene (hard rules)

- **Never commit secrets**, API keys, credentials, tokens, private keys, local
  machine paths, or private configuration.
- Review diffs for accidental inclusion of `.env` files or credential data
  before pushing.
- The governance plugin this repository grows will enforce these rules at
  runtime; until then they are enforced by review.

## Scope

V0 is a non-executing bootstrap skeleton: it registers no tools, no network
clients, and no filesystem access of its own. Its trust surface is limited to
being loaded by DSH, which supplies the surrounding sandbox and permission
policy.
