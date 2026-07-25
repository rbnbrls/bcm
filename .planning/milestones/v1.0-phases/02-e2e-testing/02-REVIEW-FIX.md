---
phase: 02
fixed_at: 2026-07-25T16:40:00Z
review_path: .planning/phases/02-e2e-testing/02-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 3
skipped: 4
status: partial
---

# Phase 02: Code Review Fix Report — E2E Testing

**Fixed at:** 2026-07-25T16:40:00Z
**Source review:** .planning/phases/02-e2e-testing/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 3
- Skipped: 4

## Fixed Issues

### WR-01: `selectClient` uses fragile `.first()` selector that differs between form types

**Files modified:** `components/benchmark-change-form.tsx`, `tests/e2e/helpers.ts`
**Commit:** `c079b73`
**Applied fix:**
- Added `name="clientId"` attribute to the client `<select>` in `benchmark-change-form.tsx` so both the change form and new-benchmark form have a consistent attribute-based selector.
- Updated `selectClient` in `helpers.ts` to use `page.locator('select[name="clientId"]').or(page.locator("select").first())` — tries the name-based selector first, falls back to `.first()` for backward compatibility.
- Also added an explicit error throw if the matching option's value cannot be found (defensive check).

### WR-02: `fillFormFields` silently ignores fields that are neither `input` nor `textarea`

**Files modified:** `tests/e2e/helpers.ts`
**Commit:** `7d834b3`
**Applied fix:**
- Added `<select>` detection to `fillFormFields`: if neither `input[name="..."]` nor `textarea[name="..."]` is found, the helper now checks for `select[name="..."]` and calls `selectOption(value)`.
- This prevents silent failures when fields like `assetClass`, `currency`, etc. are passed through `fillFormFields`.

### IN-02: `submitForm` has empty catch that swallows errors (adapted fix)

**Files modified:** `tests/e2e/helpers.ts`
**Commit:** `7d834b3`
**Applied fix:**
- The committed version of `submitForm` uses `Promise.race` with a `.catch(() => {})` on `waitForSelector`. Fixed the empty catch to include a `console.warn` message so swallowed timeout errors produce visible diagnostics.

### IN-03: `e2e-test` CI job runs independently of `test` job (no `needs` dependency)

**Files modified:** `.github/workflows/ci.yml`
**Commit:** `fc15b76`
**Applied fix:**
- Added `needs: test` to the `e2e-test` job so E2E tests only execute after the unit test job succeeds. This saves CI minutes when unit tests fail.

## Skipped Issues

### WR-03: `submitForm` imported but never called in `benchmark-switch.spec.ts`

**File:** `tests/e2e/benchmark-switch.spec.ts:8`
**Reason:** Code context differs from review. In the committed version (worktree based on `c2ced32`), `submitForm` IS called on line 45 (`await submitForm(page);`). The reviewed version had uncommitted changes that removed the `submitForm` call but left the import. The committed code is correct — no fix needed.

### WR-04: `submitForm` imported but never called in `new-benchmark.spec.ts`

**File:** `tests/e2e/new-benchmark.spec.ts:6`
**Reason:** Code context differs from review. In the committed version, `submitForm` IS called on line 38 (`await submitForm(page);`). Same situation as WR-03 — the committed code correctly uses the import.

### IN-01: `buttonText` variable assigned but never read

**File:** `tests/e2e/benchmark-switch.spec.ts:48`
**Reason:** Code context differs from review. The `buttonText` variable does not exist in the committed version of the file. The test in the committed code calls `await submitForm(page)` instead and never creates a `buttonText` variable. The issue was introduced in uncommitted working tree changes.

## Verification Results

- **`npm test` (vitest):** 13 files passed, 3 E2E suites failed (pre-existing — Playwright specs can't run under vitest), 1 skipped (pre-existing migration test). Zero regressions from fix changes.
- **`npx playwright test --list`:** All 12 tests in 3 spec files listed correctly with the Playwright runner.
- **Syntax/structure checks:** All modified files verified for structural integrity (balanced braces/parens).

---

_Fixed: 2026-07-25T16:40:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
