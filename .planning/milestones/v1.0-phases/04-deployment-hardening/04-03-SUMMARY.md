---
phase: 04-deployment-hardening
plan: 03
subsystem: infrastructure
tags: [postgresql, backup, retention, disaster-recovery, cron]
requires: []
affects: [scripts/backup.mjs, docker-compose.yml, docker-compose.yaml]
tech-stack:
  added:
    - "pg_dump (custom format, compress=9)"
  patterns:
    - "execFileSync with explicit args for shell injection safety"
    - "DATABASE_URL parsing via new URL()"
    - "Docker named volumes for backup persistence"
    - "Cron-based daily backup schedule"
key-files:
  created:
    - scripts/backup.mjs
  modified:
    - docker-compose.yml
    - docker-compose.yaml
decisions:
  - "Use --dbname=connection_string for pg_dump (safest for URL-encoded passwords)"
  - "Custom format (--format=custom) for compressed output and parallel restore capability"
  - "Backups stored in named Docker volume (bcm_postgres_backups) for portability"
  - "Cron runs at 3 AM daily in both local dev and Coolify compose files"
  - "Retention default of 7 days, configurable via BACKUP_RETENTION_DAYS"
metrics:
  duration: ~8 min
  tasks_completed: 2
  total_commits: 1
completed_date: 2026-07-25
status: complete
---

# Phase 4 Plan 03: PostgreSQL Backup — Summary

Created a PostgreSQL backup strategy with automated script, retention policy, and docker-compose backup services for both local development and Coolify production.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Create backup.mjs script for pg_dump with gzip compression | ✅ |
| 2 | Add backup infrastructure to docker-compose files | ✅ |

## What Was Built

1. **`scripts/backup.mjs`** — Standalone Node.js script:
   - Parses `DATABASE_URL` via `new URL()` for component extraction
   - Executes `pg_dump` via `execFileSync` (no shell injection risk) with:
     - `--no-owner`, `--clean`, `--if-exists` (portable, idempotent restore)
     - `--no-privileges`, `--format=custom`, `--compress=9` (compressed, parallel restore)
   - Output: `/backups/bcm-YYYY-MM-DD-HHmmss.dump`
   - Retention: removes backups older than `BACKUP_RETENTION_DAYS` (default 7)
   - Dry-run mode: `node scripts/backup.mjs --dry-run`
   - 5-minute timeout, graceful error handling, non-zero exit on failure

2. **Updated `docker-compose.yml`** — Added backup service:
   - `postgres:17-alpine` with Node.js installed via apk
   - Cron job runs `backup.mjs` daily at 3 AM
   - Mounts backup script as read-only volume
   - Depends on `db: service_healthy`
   - New `bcm_postgres_backups` named volume

3. **Updated `docker-compose.yaml`** (Coolify variant) — Same backup service on `internal` network.

4. **Documentation** — Script header includes automated (cron), manual (one-liner), and Coolify scheduled task approaches plus restore commands.

## Verification

- ✅ `node scripts/backup.mjs --dry-run` with DATABASE_URL — exits 0, shows correct pg_dump command
- ✅ `npm test` — all 166 tests pass
- Docker compose validation not possible locally (Docker not available), but YAML syntax follows existing patterns

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new threat flags. Backup files are stored in internal Docker volumes (not exposed), and script uses `execFileSync` with explicit arguments preventing shell injection.

## Commit

- `27d9f4a` — feat(04-deployment-hardening): PostgreSQL backup script with cron-based docker-compose service
