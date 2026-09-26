# RadTempo

RadTempo helps radiologists measure and improve their interpretation pace. Choose the type of examination you're about to read, start the timer, finish the case, and RadTempo builds a personal picture of how your reading pace changes over time. No patient information is needed or intended to be stored. Your benchmark is your own prior performance.

- ✓ Self-hostable
- ✓ Personal analytics
- ✓ No PACS integration required
- ✓ No patient data required
- ✓ CT/MRI body-imaging presets
- ✓ Adaptive personal benchmarks

## What RadTempo is

A self-hostable, personal performance-tracking tool for radiologists. It times individual case reads, learns your own pace over time, and shows you how you compare to your own recent history — nothing else.

## What RadTempo is not

- Not a PACS, RIS, or reporting system.
- Not a productivity monitor, QA platform, or surveillance tool.
- Not a leaderboard or comparison tool between radiologists, departments, or institutions.
- It never ingests studies, reports, accession numbers, patient information, or any other clinical data. Free-text fields exist only for naming your own custom study types and tags, and each carries a warning not to enter patient information or PHI.
- Not a HIPAA compliance product or claim. RadTempo is designed to avoid handling PHI, but self-hosting operators remain responsible for their own compliance obligations.

## Quick start

```bash
git clone <this repository>
cd RadTempo
cp .env.example .env
```

Generate a secret for `AUTH_SECRET` and set it in `.env`:

```bash
openssl rand -base64 32
```

Set `POSTGRES_PASSWORD` in `.env` to a strong password.

Then start the app:

```bash
docker compose up -d
```

Open `http://localhost:3000`. On first run, you'll be sent to `/setup`, where you create the initial admin account (or set `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` in `.env` beforehand). There are no default credentials.

### Exposing RadTempo on a public domain

RadTempo ships with an optional bundled [Caddy](https://caddyserver.com/) reverse proxy that handles TLS automatically. Set `DOMAIN` in `.env` to your public hostname, then run (requires Docker Compose >= 2.24):

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

This also stops the `app` container from publishing its own host port directly — Caddy becomes the only thing exposed on ports 80/443. If you'd rather use an existing reverse proxy (Caddy, Nginx, Traefik, etc.), see [`docs/reverse-proxy.md`](docs/reverse-proxy.md).

## Documentation

- [Configuration reference](docs/configuration.md) — all environment variables
- [Reverse proxy setup](docs/reverse-proxy.md) — Caddy, Nginx, Traefik
- [Privacy](docs/privacy.md) — what is and isn't stored, telemetry, admin access
- [Backup & restore](docs/backup-restore.md) — encrypted backups, disaster recovery
- [Analytics methodology](docs/analytics.md) — how personal benchmarks are computed
- [Licensing](docs/licensing.md) — what the license allows and doesn't allow
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Privacy, in brief

RadTempo is built so that PHI never needs to enter the system: it stores study type names, timings, complexity ratings, and tags — not patient identifiers, accession numbers, report text, or images. Free-text fields (custom study type and tag names) carry an explicit warning not to enter patient information.

The admin UI never shows any individual user's performance data to an administrator. However, the people who administer the underlying infrastructure — the database, the server, and backups — can technically access stored data directly, outside the application. This is disclosed here deliberately: self-hosting means you (or whoever runs your instance) are that infrastructure administrator, and should treat the database and backups accordingly.

Anonymous instance-level telemetry is available but off by default; see [`docs/privacy.md`](docs/privacy.md) for exactly what it would send.

## License

RadTempo is source available under PolyForm Shield 1.0.0. It is **not open source**. See [`LICENSE`](LICENSE) for the full text and [`docs/licensing.md`](docs/licensing.md) for a plain-language summary of what's allowed.
