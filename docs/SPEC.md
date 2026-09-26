# RadTempo V1 Specification (condensed, authoritative for implementation)

Tagline: Personal performance tracking for radiologists.
Principle: **Get faster than your prior self without turning radiology into a race.**

RadTempo is a self-hostable web app. Not a PACS, reporting system, productivity monitor, QA platform, or surveillance tool. It never ingests studies, reports, accession numbers, patient info or other clinical data.

Primary loop: select study type → timer starts immediately → read outside the app → click Finish → duration saved immediately → lightweight post-case panel (complexity Easy/Typical/Difficult + optional tags) → personal history and adaptive benchmark update.

## Non-negotiables

- Personal improvement only: no leaderboards, rankings, user-vs-user, department/national benchmarks, "average radiologist" targets. Every benchmark derives from the user's own history.
- While reading: small, quiet timer. No countdown, no red, no "behind" warnings, no competitive messages. Timer can be minimized / elapsed time hidden. Feedback only after completion.
- Start and Finish are each one action in the common path.
- No PHI: no case notes, accession, patient name/MRN, report text, indication, image upload, DICOM. Free text only for user-defined study type names and tag names, each with the warning "Do not enter patient information or other PHI." Do not claim HIPAA compliance.

## V1 scope

Auth; USER/ADMIN roles; registration policy; timer with pause/resume; persistent active timers; built-in (seeded) + custom study types; favorites, frequent, recent; complexity; tags; adaptive personal analytics; raw and complexity-adjusted trends; dashboard; study analytics; moderate gamification; personal export/import; account deletion; instance backup/restore; light/dark; configurable keyboard shortcuts; Docker Compose; optional Caddy; optional SMTP; optional anonymous telemetry (off by default); admin UI.
Out of scope: public API, mobile app, PACS/RIS/reporting/DICOM, AI, report quality, departmental/supervisor/group/community analytics, manual retrospective case entry, concurrent timers, reading-session mode, leaderboards, RVUs, billing, Redis, microservices, Kubernetes.

## Stack

Next.js (App Router, TS, React, server actions / route handlers doing authorization server-side), PostgreSQL 18 (Docker; tests may use local PG16), Drizzle ORM with committed SQL migrations in `drizzle/`, Better Auth (email+password, sessions, password change, optional reset/verification email, no external IdP), Zod validation server-side, Tailwind + Radix primitives (shadcn-style), Recharts, Vitest (unit + DB integration), Playwright (e2e). Docker Compose: `app`, `postgres`, optional `caddy` (docker-compose.caddy.yml). No Redis.

## Repo layout

```
src/app, src/components, src/features/{auth,timer,studies,analytics,achievements,import-export,admin}, src/db, src/lib, src/server,
drizzle/, tests/, e2e/, docs/, docker/, docker-compose.yml, docker-compose.caddy.yml, Caddyfile.example, .env.example,
README.md, SECURITY.md, CONTRIBUTING.md, LICENSE
```

## Auth & accounts

- `registration_mode`: `invite_only` (default) | `open`; admin can change.
- First run: if no users exist, a setup wizard creates the admin (or `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` env). No default credentials.
- SMTP optional. Without SMTP: login/accounts work; admin can create users and reset credentials (explicit admin workflow generating a temporary password / reset link shown once). With SMTP: email verification, password reset, invitations by email.
- Invites: admin creates an invite token (shown as link; emailed if SMTP). Registration in invite_only mode requires a valid unused unexpired invite.

## Roles

USER: own studies, timing, own analytics, export/import own data, delete own cases, delete own account, own preferences.
ADMIN: create/invite/disable/delete users, registration settings, SMTP config status/test, telemetry, instance settings, backup/restore, health. **Admin UI must never show any user's performance data.**
Docs must disclose: instance administrators control infrastructure and may technically access data via DB/server/backups.

## Study types

Per-user rows copied from application-level templates at onboarding; then fully user-owned (rename, delete, reorder, favorite, create). Hierarchy: modality → body region → study type. Combined exams are first-class and fully independent (never derived from components).

Seed templates (modality / region / name / shortName):

