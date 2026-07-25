---
phase: 04-deployment-hardening
fixed_at: 2026-07-25T18:55:00Z
review_path: .planning/phases/04-deployment-hardening/04-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 4: Deployment Hardening — Code Review Fix Report

**Fixed at:** 2026-07-25T18:55:00Z
**Source review:** .planning/phases/04-deployment-hardening/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: Backup retention cannot be disabled via environment variable

**Files modified:** `scripts/backup.mjs`
**Commit:** 4469fa9
**Applied fix:** Replaced the `|| 7` fallback (which treats `0` as falsy) with an explicit undefined check using an IIFE. When `BACKUP_RETENTION_DAYS=0`, `parseInt("0", 10)` now correctly returns `0`, allowing the `retentionDays <= 0` branch at line 88 to be reached. Negative values and `NaN` still default to 7.

### WR-02: docker-compose.yaml (Coolify variant) missing DATABASE_URL in app service

**Files modified:** `docker-compose.yaml`
**Commit:** a025efe
**Applied fix:** Added `DATABASE_URL: postgres://bcm:${POSTGRES_PASSWORD:-change-me}@db:5432/bcm` to the app service's `environment` block in the Coolify variant compose file, matching the backup service and the local-dev `docker-compose.yml`.

### WR-03: Two docker-compose files with conflicting configurations in the same directory

**Files modified:** `docker-compose.coolify.yaml`, `docker-compose.yml` (comment), `docker-compose.yaml` (deleted)
**Commits:** 0a385dc, 1b1a0a3
**Applied fix:** Renamed `docker-compose.yaml` (Coolify variant with Traefik labels) to `docker-compose.coolify.yaml` so Docker Compose does not auto-detect it — it must now be explicitly referenced with `-f docker-compose.coolify.yaml`. Added a comment at the top of `docker-compose.yml` documenting the Coolify variant. This resolves the auto-detection conflict where `.yaml` took precedence over `.yml`, causing developers to get the wrong config.

### WR-04: Empty DATABASE_URL treated as healthy demo mode in health endpoint

**Files modified:** `app/api/health/route.ts`, `tests/api/health.test.ts`
**Commit:** d1ae24f
**Applied fix:** Differentiated between "DATABASE_URL not set" (returns 200, `db: "disconnected"` — demo mode) and "DATABASE_URL set but empty" (returns 500, `db: "misconfigured"` — with warning log). Updated the test to use `vi.stubEnv("DATABASE_URL", undefined)` for the unset case and added a new test case for the empty string case. Also fixed a TypeScript type error by using the narrowed `dbUrl` variable instead of `process.env.DATABASE_URL` for the `postgres()` call.

### WR-05: CI tests on Node 20, production runs on Node 22

**Files modified:** `.github/workflows/ci.yml`
**Commit:** d36df3c
**Applied fix:** Updated all three `node-version` references in the CI pipeline from 20 to 22, matching the production Dockerfile base image (`node:22-bookworm-slim`). Also updated the test matrix value from `[20]` to `[22]`.

## Verification

- **`npm test`:** 167 tests passed, 4 skipped, 1 todo (the 4 "failed suites" are pre-existing Playwright e2e `.spec.ts` files picked up by vitest — not related to these changes)
- **`npm run build`:** Next.js production build completed successfully with TypeScript type checking

---

_Fixed: 2026-07-25T18:55:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
