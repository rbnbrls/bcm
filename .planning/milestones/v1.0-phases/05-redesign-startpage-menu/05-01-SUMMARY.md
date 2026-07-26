---
phase: 05-redesign-startpage-menu
plan: 01
subsystem: ui
tags: [dashboard, nextjs, server-components, svg-icons, css-grid]

# Dependency graph
requires: []
provides:
  - Dashboard category card component with ::after click overlay
  - Static category data constant with 5 journey categories and action links
  - 5 SVG icon components (ClientIcon, BenchmarkIcon, MonitorIcon, ReportIcon, SettingsIcon)
  - Dashboard page.tsx rewrite (sync Server Component)
  - Dashboard CSS classes with responsive 768px breakpoint
  - Nav active link CSS styles for Plan 2 consumption
affects:
  - 05-02 (navbar component, nav restructuring)
  - 05-03 (remaining test files update)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dashboard category cards as pure Server Components (no "use client")
    - Full-card click via CSS ::after pseudo-element overlay on primary action link
    - SVG icon components exported from dedicated utility file
    - BEM-like CSS naming convention for dashboard classes

key-files:
  created:
    - lib/dashboard-icons.tsx
    - lib/dashboard-categories.tsx
    - components/dashboard/category-card.tsx
    - components/dashboard/category-section.tsx
    - components/dashboard/dashboard-grid.tsx
  modified:
    - app/globals.css
    - app/page.tsx

key-decisions:
  - "Dashboard components are pure Server Components — no use client directive needed"
  - "Full-card click-to-primary uses CSS ::after overlay, avoiding both invalid nested anchors and JS-based navigation"
  - "CATEGORIES is a compile-time constant — no data fetching required on homepage"
  - "Homepage simplified: removed all data fetching, stat cards, ChangeTypeCatalog, recent changes, and about section"

patterns-established:
  - "Dashboard category cards follow existing card pattern (background #fbfcfa, border-radius 12px, hover accent border)"
  - "SVG icons extracted to dedicated lib/dashboard-icons.tsx with named exports"
  - "CSS grid uses repeat(auto-fill, minmax(280px, 1fr)) with 768px single-column collapse"
  - "Active nav link classes (.nav-link--active, [aria-current='page']) defined for Plan 2 navbar"

requirements-completed: []

coverage:
  - id: D1
    description: "Dashboard component stack — CategoryCard, CategorySection, DashboardGrid as Server Components"
    verification:
      - kind: other
        ref: "grep -c '\"use client\"' components/dashboard/ = 0"
        status: pass
      - kind: other
        ref: "tsc --noEmit (no dashboard errors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CATEGORIES constant with 5 categories, action links matching UI-SPEC category-to-page mapping"
    verification:
      - kind: other
        ref: "grep -c 'id:' lib/dashboard-categories.tsx = 6 (5 categories + 1 type)"
        status: pass
      - kind: other
        ref: "grep 'Benchmark wijzigingen' lib/dashboard-categories.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "5 SVG icon components (ClientIcon, BenchmarkIcon, MonitorIcon, ReportIcon, SettingsIcon) in lib/dashboard-icons.tsx"
    verification:
      - kind: other
        ref: "grep -c 'export function' lib/dashboard-icons.tsx = 5"
        status: pass
    human_judgment: false
  - id: D4
    description: "Homepage page.tsx rewrite as sync Server Component with simplified hero + DashboardGrid"
    verification:
      - kind: other
        ref: "grep -q 'export default.*async' app/page.tsx → false"
        status: pass
      - kind: other
        ref: "grep -q 'DashboardGrid' app/page.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dashboard CSS with responsive 768px breakpoint, ::after overlay, nav active styles"
    verification:
      - kind: other
        ref: "grep -q 'primary-link::after' app/globals.css"
        status: pass
      - kind: other
        ref: "grep -q 'nav-link--active' app/globals.css"
        status: pass
    human_judgment: false

# Metrics
duration: 37 min
completed: 2026-07-26
status: complete
---

# Phase 5 Plan 1: Dashboard Homepage Summary

