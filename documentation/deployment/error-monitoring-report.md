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
| Sentry DSN configured in Coolify | ❌ | Must be set manually in Coolify UI |

## 5. Remaining Action Items

1. **Configure SENTRY_DSN in Coolify:**
   - Log into GlitchTip (admin account needed)
   - Create a project for BCM (or use existing)
   - Copy the DSN (`https://<public-key>@glitchtip-pbvvk0yyehng2i8v1vr8ogp6.7rb.nl/<project-id>`)
   - Set it as `SENTRY_DSN` env var in Coolify BCM app
   - Also set `SENTRY_ORG` and `SENTRY_PROJECT` for source map uploads

2. **Configure GlitchTip webhook:**
   - In GlitchTip project settings, add a webhook
   - URL: `http://<bridge-host>:3001/webhook`
   - This enables Track A (Sentry→GlitchTip→bridge→GitHub)

3. **Verify Track A once configured:**
   - Trigger a test error after SENTRY_DSN is set
   - Confirm error appears in GlitchTip
   - Confirm GitHub issue is created via bridge
