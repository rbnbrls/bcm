---
phase: 01-export-feature
fixed_at: 2026-07-25T16:08:00Z
review_path: .planning/phases/01-export-feature/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Export Feature — Code Review Fix Report

**Fixed at:** 2026-07-25T16:08:00Z
**Source review:** `.planning/phases/01-export-feature/01-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: CSV Formula Injection (CWE-1236)

**Files modified:** `lib/export.ts`
**Commit:** `8c28fbb`
**Applied fix:** Modified `escapeCsvField` to detect values starting with `=`, `+`, `-`, `@`, or tab characters and prepend a single quote to prevent spreadsheet formula injection. Changed `const str` to `let str` to allow mutation before the quoting/quarantining logic.

### WR-01: Content-Disposition filename may contain unescaped characters

**Files modified:** `lib/export.ts`
**Commit:** `6e59a6c`
**Applied fix:** Added `sanitizeFilenameComponent` helper that strips double quotes, CR, LF characters, and replaces any non-alphanumeric/non-safe characters with hyphens. Updated `buildExportFilename` to pass `request.reference` through sanitization before constructing the filename.

### WR-02: Unused exported function `exportRequestToRows`

**Files modified:** `lib/export.ts`
**Commit:** `5413f07`
**Applied fix:** Added `@internal` and `@deprecated` JSDoc annotations with a TODO comment explaining the function is a reference implementation not wired into any consumer. Preserves the code for future use without increasing the public API surface.

### WR-03: Silent download failure in ExportButton

**Files modified:** `components/export-button.tsx`
**Commit:** `a003b87`
**Applied fix:** Replaced the click-and-hope anchor-download pattern with a Fetch API approach that checks `response.ok` before triggering the download. On HTTP errors (4xx/5xx), parses the JSON error body and displays it via `alert()`. Includes a `try/catch/finally` block with a 500ms reset delay. Error feedback is now surfaced to the user instead of silently downloading an error payload.

### IN-01: Test file uses CWD-relative file path

**Files modified:** `tests/components/export-button.test.ts`
**Commit:** `bc83228`
**Applied fix:** Replaced all 10 occurrences of `fs.readFileSync("components/export-button.tsx", "utf8")` with `fs.readFileSync(SOURCE_PATH, "utf8")` where `SOURCE_PATH` is resolved from `new URL("../../components/export-button.tsx", import.meta.url).pathname`. This is independent of the current working directory.

### IN-02: Repeated dynamic imports in API tests

**Files modified:** `tests/api/export.test.ts`
**Commit:** `e8c91a3`
**Applied fix:** Moved `const { GET } = await import("@/app/api/export/[id]/route")` to a single top-level import (after the `vi.mock()` registration), removing 12 repeated dynamic import lines from individual test cases. The top-level import captures `GET` after the mock is active; `resetModules()` in `beforeEach` does not affect the captured function reference.

---

_Fixed: 2026-07-25T16:08:00Z_
_Fixer: gsd-code-fixer_
_Iteration: 1_
