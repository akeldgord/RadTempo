# Security Policy

## Reporting a vulnerability

Please report suspected security vulnerabilities privately, using [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repository (Security tab → "Report a vulnerability"), which opens a private security advisory. Please do not open a public issue for a suspected vulnerability.

We'll acknowledge new reports as quickly as we can and keep you updated as we investigate and address the issue. Once a fix is available, we'll coordinate disclosure with you and, where appropriate, publish a GitHub Security Advisory.

## Supported versions

Only the latest released version of RadTempo is supported with security fixes. If you're self-hosting, please stay on the latest release.

## Security baseline

RadTempo's baseline security posture includes:

- Secure, HttpOnly, SameSite session cookies
- CSRF protection via Better Auth origin checks and server actions
- Login rate limiting
- Server-side ownership checks on every user-owned object (client-supplied IDs are never trusted)
- Server-side validation of all input via Zod
- Standard security headers (CSP, `X-Frame-Options`, etc.)
- No secrets in the client bundle or in logs
- Request bodies containing names or tags are not logged
- Dependency updates via Dependabot
- The database is never exposed to the host or the internet by default

This baseline is a summary, not a guarantee. See [`docs/privacy.md`](docs/privacy.md) for what data RadTempo stores and who can access it at the infrastructure level.