- CT / Chest: CT Chest without contrast (CT Chest −C); CT Chest with contrast (CT Chest +C); CTA Chest
- CT / Abdomen/Pelvis: CT Abdomen/Pelvis without contrast (CT A/P −C); with contrast (CT A/P +C); with & without contrast (CT A/P ±C); CTA Abdomen/Pelvis
- CT / Combined: CT Chest + Abdomen/Pelvis without contrast (CT C/A/P −C); with contrast (CT C/A/P +C); with & without (CT C/A/P ±C)
- MRI / Abdomen: MRI Abdomen without contrast; MRI Abdomen with & without contrast (MRI Abdomen W/WO); MRCP
- MRI / Pelvis: MRI Pelvis without contrast; MRI Pelvis with & without contrast; MRI Prostate
- MRI / Combined: MRI Abdomen + Pelvis without contrast; MRI Abdomen + Pelvis with & without contrast
  Keep the seed list in one easily edited file.

## Home / Start screen (order)

1. Active timer (fixed top, if any) 2. Favorites (one click starts) 3. Frequently used (all-time completed count, no recency weighting) 4. Recent (last 3 distinct study types) 5. Browse (hierarchical CT/MRI → regions) + instant text search. Sections may overlap; do not dedupe across them.

## Timer

- One active (ACTIVE or PAUSED) timer per user, enforced by a partial unique index in DB. States ACTIVE, PAUSED, COMPLETED.
- Start: server creates entry with started_at; if one exists (incl. race), return the existing one instead of creating another. Transactional.
- DB is authoritative; client interval only renders. `active_duration = (now|finished_at) − started_at − paused_duration (incl. current pause)`.
- Survives refresh, tab/browser close, other devices.
- Pause/resume/finish idempotent where practical. Pause never implies a tag. Record `timing_pause_events`.
- Finish is immediate: compute & persist duration, status COMPLETED, complexity TYPICAL, no tags, then show post-case panel. Finish while paused works (pause ends at pause_started_at).
- Finish failure: show "Could not save. Retry." and keep the timer recoverable. Network loss: keep displaying estimated elapsed; re-sync on reconnect.
- Display: small, quiet, always visible across routes; minimize; hide elapsed time.

## Post-case panel

Shows "Completed in 06:42", complexity [Easy][Typical ✓][Difficult], tags (Interrupted, Teaching, Technical issue, + custom), [Done], plus concise feedback: e.g. "8% faster than your recent comparable pace" or "Baseline building — case 3". No interaction required. Starting another case finalizes the previous panel.

## Immutability

`classification_finalized_at` set when user clicks Done, starts another timer, dismisses the panel, or a classification timeout (e.g. 10 min after finish) expires. Before finalization: complexity/tags editable. After: entry immutable; only deletion allowed. No manual case creation ever (except importing a legitimate RadTempo export).

## Complexity & tags

Complexity: EASY | TYPICAL (default) | DIFFICULT.
Tags: {name, exclude_from_benchmark, built_in}. Built-ins seeded per user: Interrupted, Teaching, Technical issue — all exclude=true. Custom default exclude=false (user may change). No tag is ever inferred.

## Analytics (deterministic, explainable, medians)

- Eligible: COMPLETED and no attached tag has exclude_from_benchmark. Excluded cases still count in history, volume, total active time, activity.
- raw_duration = finished_at − started_at − paused_duration.
- Complexity factors learned per user: for each study type with ≥ MIN_STUDY_N (5) eligible cases compute median raw duration; each eligible case → ratio to its study median; pool ratios by complexity; median ratio per complexity; normalize so typical=1.0. If a category has < MIN_FACTOR_N (5) ratios (or typical has too few), factor=1.0 and mark `provisional`. adjusted = raw / factor.
- Per study (ordered by finished_at): recent_window = last 10 eligible adjusted; recent_pace = median. comparison_window = up to 20 eligible cases immediately preceding the recent window; comparison_pace = median. improvement = (comparison − recent)/comparison (positive = faster). Display rounded to 1 decimal max.
- Benchmark = recent pace. Maturity by eligible count: 1–4 Early, 5–14 Building, 15+ Established.
- Never discard outliers. Medians everywhere.
- Personal percentile: fraction of the user's previous eligible adjusted reads of the same study that this read was faster than. "This read was faster than 72% of your previous comparable CT A/P +C reads."
- Timed cases/hour = completed timed cases / summed active duration (hours). Label exactly "Timed cases/hour".
- Trends: raw median and adjusted median over time buckets (e.g. weekly), or rolling median.
- Analytics derivation lives in a pure, independently testable module (`src/features/analytics`). Compute from Postgres; cache only if needed.

