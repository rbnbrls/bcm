---
phase: 01-export-feature
plan: 03
subsystem: export-tests
tags: [tests, api, component, vitest]
requires: [01-01-PLAN, 01-02-PLAN]
provides: [export-test-coverage]
affects: [tests/api/export.test.ts, tests/components/export-button.test.ts]
tech-stack:
  added: []
  patterns:
    - vi.mock on @/lib/db module for API route tests
    - Dynamic import with vi.resetModules() for fresh module state
    - Source-inspection tests for client components (no jsdom needed)
    - Raw byte checking for BOM verification in Response.body
key-files:
  created:
    - tests/api/export.test.ts — 12 tests for CSV, PDF, and error scenarios
    - tests/components/export-button.test.ts — 12 tests for component structure/behavior
  modified:
    - lib/export-pdf.ts → lib/export-pdf.tsx (rename for JSX support in vitest)
decisions:
  - API tests use dynamic import with vi.resetModules() for clean module state
  - BOM checked via arrayBuffer raw bytes (EF BB BF) since response.text() can strip BOM
  - Component tests use source-inspection approach (no jsdom/browser needed)
  - Follow existing test patterns: vi.mock, dynamic import, beforeEach cleanup
metrics:
  duration: null
completed_date: 2026-07-25
status: complete
---

# Phase 01 Plan 03: Export Tests

Create comprehensive tests for the export API route and split button component.

## What Was Built

### 1. Export API Tests (`tests/api/export.test.ts`) — 12 tests

**CSV format** (5 tests):
- Content-Type text/csv and Content-Disposition attachment headers
- UTF-8 BOM prefix (EF BB BF bytes) and semicolon delimiters
- Request metadata as header rows (reference, client, requester, rationale)
- Per-portfolio IST/SOLL diff data (both benchmark codes, portfolio names)
- CRLF line endings

**PDF format** (3 tests):
- Content-Type application/pdf and Content-Disposition attachment
- Reference in filename (BCM-2026-001, .pdf extension)
- Binary PDF header (%PDF magic bytes)

**Error handling** (4 tests):
- 400 for invalid format (e.g., docx)
- 404 for non-existent change request
- 500 when database throws
- 400 when no format param provided

### 2. Export Button Component Tests (`tests/components/export-button.test.ts`) — 12 tests

**Component structure** (6 tests):
- ExportButton export and function type
- "use client" directive present
- changeRequestId prop interface
- API URL references (/api/export/)
- Split button structure (handleDownloadCSV, toggleDropdown)
- Loading text (Exporteren)

**Behavior patterns** (6 tests):
- CSV and PDF format identifiers
- Click-outside handler (mousedown listener + cleanup via removeEventListener)
- Downloading state variable with disabled={downloading}
- Dropdown toggle (setOpen, open)
- useRef for dropdown element
- Hidden anchor element download pattern (createElement, a.click, removeChild)

### 3. Bug Fix — export-pdf.ts → export-pdf.tsx

The `lib/export-pdf.ts` file contained JSX but used `.ts` extension, causing a parse error in vitest's oxc parser. Renamed to `.tsx` (the correct extension for files containing JSX/TSX syntax).

## Deviations from Plan

### [Rule 1 - Bug] Fixed JSX-in-.ts extension for export-pdf.ts
- **Found during:** Test execution
- **Issue:** `lib/export-pdf.ts` contains JSX but has `.ts` extension; vitest's oxc parser fails to parse it
- **Fix:** Renamed to `lib/export-pdf.tsx` (allows vitest/TypeScript to properly handle JSX syntax)
- **Files modified:** `lib/export-pdf.ts` → `lib/export-pdf.tsx`
- **Commit:** 8ed7998

## Key Decisions

- **API route URL parsing**: Changed `request.nextUrl.searchParams` → `new URL(request.url).searchParams` for test compatibility (works with plain `Request` objects in vitest)
- **BOM byte checking**: Use `response.arrayBuffer()` + `Uint8Array` to verify UTF-8 BOM bytes, since `response.text()` may strip BOM during decoding
- **Source-inspection tests**: ExportButton tests use `fs.readFileSync` + string assertions instead of DOM rendering (matches existing patterns, avoids jsdom dependency)

## Self-Check: PASSED
