---
phase: 01-export-feature
plan: 02
subsystem: export-ui
tags: [ui, component, split-button, export]
requires: [01-01-PLAN]
provides: [export-button-ui]
affects: [components/export-button.tsx, app/changes/[id]/page.tsx, app/globals.css]
tech-stack:
  added: []
  patterns:
    - "use client" component with useState/useRef/useEffect
    - Split button pattern (main action + dropdown)
    - Click-outside detection via mousedown listener
    - Immediate download via hidden <a> element
key-files:
  created:
    - components/export-button.tsx — client component with split button UX
  modified:
    - app/changes/[id]/page.tsx — replaced placeholder with ExportButton
    - app/globals.css — added export-split CSS styles
decisions:
  - Main button defaults to CSV (most common format)
  - Download uses hidden <a> element click (immediate, no page navigation)
  - Loading state reset after 1.5s timeout (long enough for download to start)
  - CSS classes follow BEM-like naming: export-split__main, export-split__dropdown
  - Click-outside handled via mousedown on document
metrics:
  duration: null
completed_date: 2026-07-25
status: complete
---

# Phase 01 Plan 02: Split Button UI Component

Create the split-button client component that lets users download change request details as CSV or PDF, and wire it into the change request detail page.

## What Was Built

### 1. ExportButton Component (`components/export-button.tsx`)
- `"use client"` component accepting `changeRequestId` prop
- Split button layout: main button (CSV) + arrow button for dropdown
- Downloading state disables both buttons and shows "Exporteren…"
- Dropdown with "CSV downloaden" and "PDF downloaden" options
- Click-outside detection closes the dropdown
- Download via hidden `<a>` element for immediate trigger
- Uses `useCallback` for stable function references

### 2. CSS Styles (`app/globals.css`)
- `.export-split` — inline-flex container with position relative
- `.export-split__main` — primary action button with accent color
- `.export-split__arrow` — smaller chevron button with left border separator
- `.export-split__dropdown` — absolute positioned dropdown with shadow, z-index 20
- All styles follow the existing design system (--accent, --line, --panel, etc.)

### 3. Page Wiring (`app/changes/[id]/page.tsx`)
- Imported `ExportButton` from `@/components/export-button`
- Replaced `<button>Exporteer request (binnenkort)</button>` with `<ExportButton changeRequestId={id} />`
- All other code unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
