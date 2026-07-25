---
phase: 04-deployment-hardening
plan: 04
subsystem: ci-cd
tags: [github-actions, caching, parallel-jobs, build-optimization]
requires: []
affects: [.github/workflows/ci.yml]
tech-stack:
  added: []
  patterns:
    - "actions/cache@v4 with lockfile hash keys"
    - "Per-job cache isolation (npm-lint, npm-test, npm-e2e)"
    - "Playwright browser cache with restore-keys fallback"
    - "Conditional Playwright install on cache miss"
key-files:
  modified:
    - .github/workflows/ci.yml
decisions:
  - "Lint and test run in parallel (no dependency between them)"
  - "e2e-test still needs test (logical dependency)"
  - "Remove node-version matrix from e2e-test (single version reduction)"
  - "Use per-job npm cache keys to avoid cross-job cache conflicts"
  - "Playwright cache uses lockfile hash, not browser version (lockfile changes when Playwright version changes)"
metrics:
  duration: ~5 min
  tasks_completed: 1
  total_commits: 1
completed_date: 2026-07-25
status: complete
---

# Phase 4 Plan 04: CI Pipeline Optimization — Summary

Optimized the GitHub Actions CI workflow for speed, adding npm caching, Playwright browser caching, and a parallel lint job alongside test and e2e-test jobs.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Add npm and Playwright caching, parallelize lint job | ✅ |

## What Was Built

1. **New `lint` job** — Runs `npm run lint` in parallel with test (no `needs` dependency).

2. **npm caching** — All three jobs (`lint`, `test`, `e2e-test`) use `actions/cache@v4` for `~/.npm` with per-job cache keys based on lockfile hash and restore-keys fallbacks.

3. **Playwright browser caching** — `e2e-test` job caches `~/.cache/ms-playwright` with lockfile-hash key. `npx playwright install` is conditional on `cache-hit != 'true'`.

4. **Removed node-version matrix from e2e-test** — Single version (20) is sufficient; reduces CI overhead.

5. **Preserved existing behavior** — Triggers (push/PR to main), concurrency group with cancel-in-progress, artifact uploads on failure.

## Verification

- ✅ `npm test` — all 166 tests pass
- Workflow syntax validated statically (follows existing GitHub Actions patterns)
- Cannot run actual CI pipeline without pushing to GitHub

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new threat flags. CI workflow is committed to repo (branch protection on main). Cache entries are scoped to the repository. GitHub Actions actions are pinned to major version tags (v4).

## Commit

- `29e8753` — perf(04-deployment-hardening): Optimize CI pipeline with caching and parallel lint job