**Category card components, static category data with 5 customer journey categories, SVG icons, dashboard CSS, and simplified page.tsx rewrite — all Server Components, no data fetching**

## Performance

- **Duration:** 37 min
- **Started:** 2026-07-26T17:21:05Z (first commit timestamp)
- **Completed:** 2026-07-26T17:38:31Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 7

## Accomplishments

- Dashboard component stack: CategoryCard, CategorySection, DashboardGrid — all pure Server Components
- 5 SVG icon components in lib/dashboard-icons.tsx (ClientIcon, BenchmarkIcon, MonitorIcon, ReportIcon, SettingsIcon)
- Static CATEGORIES constant with 5 customer journey categories and 17 action links matching UI-SPEC mapping
- ::after pseudo-element overlay for full-card click-to-primary navigation (no JavaScript)
- page.tsx rewritten as synchronous Server Component with simplified hero and DashboardGrid
- Dashboard CSS classes with BEM naming, responsive 768px single-column collapse, hover/focus states
- Nav active link styles (.nav-link--active, [aria-current="page"]) for Plan 2 navbar consumption
- All old data fetching, stat cards, ChangeTypeCatalog, recent changes, and about section removed

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Create dashboard component infrastructure** — `1d638c3` (feat)
2. **Task 2 (auto): Complete category data, icons, and wire DashboardGrid into page.tsx** — `819d4d7` (feat)

**Plan metadata:** (committed with SUMMARY below)

## Files Created/Modified

- `lib/dashboard-icons.tsx` — 5 SVG icon components as named function exports
- `lib/dashboard-categories.tsx` — Typed DashboardCategory/DashboardAction + CATEGORIES constant with all 5 categories
- `components/dashboard/category-card.tsx` — Card with icon, title, subtitle, action links, ::after click overlay
- `components/dashboard/category-section.tsx` — Section wrapper with eyebrow + h2 + card grid
- `components/dashboard/dashboard-grid.tsx` — Top-level container mapping CATEGORIES to sections
- `app/globals.css` — ~130 lines of dashboard CSS + nav active styles + responsive 768px breakpoint
- `app/page.tsx` — Rewritten as sync Server Component with simplified hero + DashboardGrid

## Decisions Made

- **Server Components over Client Components:** All dashboard components are pure Server Components — no `"use client"` directive needed since data is compile-time constant and card click behavior is pure CSS (::after overlay)
- **CSS ::after overlay for card clicks:** The primary action link uses a CSS `::after` pseudo-element with `position: absolute; inset: 0` to make the entire card clickable. This avoids both invalid nested `<a>` elements and JavaScript-based navigation
- **Renamed .ts → .tsx:** `lib/dashboard-categories.ts` needed `.tsx` extension because the CATEGORIES constant uses JSX (`<ClientIcon />`)
- **Simplified homepage:** Removed all data fetching (Promise.all with getClientConfigs, getAllChangeRequests, getChangeTypes), stat cards, ChangeTypeCatalog, recent changes section, and about section — homepage is now a pure static render

## Deviations from Plan

None — plan executed exactly as written.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed lib/dashboard-categories.ts → lib/dashboard-categories.tsx**
- **Found during:** Task 1 (verification — tsc compilation)
- **Issue:** File used `.ts` extension but contains JSX (`<ClientIcon />`), causing TS1005 parse error
- **Fix:** Renamed file to `.tsx` extension
- **Files modified:** lib/dashboard-categories.ts → lib/dashboard-categories.tsx (all imports use `@/lib/dashboard-categories` so no import updates needed)
- **Verification:** `tsc --noEmit` now passes with zero dashboard errors; pre-existing test errors unchanged
- **Committed in:** `1d638c3` (amended)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for TypeScript compilation. No scope creep.

## Issues Encountered

None — all work completed as planned.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Dashboard component infrastructure is complete and ready for Plan 2 (NavBar component)
- Nav active link CSS classes are defined in globals.css for Plan 2 consumption
- 768px responsive breakpoint is in place
- Plan 2 can now build the NavBar component and wire it into layout.tsx

---

*Phase: 05-redesign-startpage-menu*
*Completed: 2026-07-26*
