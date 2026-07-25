---
phase: 02-e2e-testing
reviewed: 2026-07-25T18:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - playwright.config.ts
  - tests/e2e/helpers.ts
  - tests/e2e/global-setup.ts
  - tests/e2e/benchmark-switch.spec.ts
  - tests/e2e/benchmark-catalog.spec.ts
  - tests/e2e/new-benchmark.spec.ts
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 02: Code Review Report — E2E Testing

**Reviewed:** 2026-07-25T18:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed 7 files from Phase 2 (E2E Testing): Playwright configuration, test helpers, 3 spec files (benchmark switch, benchmark catalog, new benchmark request), global setup, and CI pipeline.

**Positive highlights:**
- Selectors were verified against actual component DOM structure — all navigation helpers, form interactions, and post-submission assertions match the rendered HTML (benchmark-change-form.tsx, benchmark-new-form.tsx, benchmark-catalog-table.tsx, changes/[id]/page.tsx).
- Tests handle both DB-available and DB-unavailable paths gracefully with conditional assertions.
- CI job is properly configured with browser install, deps, timeout, and artifact upload on failure.

**Key concerns:**
- `selectClient` uses a fragile `page.locator("select").first()` selector with no consistent fallback across form types.
- `fillFormFields` silently skips fields that match neither `input` nor `textarea` (e.g., `<select>` elements), masking bugs.
- Two spec files import `submitForm` but never call it (dead imports).
- The same `submitForm` helper is never invoked by any spec file (dead code).

All test logic and selectors were cross-referenced against the actual component source code. No logic errors, off-by-one bugs, or security vulnerabilities were found. The issues are in the warning/info severity range.

---

## Warnings

### WR-01: `selectClient` uses fragile `.first()` selector that differs between form types

**File:** `tests/e2e/helpers.ts:40`
**Issue:** `page.locator("select").first()` assumes the client dropdown is always the first `<select>` in DOM order. This is true on both form pages today, but there's no consistent attribute-based selector across both forms:
- `benchmark-change-form.tsx` client select has NO `name` attribute (line 71): `<select value={clientId} onChange={...}>`
- `benchmark-new-form.tsx` client select HAS `name="clientId"` (line 35): `<select name="clientId" required>`

If DOM structure is reordered (e.g., moving the portfolio list before the client select in the change form), the `.first()` locator silently selects the wrong element and the test either fails confusingly or interacts with the wrong dropdown.

**Fix:** Add a `name="clientId"` attribute to the client `<select>` in `benchmark-change-form.tsx`, then update `selectClient` to:
```typescript
export async function selectClient(page: Page, clientName: string) {
  // Try name-based selector first, fall back to first select
  const select = page.locator('select[name="clientId"]').or(page.locator("select").first());
  const option = select.locator("option").filter({ hasText: clientName }).first();
  const value = await option.getAttribute("value");
  if (value === null || value === undefined) {
    throw new Error(`Could not find option matching client name "${clientName}"`);
  }
  await select.selectOption(value);
}
```

### WR-02: `fillFormFields` silently ignores fields that are neither `input` nor `textarea`

**File:** `tests/e2e/helpers.ts:76-84`
**Issue:** The helper iterates over `fields` and only writes to elements matching `input[name="..."]` or `textarea[name="..."]`. If a field name corresponds to a `<select>` element (e.g., `assetClass`), it is silently skipped with no error or warning. This masks:
- Field name changes in the component
- Developers passing a `<select>` field name through `fillFormFields` expecting it to work
- Spelling mistakes in field names (if someone writes `"assetClas": "Aandelen"`, it silently does nothing)

Currently, `fillFormFields` is never called with `<select>` field names (asset class selection is always done directly via `selectOption`), so this is not causing test failures today. But it's a latent trap.

