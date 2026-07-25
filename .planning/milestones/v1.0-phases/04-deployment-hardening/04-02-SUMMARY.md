---
phase: 04-deployment-hardening
plan: 02
subsystem: monitoring
tags: [sentry, error-monitoring, performance-tracking, session-replay, error-boundary]
requires: []
affects: [package.json, next.config.ts, sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts, instrumentation.ts, app/global-error.tsx, .env.example]
tech-stack:
  added:
    - "@sentry/nextjs"
  patterns:
    - "Client/server/edge runtime separation for Sentry initialization"
    - "Sentry tunnel route at /monitoring for ad-blocker bypass"
    - "Dutch-language global error boundary with retry button"
key-files:
  created:
    - sentry.client.config.ts
    - sentry.server.config.ts
    - sentry.edge.config.ts
    - instrumentation.ts
    - app/global-error.tsx
  modified:
    - package.json
    - package-lock.json
    - next.config.ts
    - .env.example
decisions:
  - "Do NOT run Sentry wizard — it overwrites files and prompts interactively"
  - "Tunnel route at /monitoring to prevent ad-blockers from blocking Sentry events"
  - "tracesSampleRate: 0.2 production, 1.0 dev — balances cost vs debugging"
  - "Session replay: 10% of all sessions, 100% on error"
  - "Source maps deleted after upload to Sentry (sourcemaps.deleteSourcemapsAfterUpload: true)"
  - "Webpack treeshake removes debug logging from production bundle"
  - "SENTRY_DSN is unset by default — user must configure in Coolify env vars"
metrics:
  duration: ~10 min
  tasks_completed: 2
  total_commits: 1
completed_date: 2026-07-25
status: complete
---

# Phase 4 Plan 02: Sentry Error Monitoring — Summary

Integrated Sentry error monitoring and performance tracking for the Next.js app, configured across client, server, and Edge runtimes with session replay and a Dutch-language global error boundary.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Install @sentry/nextjs and create config files | ✅ |
| 2 | Add Sentry error boundary and verify integration | ✅ |

## What Was Built

1. **`sentry.client.config.ts`** — Browser-side Sentry init with session replay integration, 0.2 traces sample rate (production), replay sampling (10% sessions, 100% on error).

2. **`sentry.server.config.ts`** — Server-side Sentry init with 0.2 traces sample rate.

3. **`sentry.edge.config.ts`** — Edge Runtime Sentry init with 0.2 traces sample rate.

4. **`instrumentation.ts`** — Next.js instrumentation hook that imports `sentry.server.config.ts` on Node.js runtime start.

5. **`app/global-error.tsx`** — Root-level error boundary that captures exceptions to Sentry and shows a Dutch-language "Er is iets misgegaan" message with retry button. Includes `<html>` and `<body>` tags per Next.js requirements.

6. **Updated `next.config.ts`** — Wraps config with `withSentryConfig`, configures tunnel route at `/monitoring`, sourcemap deletion, and webpack treeshake for debug logging removal.

7. **Updated `.env.example`** — Added `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` with documentation comments.

## Setup Needed

> ⚠️ **User setup required:** To activate Sentry monitoring, the user must:
> 1. Create a Next.js project at https://sentry.io
> 2. Copy the DSN from Client Keys
> 3. Add `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` to Coolify environment variables

## Verification

- ✅ `npm run build` — compiles successfully with Sentry config
- ✅ `npm test` — all 166 tests pass

## Deviations from Plan

### Rule 2 — Missing Option Compatibility

- `hideSourceMaps: true` was replaced with `sourcemaps: { deleteSourcemapsAfterUpload: true }` — the newer `@sentry/nextjs` version uses the `sourcemaps` config object instead of the deprecated `hideSourceMaps` boolean.
- `disableLogger: true` was replaced with `webpack.treeshake.removeDebugLogging: true` — the newer version deprecates `disableLogger` in favor of webpack treeshake configuration.

## Threat Surface Scan

No new threat flags. Sentry DSN is environment-configured (never hardcoded), tunnel route is rate-limited by Sentry's ingress, and source maps are deleted after upload.

## Commit

- `30d6a7a` — feat(04-deployment-hardening): Sentry error monitoring integration
