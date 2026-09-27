# Contributing

Issues and suggestions are welcome — bug reports, feature ideas, and general feedback all help.

## Code contributions

We're not currently set up to accept external code contributions automatically. RadTempo is source-available under PolyForm Shield 1.0.0 (see [`LICENSE`](LICENSE) and [`docs/licensing.md`](docs/licensing.md)), and we want to preserve relicensing flexibility as the project matures, so pull requests may not be merged even if the change itself is reasonable. If you'd like to contribute code, please open an issue first to discuss it before investing significant time.

There is currently no Contributor License Agreement (CLA) in place.

## Development setup

Requirements: Node.js, [pnpm](https://pnpm.io/), and a local PostgreSQL instance (or use the one from `docker-compose.yml`).

```bash
pnpm install
```

Set up a local Postgres database and point `DATABASE_URL` at it (see [`docs/configuration.md`](docs/configuration.md)), then:

```bash
pnpm dev              # run the dev server
pnpm test             # unit tests
pnpm test:integration # integration tests (requires Postgres)
pnpm lint             # ESLint
pnpm format:check     # Prettier check
pnpm typecheck        # TypeScript
```

Please make sure `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and the test suites pass before opening a pull request — CI runs the same checks.

## Maintainer note: commit author privacy

Maintainers should enable GitHub's email privacy setting (Settings → Emails → "Keep my email addresses private") and configure git to use the resulting `users.noreply.github.com` address for authorship (`git config user.email <id>+<username>@users.noreply.github.com`), so real email addresses aren't published in commit history on this source-available repository.
