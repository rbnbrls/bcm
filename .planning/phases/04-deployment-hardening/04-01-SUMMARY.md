---
phase: 04-deployment-hardening
plan: 01
subsystem: infrastructure
tags: [docker, healthchecks, build-optimization, layer-caching]
requires: []
affects: [Dockerfile, .dockerignore, app/api/health/route.ts, tests/api/health.test.ts]
tech-stack:
  added: []
  patterns:
    - "Multi-stage Docker layer strategy (base → dependencies → builder → runner)"
    - "HEALTHCHECK via curl for immediate exit code vs Node.js HTTP overhead"
    - "Dedicated lightweight health endpoint (no SSR, no heavy imports)"
key-files:
  created:
    - .dockerignore
    - app/api/health/route.ts
    - tests/api/health.test.ts
  modified:
    - Dockerfile
decisions:
  - "HEALTHCHECK uses curl -f http://localhost:3000/api/health instead of node -e http.get for faster, simpler health checks"
  - "Start-period reduced from 60s to 30s because /api/health is fast and startup.mjs already waits for DB"
  - "Database connectivity errors return 503 (degraded) not crash — container won't restart-loop on transient DB issues"
metrics:
  duration: ~12 min
  tasks_completed: 2
  total_commits: 1
completed_date: 2026-07-25
status: complete
---

# Phase 4 Plan 01: Docker Optimization + Health Checks — Summary

Optimized Docker image build with `.dockerignore` (excluding build artifacts, secrets, test files), improved multi-stage layering strategy, and a dedicated `/api/health` endpoint for reliable container health checking.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Create .dockerignore and optimize Dockerfile layer ordering | ✅ |
| 2 | Create /api/health endpoint with tests (tdd) | ✅ |

## What Was Built

1. **`.dockerignore`** — Excludes `node_modules/`, `.next/`, `.git/`, `.env*`, `*.md`, test/CI artifacts, and IDE files from Docker build context.

2. **Optimized Dockerfile** — Layer strategy documented in header comments:
   - Base → Dependencies → Builder → Runner stages
   - `apt-get install` moved before `COPY --from=builder` lines (rarely changes, shared layer)
   - `COPY --link` for package.json layer to avoid invalidating downstream layers on source changes
   - Health check switched from `node -e http.get` to `curl -f http://localhost:3000/api/health`

3. **`/api/health` endpoint** (GET):
   - `force-dynamic`, no SSR, no heavy imports
   - DATABASE_URL set + reachable → `200 { status: "healthy", db: "connected" }`
   - DATABASE_URL set + unreachable → `503 { status: "degraded", db: "error" }`
   - DATABASE_URL not set (demo mode) → `200 { status: "healthy", db: "disconnected" }`
   - 3-second DB connect timeout; dynamic import of postgres

4. **Comprehensive unit tests** — Tests for all three health endpoint states plus force-dynamic assertion.

## Verification

- ✅ `npm test` — all 166 vitest tests pass (including 4 new health endpoint tests)
- ✅ `npm run build` — compiles successfully
- ✅ Backup script `--dry-run` executes correctly
- Pre-existing: 4 Playwright e2e test suites fail under vitest (not caused by this plan)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new threat flags. The `/api/health` endpoint is internal-only (not exposed via Traefik), and `.dockerignore` prevents secrets from entering the build context.

## Commit

- `f85d69c` — feat(04-deployment-hardening): Docker optimization with .dockerignore and /api/health endpoint
