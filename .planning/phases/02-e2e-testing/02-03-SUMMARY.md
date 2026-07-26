---
phase: 02-e2e-testing
plan: 03
subsystem: testing
tags:
  - e2e
  - playwright
  - new-benchmark
  - ci
requires:
  - 02-01-playwright-setup
provides:
  - new-benchmark-spec
  - e2e-ci-job
affects:
  - tests/e2e/new-benchmark.spec.ts
  - .github/workflows/ci.yml
tech-stack:
  added: []
  patterns:
    - GitHub Actions e2e-test job parallel to test job
    - Playwright Chromium install with system deps in CI
    - Conditional DB-available / DB-unavailable test paths
key-files:
  created:
    - tests/e2e/new-benchmark.spec.ts
  modified:
    - .github/workflows/ci.yml
decisions:
  - "CI job named e2e-test runs in parallel with test job on ubuntu-latest"
  - "CI uses npx playwright install --with-deps chromium for browser binary"
  - "CI uploads playwright-report/ and test-results/ on failure"
  - "15-minute timeout to prevent runaway test execution"
metrics:
  duration: "~10 min"
  completed_date: "2026-07-25"
status: complete
---

# Phase 02 Plan 03: New Benchmark Request + CI Summary

**One-liner:** Created 4 E2E tests for the new benchmark request flow (happy path, validation, shortName check, uppercase transforms) and added an `e2e-test` CI job that installs Chromium and runs all Playwright tests.

## Tasks Executed

### Task 1: Create E2E test for new benchmark request flow

Created `tests/e2e/new-benchmark.spec.ts` with 4 tests:
1. **Full new benchmark request** — navigates from homepage, selects client, fills benchmark details (shortName, longName, assetClass, currency), fills request context, submits; verifies error handling when DB unavailable
2. **Shows validation errors for empty required fields** — clicks submit without filling anything; verifies page stays on form and button text unchanged
3. **Validates shortName minimum length** — fills all fields with valid data except shortName ("X"); verifies server returns "Korte naam is verplicht" error
4. **Uppercases shortName and currency** — submits with lowercase values; verifies no validation errors appeared (confirming Zod transforms ran successfully before DB save attempt)

### Task 2: Add Playwright E2E tests to CI pipeline

Updated `.github/workflows/ci.yml` with a new `e2e-test` job:
- Runs in parallel with the existing `test` job on `ubuntu-latest`
- Node.js 20 with npm cache
- `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e`
- Uploads `playwright-report/` and `test-results/` on failure
- `timeout-minutes: 15` to prevent runaway execution

## Deviations from Plan

### [Rule 2 - Missing critical functionality] SelectClient option text format

- **Found during:** Test execution
- **Issue:** Client dropdown options use format "{name} · {externalReference}" (e.g. "Pensioenfonds Horizon · PF-HOR-001"), so `selectOption({ label })` with just the name failed
- **Fix:** Updated `selectClient` to find the option by partial text match then select by value
- **Files modified:** `tests/e2e/helpers.ts`

## Verification

- `npx playwright test` all 12 tests pass ✓
- CI YAML is valid with e2e-test job (verified by node script) ✓
- Tests work with demo fixture data (no DATABASE_URL required) ✓

## Commits

- `23333fb`: test(02-e2e-testing): add new benchmark E2E tests and CI job
