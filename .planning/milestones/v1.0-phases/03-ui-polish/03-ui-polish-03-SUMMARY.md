---
phase: 03
plan: 03
subsystem: ui-polish
tags: [responsive, a11y-audit, build-fixes, print-styles, hover-states]
requires: [03-01, 03-02]
provides: [responsive-layout, a11y-spec, print-styles, build-passing]
affects: [app/globals.css, tests/e2e/a11y.spec.ts, app/api/export/[id]/route.ts, lib/export-pdf.tsx]
tech-stack:
  added: ["@axe-core/playwright (dev)"]
  patterns: ["responsive breakpoints at 768px/600px", "@media print for print layout", "form validation border-color: var(--danger)"]
key-files:
  created:
    - tests/e2e/a11y.spec.ts
  modified:
    - app/globals.css
    - app/api/export/[id]/route.ts
    - lib/export-pdf.tsx
    - package.json
    - package-lock.json
decisions:
  - Use existing @playwright/test setup for a11y scanning (no new config needed)
  - @axe-core/playwright is [ASSUMED] — Deque Labs maintained, industry standard
  - Buffer type incompatibility in @react-pdf/renderer fixed by converting NodeJS.ReadableStream to Uint8Array
  - Touch targets at 44px minimum for interactive elements on mobile (WCAG 2.5.8)
  - Form validation uses native browser behavior with added red border styling
  - @media print hides navigation and floating elements while showing content full-width
metrics:
  duration: "~20 min"
  completed_date: "2026-07-25"
status: complete
---

# Phase 3 Plan 03: Responsive Layout, Visual Polish, a11y Audit, Console Fixes Summary

Add responsive layout at 768px breakpoint, visual polish items (hover states, form validation, print styles), a11y audit via Playwright/axe-core, and fix all production build errors.

## What Was Built

### Responsive CSS (globals.css)

**768px breakpoint** (`@media (max-width: 768px)`):
- Topbar wraps (flex-wrap), height auto, compact padding
- Navigation gap reduced to 14px, font-size 13px
- All multi-column grids → single column (`.field-row`, `.new-benchmark-grid`, `.cost-grid`, `.estimate-grid`, `.status-grid`, `.stakeholder-grid`, `.handoff-grid`, `.workflow-card`)
- `.nb-detail-grid` → 2-column (stays readable)
- `h1` headings → `clamp(32px, 8vw, 42px)` for readability
- `.bottom-actions` → stacked
- Touch targets: `.feedback-close` 44x44px, `.sort-header`/`.config-filter-toggle` min-height 44px

**600px breakpoint** (`@media (max-width: 600px)`):
- Navigation gap 10px, font-size 12px
- Brand font-size 16px
- Avatar 26px
- Compact table padding

**Print styles** (`@media print`):
- Hide `.topbar`, `.feedback-trigger`, `.bottom-actions`
- Full-width content (`max-width: 100%; padding: 0`)

### Visual Polish (globals.css)

- **Navigation**: Added `transition: color .15s` to `.topbar nav a`
- **Catalog list**: Added hover state with `--panel` background, padding, border-radius
- **Diff blocks**: Added hover state with `--panel` background, border-radius
- **Form validation**: Red border on `input:invalid`, `select:invalid`, `textarea:invalid` with subtle red focus ring

### Build Error Fixes

Fixed two TypeScript errors caused by `Buffer` type incompatibility in Next.js 16:
1. **lib/export-pdf.tsx**: `@react-pdf/renderer` v4's `toBuffer()` returns `Promise<NodeJS.ReadableStream>`, not `Buffer`. Changed to collect stream chunks into a `Uint8Array` using `Buffer.concat()`.
2. **app/api/export/[id]/route.ts**: Converted `Buffer` to `Uint8Array` before passing to `NextResponse` (body must be `BodyInit`).

Production build now completes with zero errors and zero warnings.

### a11y Audit Spec

Created `tests/e2e/a11y.spec.ts` covering 6 routes:
- `/` (Home), `/changes/new` (New benchmark change), `/benchmarks` (Benchmark catalog)
- `/benchmark-aanvraag` (New benchmark request), `/admin/client-config` (Client config), `/updates` (Updates)

Each test navigates to the page, waits for network idle, then runs `@axe-core/playwright` scan asserting zero critical or serious violations.

## Deviations from Plan

### [Rule 1 - Bug] Fixed Buffer type incompatibility in export PDF route
- **Found during:** Task 3 (npm run build)
- **Issue:** Next.js 16 TypeScript check failed because `@react-pdf/renderer` v4's `toBuffer()` returns `Promise<NodeJS.ReadableStream>` (not `Buffer`), and `Buffer` is not assignable to `NextResponse`'s `BodyInit` type
- **Fix:** Changed `buildPdfBuffer()` to consume the ReadableStream and return `Uint8Array`; updated route to pass `new Uint8Array(buffer)` to `NextResponse`
- **Files modified:** `lib/export-pdf.tsx`, `app/api/export/[id]/route.ts`
- **Commit:** 0b79b1d

### [Note] Removed duplicate `.button` rule
- The `.button` class already had `display: inline-flex`, `align-items: center`, and `gap: 12px`. The plan suggested adding these but they were already present. Removed the duplicate rule to avoid redundancy.

## Auth Gates

None encountered.

## Threat Flags

None found — @axe-core/playwright is a dev dependency with dev-only imports, not included in production bundle.

## Self-Check: PASSED

- `npm run build` succeeds with zero errors and zero warnings ✅
- All responsive media queries present (768px, 600px, print) ✅
- Touch targets expanded for mobile interactive elements ✅
- Hover states added to catalog list items and diff blocks ✅
- Form validation red borders added ✅
- a11y.spec.ts created covering all 6 routes ✅
- @axe-core/playwright installed as dev dependency ✅
