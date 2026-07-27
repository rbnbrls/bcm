# Environment Configuration

The following environment variables must be set in Coolify for the BCM app to function correctly.

## Required

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required — app won't start without it) | `postgres://bcm:pass@db:5432/bcm` |
| `GITHUB_TOKEN` | GitHub personal access token with `issues: write` scope. Used by the feedback form, front-end error monitor (report-error API), and commit fetching. | `ghp_...` |

## Sentry / Error Monitoring

The app integrates Sentry via `@sentry/nextjs` on the client, server, and edge. Errors can be sent to any Sentry-compatible backend (Sentry.io, GlitchTip, etc.).

| Variable | Purpose | Example |
|---|---|---|
| `SENTRY_DSN` | Sentry DSN — enables error capture on client & server. **Currently unset in Coolify.** Without it, the front-end error monitor falls back to posting errors directly to GitHub Issues via the `/api/report-error` endpoint. | `https://public-key@glitchtip.example.com/1` |
| `SENTRY_ORG` | Sentry org name (used by source map upload) | `bcm` |
| `SENTRY_PROJECT` | Sentry project name | `bcm-frontend` |

### GlitchTip (self-hosted) Setup

1. Log in to GlitchTip at the service URL
2. Create a project for BCM (or use the existing one)
3. Copy the DSN and set it as `SENTRY_DSN` in Coolify
4. In GlitchTip, configure a webhook that POSTs to `http://<bridge-host>:3001/webhook`
5. The GlitchTip→GitHub bridge (`glitchtip-bridge`) creates a GitHub issue for each captured error

### Fallback: Direct GitHub Issues

When `SENTRY_DSN` is not set, the front-end error boundaries (`app/global-error.tsx` and `app/error.tsx`) POST errors to `/api/report-error`, which creates a GitHub issue in `rbnbrls/bcm` with labels `bug` and `frontend`. This requires `GITHUB_TOKEN` to be set.

## Stakeholder Notifications

| Variable | Purpose |
|---|---|
| `WEBHOOK_ADMINISTRATIE` | Webhook URL for administratie notifications |
| `WEBHOOK_ASSET_SERVICE` | Webhook URL for asset service notifications |
| `WEBHOOK_FACTSET` | Webhook URL for FactSet notifications |
| `NOTIFY_EMAIL_ADMINISTRATIE` | Email recipient for administratie (fallback) |
| `NOTIFY_EMAIL_ASSET_SERVICE` | Email recipient for asset service (fallback) |
| `NOTIFY_EMAIL_FACTSET` | Email recipient for FactSet (fallback) |

## SMTP

| Variable | Purpose | Default |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname | — |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | Sender email address | `noreply@bcm.7rb.nl` |
