---
phase: 04-deployment-hardening
reviewed: 2026-07-25T19:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - Dockerfile
  - .dockerignore
  - app/api/health/route.ts
  - sentry.client.config.ts
  - sentry.server.config.ts
  - sentry.edge.config.ts
  - instrumentation.ts
  - app/global-error.tsx
  - scripts/backup.mjs
  - scripts/startup.mjs
  - scripts/migrate.mjs
  - docker-compose.yml
  - docker-compose.yaml
  - .github/workflows/ci.yml
  - .env.example
  - tests/api/health.test.ts
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 4: Deployment Hardening — Code Review Report

**Reviewed:** 2026-07-25T19:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed 15 source files across Docker, Sentry, health checks, backup scripts, CI, and Docker Compose configuration. The overall quality is solid — good defensive patterns (retry loops, exponential backoff, proper use of `execFileSync` instead of `execSync`, pool cleanup in error paths). However, several issues were found: a bug in the backup retention logic that prevents disabling retention, a silently degraded docker-compose variant missing `DATABASE_URL`, potential misconfiguration masking in the health endpoint, and CI/production Node version drift.

## Warnings

### WR-01: Backup retention cannot be disabled via environment variable

**File:** `scripts/backup.mjs:148`
**Issue:** The expression `parseInt(process.env.BACKUP_RETENTION_DAYS || "7", 10) || 7` makes it impossible to disable retention by setting `BACKUP_RETENTION_DAYS=0`. When `parseInt("0", 10)` returns `0`, the `|| 7` fallback evaluates `0` as falsy and replaces it with `7`. The retention-disabling branch at line 88 (`if (retentionDays <= 0)`) can never be reached via environment variable configuration.

**Fix:**
```javascript
const retentionDays = (() => {
  const val = parseInt(process.env.BACKUP_RETENTION_DAYS || "7", 10);
  return isNaN(val) || val < 0 ? 7 : val;
})();
```

---

### WR-02: docker-compose.yaml (Coolify variant) missing `DATABASE_URL` in app service

**File:** `docker-compose.yaml:27-30`
**Issue:** The Coolify variant's `app` service only sets `HOSTNAME` in its environment; `DATABASE_URL` is absent. If this file is run directly (outside Coolify), the app silently falls into demo mode with no database connectivity. The backup service in the same file does have `DATABASE_URL` set correctly (line 5), making this discrepancy likely an oversight. The simpler `docker-compose.yml` includes `DATABASE_URL` in the app service.

**Fix:** Add `DATABASE_URL` to the app service environment in `docker-compose.yaml`:
```yaml
   app:
     environment:
       DATABASE_URL: postgres://bcm:${POSTGRES_PASSWORD:-change-me}@db:5432/bcm
       HOSTNAME: 0.0.0.0
```
If the intent is that Coolify injects this variable, add a comment explaining that.

---

### WR-03: Two docker-compose files with conflicting configurations in the same directory

**Files:** `docker-compose.yml`, `docker-compose.yaml`
**Issue:** Both `docker-compose.yml` (simpler, local-dev style) and `docker-compose.yaml` (Coolify variant with Traefik labels) exist in the project root. Docker Compose resolves the default compose file by trying `compose.yaml` → `compose.yml` → `docker-compose.yaml` → `docker-compose.yml`. Since `.yaml` is tried before `.yml`, the Coolify variant takes precedence on most modern Docker versions. A developer running `docker compose up` expecting the simpler local-dev configuration would get the Coolify variant instead, which is missing `DATABASE_URL` on the app service (see WR-02). This creates a fragile, version-dependent behavior.

**Fix:** Choose one of:
- Rename `docker-compose.yml` to `docker-compose.local.yml` and require `-f docker-compose.local.yml` for local dev (or use a `COMPOSE_FILE` env convention).
- Or keep only `docker-compose.yaml` and document that the simpler config lives elsewhere (e.g., in `.env.example` comments).

---

### WR-04: Empty `DATABASE_URL` treated as healthy demo mode in health endpoint

**File:** `app/api/health/route.ts:22`
**Issue:** The condition `if (!process.env.DATABASE_URL)` treats empty string (`""`) identically to `undefined` / `null`. In Next.js, environment variables can be set to empty strings via `.env.local` or the hosting platform. If `DATABASE_URL` is accidentally set to an empty string in production, the health endpoint returns `200 { status: "healthy", db: "disconnected" }` — silently masking a serious misconfiguration. The app would run with no database while monitoring thinks everything is fine.

**Fix:** Differentiate between "not set" and "set but empty":
```typescript
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl || dbUrl.trim() === "") {
  // Check if the variable is literally set (even if empty) vs. unset
  if ("DATABASE_URL" in process.env && dbUrl === "") {
    console.warn("[health] DATABASE_URL is set but empty — possible misconfiguration");
  }
  return NextResponse.json({
    status: "healthy",
    timestamp,
    db: "disconnected",
  });
}
```
Or more robustly, treat empty string as an error:
```typescript
if (!dbUrl) {
  // ...
}
if (dbUrl.trim() === "") {
  return NextResponse.json(
    { status: "degraded", timestamp, db: "misconfigured" },
    { status: 500 },
  );
}
```

---

### WR-05: CI tests on Node 20, production runs on Node 22

**File:** `.github/workflows/ci.yml:20`
**Issue:** The CI pipeline runs on `node-version: 20`, while the Dockerfile uses `node:22-bookworm-slim` (Node 22) for production. This version gap means tests execute against a different runtime than production. If a language feature or API differs between Node 20 and 22 (e.g., native fetch behavior, ESM edge cases, RegExp changes), it could pass CI but fail in production.

**Fix:** Align CI and production Node versions. Either:
- Change CI to Node 22: `node-version: 22` (preferred — matches production).
- Or change Dockerfile base to `node:20-bookworm-slim`.
- If multiple Node versions are intended for compatibility testing, add both to the test matrix.

---

## Info

### IN-01: Single-element matrix in CI test job is unnecessary

**File:** `.github/workflows/ci.yml:34-36`
**Issue:** The `test` job defines a `strategy.matrix` with a single entry (`node-version: [20]`). A matrix with one item provides no combinatorial benefit; it adds indirection without value. This was likely scaffolding for future multi-version testing that hasn't materialized.

**Fix:** Remove the matrix wrapping for clarity:
```yaml
   test:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with:
           node-version: 22
           cache: 'npm'
       - run: npm ci
       - run: npm test
```

### IN-02: No Docker image build verification in CI pipeline

**File:** `.github/workflows/ci.yml`
**Issue:** The CI pipeline runs linting, unit tests, and E2E tests, but never builds the Docker image. For a "Deployment Hardening" phase, a `docker build` step would catch Dockerfile regressions (e.g., missing packages, `npm ci` failures, COPY path errors) before they reach production. The deploy workflow (`deploy.yml`) triggers a Coolify webhook but doesn't validate the image locally first.

**Fix:** Add a Docker build step to the CI pipeline (can run in parallel with tests):
```yaml
   docker-build:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - run: docker build -t bcm:ci-test .
```

---

_Reviewed: 2026-07-25T19:00:00Z_
_Reviewer: gsd-code-reviewer (standard depth)_
_Depth: standard_
