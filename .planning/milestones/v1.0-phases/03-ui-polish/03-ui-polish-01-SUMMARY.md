---
phase: 03
plan: 01
subsystem: ui-polish
tags: [accessibility, aria, focus-visible, contrast, a11y]
requires: []
provides: [focus-visible-outlines, skeleton-css-primitives, aria-attributes, contrast-remediation]
affects: [app/globals.css, app/layout.tsx, app/page.tsx, app/not-found.tsx, app/changes/[id]/page.tsx, app/updates/page.tsx, components/*, app/benchmarks/*, app/admin/client-config/*]
tech-stack:
  added: []
  patterns: [":focus-visible for keyboard navigation", "skeleton shimmer animations", "aria-describedby for form field descriptions"]
key-files:
  created: []
  modified:
    - app/globals.css
    - app/layout.tsx
    - app/page.tsx
    - app/not-found.tsx
    - app/changes/[id]/page.tsx
    - app/updates/page.tsx
    - components/feedback-button.tsx
    - components/export-button.tsx
    - components/benchmark-change-form.tsx
    - components/benchmark-new-form.tsx
    - app/benchmarks/benchmark-catalog-table.tsx
    - app/admin/client-config/client-config-table.tsx
    - components/updates-timeline.tsx
decisions:
  - Use `--accent-deep` for body-size text on white backgrounds to meet WCAG AA contrast
  - Keep existing outline:none on :focus but add :focus-visible counterpart for keyboard users
  - ExportButton replaces alert() with inline .form-errors div for graceful error display
metrics:
  duration: "~15 min"
  completed_date: "2026-07-25"
status: complete
---

# Phase 3 Plan 01: ARIA + Focus-Visible + Accent Contrast Summary

Add visible focus-visible outlines to all interactive elements, skeleton CSS primitives, and comprehensive ARIA attributes to meet WCAG 2.1 AA keyboard navigation and focus visible criteria.

## What Was Built

### Focus-Visible Outlines (globals.css)
- Global `:focus-visible` rule with `2px solid var(--accent)` outline for all interactive elements
- Button-specific `:focus-visible` overrides using `--accent-deep` for higher contrast
- Preserved existing `outline: none` on `:focus` for mouse users — `:focus-visible` only activates for keyboard navigation

### Skeleton CSS Primitives (globals.css)
- `@keyframes shimmer` — gradient animation for loading placeholders
- `.skeleton` — base shimmer class with `--panel` base gradient
- `.skeleton-text` — 14px height text placeholder
- `.skeleton-heading` — 24px height heading placeholder
- `.skeleton-card` — 120px height card placeholder

### ARIA Attributes (All Interactive Components)
- **layout.tsx**: Enhanced updates link aria-label, added role="status" to user-chip
- **page.tsx**: Added role="region" + aria-label to hero, workflow cards, stat cards
- **not-found.tsx**: Added role="alert" for screen reader announcement
- **changes/[id]/page.tsx**: Added role="status" + aria-live to status-pill, aria-label to sections
- **updates/page.tsx**: Added role="region" + aria-label
- **feedback-button.tsx**: Added aria-modal="true", aria-haspopup="dialog", SVG aria-labels
- **export-button.tsx**: Added aria-expanded, aria-haspopup="menu", role="menu"/"menuitem", **replaced alert() with inline form-errors**
- **benchmark-change-form.tsx**: Added aria-label to checkboxes, selects, section-numbers, aria-live to form-errors
- **benchmark-new-form.tsx**: Added aria-label to all inputs/selects/textareas, aria-hidden on step numbers, aria-live to form-errors
- **benchmark-catalog-table.tsx**: Added aria-label to search, aria-sort on sort headers, table caption
- **client-config-table.tsx**: Added aria-expanded to filter toggle, aria-sort on sort headers, table caption, aria-label to column filters
- **updates-timeline.tsx**: Added aria-label to spinner SVG, role="status" to pill-spinner, table caption, aria-label to retry button

### Accent Contrast Remediation
- Changed `.button-ghost` color from `--accent` to `--accent-deep` (4.5:1 ratio on white)
- Changed `.feedback-success p:first-child` color from `--accent` to `--accent-deep`
- Changed `.feedback-success a` color from `--accent` to `--accent-deep`
- Kept `--accent` for large/display text and backgrounds

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None encountered.

## Threat Flags

None found — all ARIA attributes are static Dutch-language labels with no dynamic content leakage.

## Self-Check: PASSED

- All 13 files modified exist and contain expected ARIA/contrast changes
- ExportButton no longer uses alert() — uses inline form-errors div
- All :focus-visible rules present in globals.css
- All skeleton CSS classes present
