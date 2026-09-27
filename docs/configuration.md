# Configuration reference

All configuration is via environment variables, set in `.env` (copied from `.env.example`) and read by the `app` container. Nothing here is configurable from the admin UI unless noted.

| Variable                      | Meaning                                                                                                                                                                                         | Default       | Required                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------- |
| `DATABASE_URL`                | Postgres connection string used by the app (e.g. `postgres://radtempo:<password>@postgres:5432/radtempo`).                                                                                      | none          | Yes                              |
| `AUTH_SECRET`                 | Secret key used by Better Auth to sign sessions and tokens. Generate with `openssl rand -base64 32`. Rotating it invalidates all existing sessions.                                             | none          | Yes                              |
| `APP_URL`                     | The public, canonical URL of your instance (e.g. `https://radtempo.example.com` or `http://localhost:3000`). Used to build absolute links (invites, password resets) and validate auth origins. | none          | Yes                              |
| `REGISTRATION_MODE`           | `invite_only` or `open`. Controls whether new accounts require an admin-issued invite. Changeable later by an admin in the UI.                                                                  | `invite_only` | No                               |
| `INITIAL_ADMIN_EMAIL`         | Email for the initial admin account, created automatically on first boot if no users exist (path A below). If unset, use `SETUP_TOKEN` and the `/setup` wizard instead (path B).                | none          | No                               |
| `INITIAL_ADMIN_PASSWORD`      | Password for the initial admin account. Only used together with `INITIAL_ADMIN_EMAIL`. Remove it from `.env` after the first successful start — it is no longer needed once the admin exists.   | none          | No                               |
| `SETUP_TOKEN`                 | Bearer token required by the interactive `/setup` wizard (path B below) before it will create the first (admin) account. Generate with `openssl rand -base64 32`. Never commit a real value.    | none          | No\*                             |
| `SMTP_HOST`                   | SMTP server hostname. Enables email delivery (verification, password reset, emailed invites) when set together with the other `SMTP_*` variables.                                               | none          | No                               |
| `SMTP_PORT`                   | SMTP server port.                                                                                                                                                                               | none          | No (required if `SMTP_HOST` set) |
| `SMTP_USERNAME`               | SMTP auth username.                                                                                                                                                                             | none          | No                               |
| `SMTP_PASSWORD`               | SMTP auth password. Never shown in the UI once set.                                                                                                                                             | none          | No                               |
| `SMTP_FROM`                   | "From" address used for outgoing email.                                                                                                                                                         | none          | No (required if `SMTP_HOST` set) |
| `EMAIL_VERIFICATION_REQUIRED` | If `true`, new accounts must verify their email before logging in. Only meaningful when SMTP is configured.                                                                                     | `false`       | No                               |
| `TELEMETRY_ENABLED`           | Enables anonymous, instance-level telemetry. See [privacy.md](privacy.md) for the exact fields sent.                                                                                            | `false`       | No                               |
| `TELEMETRY_ENDPOINT`          | URL telemetry is sent to. If unset, nothing is sent even if `TELEMETRY_ENABLED=true`.                                                                                                           | none          | No                               |
| `DOMAIN`                      | Public hostname used by the bundled Caddy reverse proxy (`docker-compose.caddy.yml`) to request a TLS certificate. Only relevant if you use the bundled Caddy setup.                            | none          | No (required for bundled Caddy)  |
| `POSTGRES_PASSWORD`           | Password for the `postgres` service's database user. Must match the credentials embedded in `DATABASE_URL`.                                                                                     | none          | Yes                              |
| `PORT`                        | Internal port the Next.js server listens on inside the `app` container. Rarely needs changing; the container's exposed port is separate from any port you map to the host.                      | `3000`        | No                               |

## First-run: creating the initial admin

There is no default account, and being the "first" visitor never grants any permission by itself — every account, including the very first, is created only through one of these two operator-controlled paths:

- **Path A — scripted bootstrap.** Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in `.env` before the first start. The app creates that one admin account automatically at startup (idempotent — safe across restarts and concurrent instances) and logs `[bootstrap] Created initial admin account` (never the email). Remove `INITIAL_ADMIN_PASSWORD` from `.env` once you've confirmed the account exists.
- **Path B — interactive `/setup` wizard.** Set `SETUP_TOKEN` in `.env`. Visiting `/setup` while no users exist shows a form for the setup token plus the admin's name/email/password; the server compares the submitted token against `SETUP_TOKEN` with a constant-time comparison and only then creates the account.

If neither `SETUP_TOKEN` nor `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` is set, `/setup` shows "Initial setup is not configured..." and no account can be created — the app fails closed rather than allowing an unauthenticated first sign-up to become admin.

## Notes

- Without SMTP configured, login and account management still work fully: admins can create users directly and reset credentials for them (a temporary password or reset link is generated and shown once in the admin UI).
- `SMTP_PASSWORD`, `SETUP_TOKEN`, `INITIAL_ADMIN_PASSWORD` and other secrets should only ever live in `.env` (or your orchestrator's secret store) — never commit `.env` to version control.
- `postgres` is never published to the host by default; only `app` (and optionally `caddy`) are reachable externally.
