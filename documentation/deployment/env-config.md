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

## Workflow Studio feature flags

| Variable | Purpose | Default |
|---|---|---|
| `BCM_FEATURE_WORKFLOW_STUDIO_BUILDER` | Toont en ontsluit de Studio-overzicht-, nieuw- en editorroutes voor bevoegde gebruikers. | `false` |
| `BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH` | Activeert publiceren onafhankelijk van de builder. | `false` |
| `BCM_FEATURE_WORKFLOW_RUNTIME_START` | Activeert het starten van gepubliceerde workflows onafhankelijk van builder en publiceren. | `false` |

Waarden `true`, `1`, `yes` en `on` (hoofdletterongevoelig) activeren een flag. Ontbrekende of onbekende waarden schakelen het onderdeel uit.

De applicatie zelf is fail-closed: zonder enige waarde in de container-environment is
een flag uit. De compose-bestanden (`docker-compose.yml` en `docker-compose.coolify.yaml`)
declareren echter expliciete defaults: `BCM_FEATURE_WORKFLOW_STUDIO_BUILDER` en
`BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH` defaulten naar `true`, de runtime-flags naar
`false`. Een deployment via deze compose-bestanden (inclusief Coolify, dat
`/docker-compose.yaml` gebruikt) heeft de Studio dus aan, tenzij je expliciet
`false` zet. Zet de gewenste waarden in de Coolify app-environment om het beeld
per omgeving te sturen; bij productie-startup logt de app een waarschuwing
(`[feature-flags] ...`) wanneer een flag ontbreekt of een onbekende waarde heeft.

## UAT role switching

The profile switcher is enabled automatically for local development. On deployed
UAT environments that run with `NODE_ENV=production`, set
`BCM_ENABLE_IDENTITY_SWITCHER=true` and configure a strong
`BCM_SESSION_SECRET`. Set `BCM_DISABLE_IDENTITY_SWITCHER=true` to force the
switcher off.

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