**Fix:**
```typescript
export async function fillFormFields(page: Page, fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields)) {
    const input = page.locator(`input[name="${name}"]`);
    const textarea = page.locator(`textarea[name="${name}"]`);
    const select = page.locator(`select[name="${name}"]`);
    if ((await input.count()) > 0) {
      await input.fill(value);
    } else if ((await textarea.count()) > 0) {
      await textarea.fill(value);
    } else if ((await select.count()) > 0) {
      await select.selectOption(value);
    }
    // If none match, the test will likely fail later on assertions,
    // but surface a warning in the test output.
  }
}
```

### WR-03: `submitForm` imported but never called in `benchmark-switch.spec.ts`

**File:** `tests/e2e/benchmark-switch.spec.ts:8`
**Issue:** `submitForm` is destructured from the helpers import on line 8 but never invoked. The benchmark-switch spec does all its own click handling, including the submit flow. Unused imports inflate the module graph and signal confusion about the helper's role.

**Fix:** Remove `submitForm` from the import statement:
```typescript
import {
  navigateToBenchmarkSwitch,
  selectClient,
  selectPortfolio,
  setSOLLBenchmark,
  fillFormFields,
  // submitForm,  // <── remove
  DEMO_CLIENT_NAME,
  ...
} from "./helpers";
```

### WR-04: `submitForm` imported but never called in `new-benchmark.spec.ts`

**File:** `tests/e2e/new-benchmark.spec.ts:6`
**Issue:** Same as WR-03. `submitForm` is imported on line 6 but never invoked in any of the 4 test cases in this spec file. All 4 tests handle submission directly.

**Fix:** Remove `submitForm` from the import:
```typescript
import {
  navigateToNewBenchmarkRequest,
  selectClient,
  fillFormFields,
  // submitForm,  // <── remove
  DEMO_CLIENT_NAME,
} from "./helpers";
```

---

## Info

### IN-01: `buttonText` variable assigned but never read

**File:** `tests/e2e/benchmark-switch.spec.ts:48`
**Issue:** The line `const buttonText = await submitButton.textContent();` fetches text content from the submit button but the variable `buttonText` is never used in any assertion or logic afterward. It's dead code that performs an unnecessary DOM query, slightly slowing the test.

**Fix:** Remove the unused variable:
```typescript
// Remove: const buttonText = await submitButton.textContent();
await submitButton.click();
```

### IN-02: `submitForm` helper defined but never called by any spec file

**File:** `tests/e2e/helpers.ts:91-101`
**Issue:** The `submitForm` function is defined and exported from helpers.ts but neither spec file calls it. Both spec files handle form submission inline with explicit button clicks. This is dead code with two additional quality concerns:
1. The empty `catch` block (line 97) silently swallows timeout errors from `waitForURL`, making debugging harder if the function were ever used.
2. The function catches all errors via generic `catch { }` (not `catch (e)`), losing error context entirely.

**Fix:** Either (a) remove the function if it's not intended to be used, or (b) add error logging in the catch block and integrate it into the spec files' submission logic:
```typescript
export async function submitForm(page: Page) {
  await page.click("form.change-form button[type='submit']");
  await page.waitForLoadState("networkidle");
  try {
    await page.waitForURL("**/changes/**", { timeout: 10000 });
  } catch {
    console.warn("[submitForm] Navigation to /changes/* did not occur within 10s — form may have validation errors");
    await page.waitForLoadState("networkidle");
  }
}
```

### IN-03: `e2e-test` CI job runs independently of `test` job (no `needs` dependency)

**File:** `.github/workflows/ci.yml:36-58`
**Issue:** The `e2e-test` job runs in parallel with `test` and has no `needs: test` dependency. If unit tests fail, E2E tests still execute, consuming CI minutes and runner capacity. This is acceptable for a project at this stage but wastes resources when the failure is in unit tests (E2E tests are highly unlikely to pass if the app code has unit test failures).

**Fix:** Add `needs: test` to the `e2e-test` job to gate E2E execution on unit test success:
```yaml
  e2e-test:
    needs: test
    runs-on: ubuntu-latest
```

---

_Reviewed: 2026-07-25T18:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
