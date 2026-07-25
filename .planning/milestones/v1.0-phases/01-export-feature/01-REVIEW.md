---
phase: 01-export-feature
reviewed: 2026-07-25T22:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - lib/export.ts
  - lib/export-pdf.tsx
  - app/api/export/[id]/route.ts
  - components/export-button.tsx
  - app/changes/[id]/page.tsx
  - app/globals.css
  - tests/api/export.test.ts
  - tests/components/export-button.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 1: Export Feature — Code Review Report

**Reviewed:** 2026-07-25T22:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the Phase 1 export feature implementation: CSV/PDF generation (`lib/export.ts`, `lib/export-pdf.tsx`), the export API route (`app/api/export/[id]/route.ts`), the split-button component (`components/export-button.tsx`), integration into the detail page, CSS styles, and test files. Overall the implementation is well-structured with proper separation of concerns and good test coverage. However, one security vulnerability (CSV formula injection), a Content-Disposition header hardening gap, dead code, and a silent download failure issue were identified.

## Critical Issues

### CR-01: CSV Formula Injection (CWE-1236)

**File:** `lib/export.ts:52-58`
**Issue:** The `escapeCsvField` function does not sanitize fields starting with `=`, `+`, `-`, or `@` characters. When the exported CSV is opened in a spreadsheet application (Excel, LibreOffice Calc), cells beginning with these characters are interpreted as formulas, enabling CSV injection attacks (command execution, data exfiltration). While the attack requires malicious data to already exist in the database, defense-in-depth requires sanitizing all exported values.

All user-supplied fields are affected: `request.reference`, `request.clientName`, `request.clientReference`, `request.requestedBy`, `request.rationale`, `request.changeType`, `request.status`, `item.portfolioName`, `item.portfolioReference`, `item.previousBenchmark.code`, `item.previousBenchmark.name`, `item.requestedBenchmark.code`, `item.requestedBenchmark.name`.

**Fix:** Prepend a single quote to any value that starts with a formula-injection character before CSV encoding:

```typescript
function escapeCsvField(value: string | number | undefined | null): string {
  let str = value == null ? "" : String(value);
  // Prevent CSV formula injection — prefix `=`, `+`, `-`, `@`, `\t` with a single quote
  if (/^[=+\-@\t]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

## Warnings

### WR-01: Content-Disposition filename may contain unescaped characters

**File:** `app/api/export/[id]/route.ts:37-38`
**Issue:** The `Content-Disposition` header filename is constructed from `request.reference` via `buildExportFilename` without sanitizing double quotes or control characters. If `request.reference` contains a double quote (`"`) or CR/LF characters, the header becomes malformed — browsers may apply an incorrect filename, and in older HTTP stacks CRLF could enable response-header injection. While `request.reference` is typically system-generated (`BCM-2026-001`), the field is accepted from user input in `saveChangeRequest` and should not be trusted in a response header context.

**Fix:** Strip or escape double quotes and control characters from the filename:

```typescript
function sanitizeFilenameComponent(s: string): string {
  return s.replace(/["\r\n]/g, "").replace(/[^a-zA-Z0-9_\-. ]/g, "-");
}

export function buildExportFilename(request: ChangeRequest, ext: string): string {
  const date = request.effectiveDate
    ? new Date(request.effectiveDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const slug = clientSlug(request.clientName);
  const ref = sanitizeFilenameComponent(request.reference);
  return `${ref}-${slug}-${date}.${ext}`;
}
```

### WR-02: Unused exported function `exportRequestToRows`

**File:** `lib/export.ts:126-136`
**Issue:** `exportRequestToRows` is exported from the module but is never imported by any runtime code (API route, PDF generator, or component). It was planned (see `01-01-PLAN.md`) but never wired into the PDF generator or CSV builder — both consume `request.items` directly. This is dead code that increases the API surface and will confuse future maintainers.

**Fix:** Remove the export if no consumer exists, or wire it into the PDF generator if it was intended to be used there. If it is retained for future use, add a `@internal` JSDoc tag and a `// TODO: wire into X` comment explaining the intent.

### WR-03: Silent download failure in ExportButton

**File:** `components/export-button.tsx:14-27`
**Issue:** The `triggerDownload` function uses the anchor-element-click pattern to trigger a download. This approach cannot detect HTTP errors (4xx/5xx). If the server returns an error response (e.g., 404 change request not found, 500 PDF generation error), the browser will silently download a file containing the error JSON instead of the expected CSV/PDF. The user sees "Exporteren…" for 1.5 seconds and then the button re-enables with no error feedback. This results in data loss (user believes they have a valid export) and poor UX.

**Fix:** Use the Fetch API to detect errors before triggering the download:

```typescript
const triggerDownload = useCallback(
  async (format: "csv" | "pdf") => {
    setDownloading(true);
    setOpen(false);
    try {
      const response = await fetch(`/api/export/${changeRequestId}?format=${format}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Export mislukt.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // Show user-facing error (e.g., toast or alert)
      console.error("Export failed:", err);
      alert(err instanceof Error ? err.message : "Export mislukt.");
    } finally {
      setTimeout(() => setDownloading(false), 500);
    }
  },
  [changeRequestId]
);
```

**Note:** The anchor-click approach is simpler and works for GET-only responses. If keeping the anchor pattern for simplicity, at minimum add a `setTimeout` with a shorter delay and a fallback check on the downloaded content size. The Fetch approach is recommended.

## Info

### IN-01: Test file uses CWD-relative file path

**File:** `tests/components/export-button.test.ts:19,24,30,39,47,54,60,67,73,79,86`
**Issue:** Multiple tests use `fs.readFileSync("components/export-button.tsx", "utf8")` with a path relative to the current working directory. If tests are executed from a subdirectory (e.g., `cd tests && vitest run`), these lookups will fail. The idiom is also fragile — it reads source text rather than testing rendered component behavior.

**Fix:** Use `import.meta.resolve` or `process.cwd()`-based path, or better, use `new URL(import.meta.resolve("@/components/export-button"), import.meta.url)` for a CWD-independent path. Consider migrating to a proper component-rendering test (e.g., with `@testing-library/react` and `jsdom`) instead of source-text scanning.

### IN-02: Repeated dynamic imports in API tests

**File:** `tests/api/export.test.ts:86-304`
**Issue:** Each test case calls `await import("@/app/api/export/[id]/route")` independently, re-importing the module every time. Combined with `vi.resetModules()` in `beforeEach`, this is correct but needlessly repetitive. A single top-level import (after mocks are set up) would suffice, reducing boilerplate by ~60 lines.

**Fix:** Import the route handler once in `beforeAll` and reference `GET` directly in each test, removing repeated `await import(...)` calls. Keep `resetModules()` if module-level state isolation is required.

---

_Reviewed: 2026-07-25T22:00:00Z_
_Reviewer: gsd-code-reviewer (standard depth)_
_Depth: standard_
