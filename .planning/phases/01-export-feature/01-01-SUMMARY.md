---
phase: 01-export-feature
plan: 01
subsystem: export
tags: [api, csv, pdf, export]
requires: []
provides: [export-api, export-utils]
affects: [lib/export.ts, lib/export-pdf.ts, app/api/export/[id]/route.ts]
tech-stack:
  added:
    - "@react-pdf/renderer v4.5.1 — server-side PDF generation"
  patterns:
    - API route dispatching via format query param
    - CSV string construction with semicolon delimiter (Dutch locale)
    - PDF rendering via @react-pdf/renderer Document/Page primitives
key-files:
  created:
    - lib/export.ts — CSV builder, filename helper, types/constants
    - lib/export-pdf.ts — PDF document definition + render to buffer
    - app/api/export/[id]/route.ts — GET handler dispatching CSV/PDF
decisions:
  - CSV uses semicolons as delimiter (Dutch locale), UTF-8 BOM prefix, Dutch column headers
  - PDF uses @react-pdf/renderer Document/Page/View/Text primitives
  - Single endpoint /api/export/{id} with format=csv|pdf query param
  - force-dynamic to prevent caching of download responses
  - Content-Disposition: attachment triggers immediate download
metrics:
  duration: null
completed_date: 2026-07-25
status: complete
---

# Phase 01 Plan 01: Server-side Export (CSV + PDF)

Create the server-side export API route supporting CSV and PDF download for change request details. Users can download a CSV or PDF summary of a change request directly from the detail page.

## What Was Built

### 1. Shared Export Utilities (`lib/export.ts`)
- `CONTENT_TYPE_CSV` / `CONTENT_TYPE_PDF` — MIME type constants
- `ExportFormat` type: `"csv" | "pdf"`
- `ExportRow` interface for per-portfolio data rows
- `buildExportFilename(request, ext)` — pattern: `{reference}-{clientSlug}-{date}.{ext}`
- `buildCsvContent(request)` — semicolon-delimited CSV with BOM, Dutch headers, metadata block
- `exportRequestToRows(request)` — maps `request.items` to `ExportRow[]`

### 2. PDF Generator (`lib/export-pdf.ts`)
- `buildPdfBuffer(request)` — generates PDF via `@react-pdf/renderer`
- Document structure: header with metadata, IST/SOLL diff table, rationale section, footer
- Supports both `benchmark_switch` and `new_benchmark` change types
- Styled with the app's design system colors (`#0f6d55` accent, alternating rows)

### 3. Export API Route (`app/api/export/[id]/route.ts`)
- `GET /api/export/{id}?format=csv` — returns CSV with `Content-Disposition: attachment`
- `GET /api/export/{id}?format=pdf` — returns PDF with `Content-Disposition: attachment`
- Validates format param (400 on invalid)
- Returns 404 for non-existent change requests
- Returns 500 on unexpected errors
- Uses `force-dynamic` to prevent caching

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions

- **API route approach** chosen over server actions for download endpoints (clean, cacheable, works with `<a>` direct links)
- **Manual CSV construction** (no library needed given simple format)
- **@react-pdf/renderer** for server-side PDF generation (mature, 19k+ stars)
- **Semicolons** as CSV delimiter (Dutch locale convention)
- **UTF-8 BOM** ensures Excel opens CSV correctly with Dutch locale

## Self-Check: PASSED
