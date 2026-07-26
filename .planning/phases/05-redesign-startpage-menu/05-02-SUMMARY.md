---
phase: 05-redesign-startpage-menu
plan: 02
subsystem: ui
tags: [nextjs, navbar, usePathname, active-link, navigation, accessibility]

# Dependency graph
requires:
  - phase: 05-01
    provides: nav-link--active CSS in globals.css, dashboard component infrastructure
provides:
  - NavBar client component with 4 nav items matching new information architecture
  - Active-page highlighting logic (exact match for /, prefix match for others)
  - aria-current="page" on active link for WCAG compliance
  - layout.tsx updated to use NavBar, replacing inline nav
affects: [layout rendering, navigation behavior across all pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Client component with "use client" + usePathname() for active link detection
    - const + as const for typed, frozen nav item configuration

key-files:
  created:
    - components/navbar.tsx
  modified:
    - app/layout.tsx

key-decisions:
  - "NavBar is the only client component in the layout — no 'use client' needed in layout.tsx"
  - "Dashboard link active only on exact / match (not prefix-match) to avoid highlighting on all pages"
  - "Other nav items use pathname.startsWith() for prefix matching (covers /changes, /changes/new, /changes/[id], etc.)"
  - "4 nav items: Dashboard, Wijzigingen, Rapportages, Beheer — removed Nieuwe change, Benchmark catalogus, Wijzigingshistorie from topbar"

patterns-established:
  - "NavBar: reusable client component that encapsulates nav data and active-link logic"

requirements-completed: []

coverage:
  - id: D1
    description: "NavBar client component renders 4 nav items: Dashboard, Wijzigingen, Rapportages, Beheer"
    verification:
      - kind: unit
        ref: "grep -c 'label:' components/navbar.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Active link detection: exact match for '/', prefix match for '/changes', '/reports', '/admin'"
    verification:
      - kind: unit
        ref: "grep -q 'usePathname' components/navbar.tsx && grep -q 'pathname.startsWith' components/navbar.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "aria-current='page' on active link for accessibility"
    verification:
      - kind: unit
        ref: "grep -q 'aria-current' components/navbar.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "nav-link--active class applied to active link for visual styling"
    verification:
      - kind: unit
        ref: "grep -q 'nav-link--active' components/navbar.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "layout.tsx imports NavBar, replaces inline 6-link nav, preserves brand / topbar-right / FeedbackButton"
    verification:
      - kind: integration
        ref: "npm run build"
        status: pass
    human_judgment: false

# Metrics
duration: 1 min 21 sec
completed: 2026-07-26
status: complete
---

# Phase 05 Plan 02: NavBar Component Summary

**NavBar client component with active-page highlighting via usePathname(), replacing inline nav in layout.tsx**

## Performance

- **Duration:** 1 min 21 sec
- **Started:** 2026-07-26T17:40:22Z
- **Completed:** 2026-07-26T17:41:43Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `components/navbar.tsx` — "use client" component with typed NAV_ITEMS array and usePathname() active-state logic
- Dashboard link active only on exact "/" match to prevent highlighting on all pages
- Wijzigingen, Rapportages, Beheer links use prefix-matching (pathname.startsWith)
- aria-current="page" on active link for WCAG accessibility
- nav-link--active class on active link consumed by Plan 1 CSS (accent-deep color + bold weight)
- Updated layout.tsx: imported NavBar, replaced 6-link inline nav with `<NavBar />`, preserved all other elements
- `npm run build` passes with no TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NavBar component and update layout.tsx** — `a1ed0d0` (feat)

**Plan metadata:** _(see final metadata commit below)_

## Files Created/Modified

- `components/navbar.tsx` - "use client" NavBar component with 4 nav items and usePathname() active link detection
- `app/layout.tsx` - Import NavBar, replace inline `<nav>` with `<NavBar />`, preserve all other layout elements

## Decisions Made

- NavBar is the only client component in the layout hierarchy — no "use client" needed in layout.tsx
- Dashboard active only on exact "/" match; all other items use prefix matching for proper route coverage
- Removed 3 nav items (Nieuwe change, Benchmark catalogus, Wijzigingshistorie) from topbar per the new information architecture — these are now accessible via dashboard category cards
- Used `as const` for type-safe readonly nav configuration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- NavBar component complete and build-verified
- Ready for Plan 3 (page.tsx restructuring or further layout refinements)

---

*Phase: 05-redesign-startpage-menu*
*Completed: 2026-07-26*
