# Front-End Error Monitoring — Audit & Implementation Report

**Task:** t_233438bf
**Date:** 2026-07-27
**Repo:** rbnbrls/bcm

## 1. Existing Setup Found

### Sentry Integration (Code-Level)
The BCM project has `@sentry/nextjs` v10.68.0 installed with full configuration:
- `sentry.client.config.ts` — Client-side Sentry init (reads `SENTRY_DSN` env var)
- `sentry.server.config.ts` — Server-side Sentry init
- `sentry.edge.config.ts` — Edge runtime Sentry init  
- `next.config.ts` wraps the config with `withSentryConfig()`

### Issue: SENTRY_DSN Not Set in Coolify
The `SENTRY_DSN` environment variable is **not configured** in the Coolify BCM app. Without it, the Sentry SDK initializes but doesn't send events anywhere. Verified by:
- No Sentry globals found in browser JS bundles
- `/monitoring` tunnel route returns 404 (Sentry's tunnel is inactive)
- No Sentry error capture visible in the running app

### GlitchTip (Self-Hosted Sentry Backend)
- GlitchTip is running as a Coolify service at `https://glitchtip-pbvvk0yyehng2i8v1vr8ogp6.7rb.nl`
- The **GlitchTip→GitHub bridge** (`glitchtip-bridge`) runs as a systemd user service:
  - Listens on `http://localhost:3001/webhook`
  - Creates GitHub issues in `rbnbrls/bcm` with labels `bug, glitchtip`
  - Has dedup support (checks for existing issues by glitchtip-id)
  - Verified working: previously created issues #122, #123
  - **Requires** GlitchTip webhook to be configured to POST to the bridge

### Feedback Form (Existing GitHub Issues Integration)
The `app/feedback/actions.ts` already posts feedback directly to GitHub Issues API. It uses `GITHUB_TOKEN` env var. Bug found: the Authorization header line had a formatting error (displayed as `*** ${token}` — actual file on disk is correct, just display-redacted by the terminal).

## 2. Changes Made

### New: Client-Side Error Reporting API (`POST /api/report-error`)
- **File:** `app/api/report-error/route.ts`
- Accepts JSON with `{ error: { name, message, stack, componentStack? }, url?, timestamp? }`
- Creates a GitHub issue in `rbnbrls/bcm` with labels `bug, frontend`
- Title format: `[Frontend Error] <ErrorName>: <message>`
- Body includes stack trace (truncated to 2000 chars), URL, and timestamp
- Uses `GITHUB_TOKEN` from Coolify env

### Updated: Global Error Boundary (`app/global-error.tsx`)
- Calls `Sentry.captureException(error)` (works if SENTRY_DSN is configured)
- **Fallback:** posts error to `/api/report-error` (works when SENTRY_DSN is absent)
- Shows the user a friendly error message including the error details

### Updated: Root Error Boundary (`app/error.tsx`)
- Posts errors to `/api/report-error` on capture
- Shows the user a friendly message with confirmation that the error was reported

### New: Environment Configuration Documentation
- **File:** `documentation/deployment/env-config.md`
- Documents all env vars including SENTRY_DSN, GITHUB_TOKEN, webhooks, and SMTP config

## 3. Error Monitoring Pipeline (Two Tracks)

### Track A: Sentry → GlitchTip → GitHub Bridge (Preferred)
```
Client error → Sentry SDK → GlitchTip (Sentry-compatible backend)
  → GlitchTip webhook → glitchtip-bridge (:3001/webhook)
  → GitHub Issue in rbnbrls/bcm (labels: bug, glitchtip)
```
**Status:** Code-ready, blocked on setting `SENTRY_DSN` in Coolify.

### Track B: Direct GitHub Issues (Fallback, Currently Active)
```
Client error → Error boundary → /api/report-error
  → POST to GitHub Issues API → GitHub Issue (labels: bug, frontend)
```
**Status:** ✅ Working (verified via POST /api/report-error → issue #157)

## 4. Verification Results

| Check | Result | Evidence |
|---|---|---|
| Sentry SDK present in codebase | ✅ | `@sentry/nextjs` installed, 3 config files |
| GlitchTip→GitHub bridge running | ✅ | systemd service active, enrichment enabled |
| Bridge can create GitHub issues | ✅ | Issues #122, #123 created previously |
| Front-end error reporting API | ✅ | POST /api/report-error → 200 |
| Test error created GitHub issue | ✅ | Issue #157 created with label `bug, frontend` |
| Client error boundaries deployed | ✅ | Chunks contain error reporter code |
| Deployed via Coolify | ✅ | GH Actions workflow run #75 completed successfully |
| Sentry DSN configured in Coolify | ✅ | Set to `https://91403ac1b9fe4f569f71a674bb2f5c09@glitchtip.7rb.nl/1` |

## 5. Current Status

### Status: Mostly Complete

The error monitoring pipeline has two tracks:

### Track A: Sentry → GlitchTip → GitHub Bridge (Partially working)
```
Client error → Sentry SDK → GlitchTip (Sentry-compatible backend)
  → GlitchTip alert rule → webhook → glitchtip-bridge (:3001/webhook)
  → GitHub Issue in rbnbrls/bcm (labels: bug, glitchtip)
```
- ✅ **SENTRY_DSN** configured in Coolify: `https://91403ac1b9fe4f569f71a674bb2f5c09@glitchtip.7rb.nl/1`
- ✅ **App redeployed** with new env var
- ✅ **GlitchTip alert rule** created: "All Errors → GitHub Bridge" (sends events to `http://host.docker.internal:3001/webhook`)
- ⚠️ **Webhook connectivity:** The bridge runs on hermesagent (192.168.3.132:3001). The GlitchTip container sends webhooks to `host.docker.internal:3001` (Docker host). These two machines are on the same LAN but a port forward or reverse proxy is needed on the Docker host to route port 3001 → 192.168.3.132:3001.
- ✅ **Bridge running:** systemd service active, enrichment enabled, can create issues

### Track B: Direct GitHub Issues (✅ Fully Working)
```
Client error → Error boundary → /api/report-error
  → POST to GitHub Issues API → GitHub Issue (labels: bug, frontend)
```
Also via server actions:
```
Server action catch → reportError() → Sentry (GlitchTip) + GitHub Issue
```

### Remaining Work
1. **Bridge network connectivity:** Set up a route from the Coolify Docker host to the bridge:
   - Option A: SSH to `homelab` server and add `socat TCP-LISTEN:3001 TCP:192.168.3.132:3001`
   - Option B: Deploy glitchtip-bridge as a Coolify app with a public FQDN
   - Option C: Use Tailscale Serve on hermesagent to expose port 3001 (and add the Coolify host to the tailnet)
2. **Verify Track A End-to-End:** Trigger a test error, confirm it appears in GlitchTip, and confirm GitHub issue is created via bridge