## Dashboard

Per common study: recent median, raw & adjusted trend, case count, benchmark, change vs previous window, maturity. Secondary: completed cases, active reading time, timed cases/hour, personal records, consistency, achievements. Empty states: no zero-filled graphs; "No CT A/P +C history yet. Your first timed read will start your personal baseline. [Start CT A/P +C]"; after one case "Baseline started 07:14 · 1 case".

## Study detail

Benchmark; recent vs previous; raw trend; adjusted trend; volume; E/T/D distribution; personal best; cases/hour; recent cases (excluded visibly distinguished, not by color alone); maturity. Filters: date range, complexity, included/excluded, tag.

## Gamification (moderate, never cross-user)

Personal records (fastest eligible read, best recent median, largest sustained improvement). Milestones: 10/50/100 timed studies, 50 of one study type, first established benchmark, 5% and 10% sustained improvement. Consecutive reading-day streaks (not login streaks). No "speed demon"/"fastest radiologist" badges. Store `achievement_events` to avoid repeat celebrations. Subtle celebration only.

## History

Columns: Date, Study, Duration, Complexity, Tags, Included in benchmark?. Action: Delete (light confirmation). No edit. Deletion recalculates analytics.

## Export / import

Zip `radtempo-export-YYYY-MM-DD.zip`: manifest.json {export_schema_version, app_version, created_at}, profile.json, study-types.json, tags.json, timings.json, preferences.json, timings.csv. Never export password hashes, sessions, secrets.
Import: upload → validate schema → preview (study types, case count, tags, preferences) → import. Preserve timestamps/durations. Idempotent via UUIDs (re-import does not duplicate). Imported records participate in analytics. Study types/tags matched by original UUID (stored as id) or by name for tags.

## Account deletion

Self-service, explicit confirmation; cascades timings, study types, tags, prefs, achievements, auth account, sessions. Explain infrastructure backups may retain data until they expire.

## Instance backup/restore (admin)

`pg_dump` custom format, encrypted with `age` (passphrase/scrypt) — established tool, no custom crypto. Admin supplies passphrase. Restore: admin + passphrase + typed destructive confirmation + maintenance mode, `pg_restore --clean`. Document: anyone with the backup + passphrase can read the data.

## Telemetry

Instance-level, off by default, single toggle. Allowed: app version, enabled feature flags, aggregate event counts, error categories, coarse environment. Never: emails, user IDs, study names, durations, complexity, tags, clinical timestamps, IPs, free text. Admin UI shows exact field list. App behaves identically when disabled. `TELEMETRY_ENDPOINT` env; if unset nothing is sent.

## Deployment & env

`cp .env.example .env && docker compose up -d` → app + postgres (postgres not published to host). `docker-compose.caddy.yml` adds Caddy with `DOMAIN`. Document existing Caddy, Nginx, Traefik. App listens on internal HTTP port 3000. Works offline.
Env: DATABASE_URL, AUTH_SECRET, APP_URL, REGISTRATION_MODE, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, EMAIL_VERIFICATION_REQUIRED, TELEMETRY_ENABLED, TELEMETRY_ENDPOINT, DOMAIN, POSTGRES_PASSWORD. SMTP secrets live in env, never shown in UI.

## Security baseline

Secure/HttpOnly/SameSite cookies; CSRF protection (Better Auth origin checks; server actions); login rate limiting; ownership check on every user-owned object (never trust client IDs); Zod server-side; security headers (CSP, X-Frame-Options, etc.); no secrets in client bundle or logs; don't log request bodies with names/tags; Dependabot; DB not exposed.

## Data model (Drizzle, UUID PKs)

