# Environment Configuration

The following environment variables must be set in Coolify for the BCM app to function correctly.

## Required

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required — app won't start without it) | `postgres://bcm:pass@db:5432/bcm` |
| `GITHUB_TOKEN` | GitHub personal access token with `issues: write` scope. Used by the feedback form, front-end error monitor (report-error API), and commit fetching. | `ghp_...` |
| `ADMIN_USER` | **Legacy (no longer the /admin/* gate).** f4a0dda replaced the HTTP Basic Auth route gate with a cookie-based RBAC gate: `/admin/*` now renders only when the `bcm_active_role` cookie names a role with `admin:access` (profile switcher in the UI). `ADMIN_USER`/`ADMIN_PASSWORD` are still honored as a fallback for server actions when no role cookie is present (see `lib/admin-auth-request.ts`), but they no longer protect page routes. | `admin` |
| `ADMIN_PASSWORD` | **Legacy (see `ADMIN_USER`).** No longer required for the admin area; may be removed once nothing references it. | `...` |

## Sentry / Error Monitoring

The app integrates Sentry via `@sentry/nextjs` on the client, server, and edge. Errors can be sent to any Sentry-compatible backend (Sentry.io, GlitchTip, etc.).

| Variable | Purpose | Example |
|---|---|---|
|| `SENTRY_DSN` | Sentry DSN — enables error capture on client & server. **Configured** to use the GlitchTip BCM Web project. Without it, the front-end error monitor falls back to posting errors directly to GitHub Issues via the `/api/report-error` endpoint. | `https://91403ac1b9fe4f569f71a674bb2f5c09@glitchtip.7rb.nl/1` |
|| `SENTRY_ORG` | Sentry org name (used by source map upload) | `bcm-99` |
|| `SENTRY_PROJECT` | Sentry project name | `bcm-app` |

### GlitchTip (self-hosted) Setup

1. Log in to GlitchTip at the BCM organization (`admin@7rb.nl`)
2. The BCM Web project already exists (ID 1)
3. **SENTRY_DSN** is set in Coolify: `https://91403ac1b9fe4f569f71a674bb2f5c09@glitchtip.7rb.nl/1`
4. A GlitchTip alert rule "All Errors → GitHub Bridge" has been created, posting to `http://host.docker.internal:3001/webhook`
5. The GlitchTip→GitHub bridge (`glitchtip-bridge`) at 192.168.3.132:3001 creates a GitHub issue for each captured error
6. **Note:** The bridge is on a separate VM (hermesagent). For the webhook to route correctly, the Coolify host needs port 3001 to forward to 192.168.3.132:3001, or a reverse proxy/Tailscale tunnel must bridge it.

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
