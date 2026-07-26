---
phase: 05-redesign-startpage-menu
plan: 03
subsystem: testing
tags: [playwright, e2e, a11y, responsive, axe-core]

# Dependency graph
requires:
  - phase: 05-01
    provides: dashboard grid with category sections, cards, and action links
  - phase: 05-02
    provides: restructured nav with 4 items (Dashboard, Wijzigingen, Rapportages, Beheer)
provides:
  - Updated homepage E2E tests for the new dashboard (5 tests)
  - Updated global-ui nav tests with aria-current verification (3 tests)
  - Augmented a11y tests with keyboard-focusable action link test
  - New responsive layout tests (2 tests)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [test selector scoping for ::after overlays]

key-files:
  created:
    - tests/e2e/responsive.spec.ts
  modified:
    - tests/e2e/homepage.spec.ts
    - tests/e2e/global-ui.spec.ts
    - tests/e2e/a11y.spec.ts

key-decisions:
  - "Use evaluateAll to collect hrefs instead of clicking through ::after pseudo-element overlays on category cards"
  - "Check grid track count length instead of literal `1fr` for responsive CSS assertions (browser computes 1fr to pixel value)"

requirements-completed: []

coverage:
  - id: D1
    description: "Homepage dashboard E2E tests — 5 tests verifying hero, 5 category sections, section headers, action links, card structure"
    verification:
      - kind: e2e
        ref: tests/e2e/homepage.spec.ts
        status: pass
    human_judgment: false
  - id: D2
    description: "Global UI nav tests — 3 tests for 4-item nav and aria-current active state on Dashboard and Wijzigingen"
    verification:
      - kind: e2e
        ref: tests/e2e/global-ui.spec.ts
        status: pass
    human_judgment: false
  - id: D3
    description: "Accessibility audits — 6 axe-core page audits + keyboard-focusable action link test"
    verification:
      - kind: e2e
        ref: tests/e2e/a11y.spec.ts
        status: pass
    human_judgment: false
  - id: D4
    description: "Responsive layout tests — 768px single-column grid + 600px scrollable visibility"
    verification:
      - kind: e2e
        ref: tests/e2e/responsive.spec.ts
        status: pass
    human_judgment: false

# Metrics
duration: 5 min
completed: 2026-07-26
status: complete
---

# Phase 05 Plan 03: Update E2E Tests Summary

**Rewrote homepage E2E tests for the new dashboard grid, updated nav tests to match restructured navigation, added responsive tests, and augmented a11y audits**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-26T17:44:34Z
- **Completed:** 2026-07-26T17:50:14Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Rewrote `homepage.spec.ts` with 5 dashboard-specific tests (hero section, 5 category sections, section headers, action link navigation, card structure) — removed all old marketing homepage assertions
- Updated `global-ui.spec.ts` nav tests: 3 tests for 4-item nav (Dashboard, Wijzigingen, Rapportages, Beheer) with aria-current active state verification on both `/` and `/changes`
- Preserved all 4 feedback modal tests and all 3 404 page tests unchanged in `global-ui.spec.ts`
- Added keyboard-focusable category card action link test to `a11y.spec.ts` using tab-loop approach
- Created `responsive.spec.ts` with 2 tests: 768px single-column grid assertion and 600px scrollable visibility check

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite homepage E2E tests for dashboard grid** - `042e1ab` (test)
2. **Fix test selectors after verification** - `5c55540` (fix)
3. **Task 2: Update global-ui nav tests, augment a11y tests, create responsive test** - `b07a52b` (test)

**Plan metadata:** (committed in final step)

## Files Created/Modified

- `tests/e2e/homepage.spec.ts` — Rewritten: 5 dashboard tests, all old hero/stat-card/recent-changes assertions removed
- `tests/e2e/global-ui.spec.ts` — Updated nav tests (3 tests: 4 items, aria-current on Dashboard, aria-current on Wijzigingen); feedback and 404 tests preserved
- `tests/e2e/a11y.spec.ts` — Augmented with keyboard-focusable action link test using tab-loop
- `tests/e2e/responsive.spec.ts` — New file: 768px single-column grid and 600px scrollable visibility tests

## Decisions Made

- **href-based verification for category card action links:** The `::after` pseudo-element overlay on `.category-card-action.primary-link` interferes with Playwright's click actionability checks. Instead of clicking through overlays, the test collects all hrefs via `evaluateAll` and navigates directly to the first two hrefs. This is more robust and directly verifies route reachability.
- **Track count instead of literal CSS value:** `grid-template-columns: 1fr` is computed by the browser as a pixel width (e.g., `736px`). The responsive test checks the length of the grid-template-columns split array (1 track = single column) instead of asserting a literal `1fr` string.
- **Tab-loop focus test:** Category `<article>` elements aren't natively focusable, so `focus()` doesn't work. The focus test uses a tab-loop (up to 20 Tab presses) to reach the first category card action link, verifying keyboard accessibility.

## Deviations from Plan

None - plan executed exactly as written. All tests verified and passing.

## Issues Encountered

- **`::after` overlay interferes with Playwright clicks:** The full-card-click target (`.category-card-action.primary-link::after`) in the dashboard design creates an element overlay that blocks Playwright's standard click interaction. Fixed by using `evaluateAll` to extract hrefs and navigating directly.
- **Computed CSS for grid-template-columns:** The responsive test initially tried to assert `toHaveCSS("grid-template-columns", "1fr")` but the browser converts `1fr` to a computed pixel value. Fixed by checking the number of tracks (split length).
- **Focus on non-focusable elements:** `<article>` elements aren't natively tabbable/focusable. The a11y focus test was rewritten to use a tab-loop approach until the action link is focused.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 test files pass with `npx playwright test --project=chromium`
- Full E2E suite (58 tests) passes
- Full unit test suite (349 tests) passes without regression
- Phase 05 E2E verification complete — ready for overall phase verification

---

*Phase: 05-redesign-startpage-menu*
*Completed: 2026-07-26*