- Better Auth tables: user (+ `role` USER|ADMIN, `disabledAt`, `onboardedAt`), session, account, verification.
- instance_settings (single row): registration_mode, smtp_enabled(derived from env), email_verification_required, telemetry_enabled, instance_name, maintenance_mode, created_at, updated_at.
- invites: id, email nullable, token_hash, created_by, expires_at, used_at.
- user_preferences: user_id PK, theme (light|dark|system), timer_visibility (full|minimized|hidden_time), keyboard_shortcuts_json, created_at, updated_at.
- user_study_types: id, user_id, modality, body_region, name, short_name, sort_order, favorite, created_from_template, created_at, updated_at.
- timing_entries: id, user_id, study_type_id, status, started_at, pause_started_at?, paused_duration_ms, finished_at?, active_duration_ms?, complexity, classification_finalized_at?, imported_at?, created_at. Partial unique index on (user_id) WHERE status IN ('ACTIVE','PAUSED').
- timing_pause_events: id, timing_entry_id, paused_at, resumed_at?.
- tags: id, user_id, name, built_in, exclude_from_benchmark, created_at; unique(user_id, lower(name)).
- timing_entry_tags: timing_entry_id, tag_id (PK both).
- achievement_events: id, user_id, achievement_key, study_type_id?, earned_at, metadata_json; unique(user_id, achievement_key, study_type_id).
  All user FKs ON DELETE CASCADE. Deleting a study type cascades its timings (confirm in UI with count).

## Keyboard shortcuts (per-user configurable, collision-checked, not while typing in inputs)

Defaults: open study picker `/`, start favorite N `1`–`9`, pause/resume `p`, finish `f`, hide/show timer `h`. Shown in tooltips/menus.

## UI

Screens: Login, Home/Start, Active timer (global bar), Dashboard, Study analytics, History, Studies, Achievements, Settings, Import/Export, Admin. Sidebar: RadTempo · Start · Dashboard · History · Studies · Achievements · Settings · Admin(admin only). Light/dark remembered. Desktop-first, usable on tablet/phone. Accessibility: semantic buttons, focus rings, aria labels, contrast, no color-only info, focus-trapped dialogs, reduced motion, no aggressive timer animation. Tone: professional, calm, radiologist-built instrument; not a fitness app.
Onboarding: (1) "RadTempo measures your own reading pace over time. It does not compare you with other radiologists." (2) PHI warning (3) Study presets: Use defaults / Customize (4) optional favorites → Start.
Language: use personal benchmark, recent pace, improvement, complexity-adjusted, timed reading, baseline, comparable reads. Avoid productivity score, efficiency score, grade, slow, failed, quota, standard reading time.

## Licensing

"Source available", PolyForm Shield 1.0.0 (subject to legal review). CONTRIBUTING: issues/suggestions welcome; external code contributions may not be accepted automatically. No CLA.

## README opening

"RadTempo helps radiologists measure and improve their interpretation pace. Choose the type of examination you're about to read, start the timer, finish the case, and RadTempo builds a personal picture of how your reading pace changes over time. No patient information is needed or intended to be stored. Your benchmark is your own prior performance." then ✓ Self-hostable ✓ Personal analytics ✓ No PACS integration required ✓ No patient data required ✓ CT/MRI body-imaging presets ✓ Adaptive personal benchmarks.

## Testing

Timer: start, duplicate start race, pause, double pause, resume, double resume, finish, finish while paused, recovery, timezone independence. Authorization: user A can never fetch/mutate/delete/export user B's records. Analytics fixtures: early baseline, rolling windows, excluded tags, complexity adjustment, deletion recalculation, import recalculation, combined studies. Import/export round trip equality; duplicate import no duplicates. E2E: login → start CT A/P +C → refresh → pause → resume → finish → mark difficult → dashboard reflects → delete case.

## CI

PRs: install, lint, format check, typecheck, unit, integration (Postgres service), build, Docker image build. Playwright on main and release PRs. Dependabot.

## Build phases

1 foundation (repo, Docker, Postgres, migrations, auth, admin bootstrap, roles) · 2 timer loop (usable app) · 3 analytics · 4 workflow polish · 5 motivation · 6 portability/admin · 7 hardening/docs/license/release workflow.
