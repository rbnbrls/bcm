---
phase: 03
plan: 02
subsystem: ui-polish
tags: [loading, error-boundaries, skeletons, ux]
requires: [03-01 (skeleton CSS primitives)]
provides: [loading.tsx files, error.tsx boundaries]
affects: [app/*/loading.tsx, app/*/error.tsx]
tech-stack:
  added: []
  patterns: ["server component loading.tsx with skeleton classes", "\"use client\" error.tsx with reset()"]
key-files:
  created:
    - app/loading.tsx
    - app/benchmarks/loading.tsx
    - app/benchmark-aanvraag/loading.tsx
    - app/changes/new/loading.tsx
    - app/changes/[id]/loading.tsx
    - app/admin/client-config/loading.tsx
    - app/error.tsx
    - app/benchmarks/error.tsx
    - app/benchmark-aanvraag/error.tsx
    - app/changes/new/error.tsx
    - app/changes/[id]/error.tsx
    - app/admin/client-config/error.tsx
    - app/updates/error.tsx
  modified: []
decisions:
  - loading.tsx files are server components (no "use client") using global CSS skeleton classes
  - error.tsx files require "use client" per Next.js error boundary requirements
  - Dynamic route [id]/error.tsx navigates to /changes/new instead of retrying
  - Root error.tsx catches unexpected errors from any route not covered by specific error.tsx
  - Console.error(error) in every error.tsx for debugging per UI-SPEC
metrics:
  duration: "~10 min"
  completed_date: "2026-07-25"
status: complete
---

# Phase 3 Plan 02: Loading Skeletons + Error Boundaries Summary

Create loading.tsx skeleton files for all 6 async route groups and error.tsx boundary files for all 7 route groups (root + 6 group routes).

## What Was Built

### Loading Skeleton Files (6 files)
- **app/loading.tsx** (root, catches /): Hero heading + 3 skeleton stat cards
- **app/benchmarks/loading.tsx**: Page intro + toolbar + 6-column x 5-row skeleton table
- **app/benchmark-aanvraag/loading.tsx**: Heading + 3 section skeleton cards (160px each)
- **app/changes/new/loading.tsx**: Heading + 3 section cards (180px) + submit button skeleton
- **app/changes/[id]/loading.tsx**: Request header + 4 overview rows + detail card (200px)
- **app/admin/client-config/loading.tsx**: Page intro + toolbar + 4-column x 5-row skeleton table

Each uses `.skeleton-*` CSS classes from Plan 01 with the shimmer animation and `aria-label="Bezig met laden…"` for screen readers.

### Error Boundary Files (7 files)
- **app/error.tsx** (root): "Er is een fout opgetreden" — catches all unhandled errors
- **app/benchmarks/error.tsx**: "Catalogus laden mislukt"
- **app/benchmark-aanvraag/error.tsx**: "Formulier laden mislukt"
- **app/changes/new/error.tsx**: "Aanvraagformulier laden mislukt"
- **app/changes/[id]/error.tsx**: "Change request laden mislukt" — navigates to /changes/new instead of retrying
- **app/admin/client-config/error.tsx**: "Configuratie laden mislukt"
- **app/updates/error.tsx**: "Wijzigingen laden mislukt"

All error.tsx files:
- Use `"use client"` directive (required by Next.js for error boundaries)
- Import from `"next/link"` for the home link
- Include `role="alert"` for screen reader announcement
- Show "Probeer opnieuw" button (calls `reset()`) + "Naar home" link
- Log `console.error(error)` for debugging
- Match the visual contract exactly: `.page-shell.empty-state` > `.eyebrow` > `h1` > `p` > action buttons

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None encountered.

## Threat Flags

None found — error messages are static Dutch copy with no dynamic data or PII.

## Self-Check: PASSED

- All 6 loading.tsx files exist and use skeleton CSS classes
- All 7 error.tsx files exist with correct Dutch copy per route
- Each loading.tsx has `aria-label="Bezig met laden…"`
- Each error.tsx has `role="alert"`
- [id]/error.tsx navigates to /changes/new instead of retrying (correct for dynamic route)
