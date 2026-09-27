# Privacy

RadTempo is designed so that patient health information (PHI) never needs to enter the system. This page explains exactly what that means, what is stored, who can technically access it, and what telemetry (if enabled) sends.

## No PHI, by design

RadTempo never asks for, and has no fields for, case notes, accession numbers, patient names, MRNs, report text, clinical indications, image uploads, or DICOM data. There is no way to attach any of that to a timed case.

The only free-text fields in the application are:

- Custom study type names (e.g. if you add a study type beyond the built-in presets)
- Custom tag names (e.g. if you add a tag beyond the built-in "Interrupted" / "Teaching" / "Technical issue")

Both of these fields display the warning **"Do not enter patient information or other PHI"** wherever they can be edited. RadTempo cannot prevent someone from typing PHI into a free-text field despite the warning — this is a policy control, not a technical one, and is the responsibility of each user and instance operator.

RadTempo does not claim to be HIPAA compliant, and self-hosting it does not by itself satisfy any regulatory compliance obligation. Operators remain responsible for their own compliance posture (network security, access controls, business associate agreements, etc. as applicable).

## What is stored

For each timed case: the study type, start/finish timestamps, pause duration, complexity rating, and any tags — nothing that identifies a patient or exam. For each user: account/auth data (email, password hash, sessions), preferences, custom study types and tags, and achievement records. See `docs/SPEC.md` for the full data model.

## Who can access what

- **Within the app:** the admin UI never shows any user's performance data — not to other users, and not to administrators. Admin capabilities are limited to account management, registration/SMTP/telemetry settings, and instance backup/restore.
- **Infrastructure administrators:** whoever operates the underlying server, database, and backups for an instance can technically access stored data directly — by querying Postgres, reading server logs, or restoring a backup — regardless of what the application UI shows. This is true of essentially any self-hosted application and is disclosed here deliberately. If you are self-hosting RadTempo for others (e.g. a department or group), the people with infrastructure access (you, or your IT staff) are in this position, and should be treated as such in your own policies.

## Account deletion

Users can delete their own account at any time from Settings, with explicit confirmation. Deletion cascades: timings, study types, tags, preferences, achievements, the auth account, and sessions are all removed.

**Caveat:** deleting an account removes the data from the live database, but infrastructure backups taken before the deletion may still contain it until those backups themselves expire or are deleted, per your instance's backup retention practice. See [`docs/backup-restore.md`](backup-restore.md).

## Telemetry

Telemetry is instance-level (never per-user) and **off by default**, controlled by a single admin toggle (`TELEMETRY_ENABLED`) plus a destination (`TELEMETRY_ENDPOINT`). If `TELEMETRY_ENDPOINT` is unset, nothing is sent even when enabled. The application behaves identically whether telemetry is on or off.

**Allowed fields, if enabled:**

- App version
- Enabled feature flags
- Aggregate event counts
- Error categories
- Coarse environment information (e.g. OS/runtime type)

**Never sent, under any circumstances:**

- Email addresses or any other user identifier
- Study type names
- Case durations
- Complexity ratings or tags
- Clinical timestamps
- IP addresses
- Any free-text field content

The admin UI shows the exact list of fields telemetry would send, kept in sync with this document.

## Not a compliance certification

This document describes RadTempo's design intent and technical behavior. It is not a legal opinion, a HIPAA compliance certification, or a substitute for your own risk assessment as an operator.
