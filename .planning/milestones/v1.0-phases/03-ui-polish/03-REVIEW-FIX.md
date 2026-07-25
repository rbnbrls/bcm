---
phase: 03-ui-polish
fixed_at: "2026-07-25T18:30:00Z"
review_path: .planning/phases/03-ui-polish/03-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-07-25T18:30:00Z
**Source review:** .planning/phases/03-ui-polish/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### WR-01: `Math.random()` in server-component loading skeletons causes React hydration mismatch

**Files modified:** `app/benchmarks/loading.tsx`, `app/admin/client-config/loading.tsx`
**Commit:** `36dc3e4`
**Applied fix:** Replaced `Math.random()` with deterministic width arrays indexed by column position. `benchmarks/loading.tsx` uses a 6-column width array (`55%`, `70%`, `60%`, `80%`, `65%`, `75%`) and `client-config/loading.tsx` uses a 4-column width array (`50%`, `70%`, `60%`, `85%`). This ensures server and client renders produce identical skeleton layouts, eliminating React hydration mismatches.

### WR-02: `<li>` elements rendered without `<ul>` parent — invalid HTML

**File modified:** `components/benchmark-new-form.tsx`
**Commit:** `81b17d0`
**Applied fix:** Wrapped the `<li>` elements in a `<ul>` inside the form errors section. The sibling component (`benchmark-change-form.tsx`) already had proper `<ul>` wrapping — this brings `benchmark-new-form.tsx` into parity, fixing invalid HTML and the accessibility tree for screen readers.

### WR-03: Timezone-dependent date comparison can reject valid dates

**Files modified:** `app/benchmark-aanvraag/actions.ts`, `app/changes/new/actions.ts`
**Commit:** `3902ab2`
**Applied fix:** Replaced `new Date().toISOString().slice(0, 10)` (UTC-based) with `new Date().toLocaleDateString("en-CA")` (locale-aware) for date comparison. The `en-CA` locale produces `YYYY-MM-DD` format in the user's local timezone, matching how `<input type="date">` values are interpreted. This prevents edge cases where past dates near midnight UTC could be incorrectly accepted or rejected.

### WR-04: Duplicate fetch logic in UpdatesPage

**File modified:** `app/updates/page.tsx`
**Commit:** `f35e538`
**Applied fix:** Consolidated duplicate fetch logic by:
- Adding a `useRef(false)` cancellation ref (`cancelledRef`)
- Modifying `fetchCommits` to check `cancelledRef.current` before setting state
- Replacing the `useEffect`'s duplicate `load()` function with a simple `fetchCommits()` call
- Setting `cancelledRef.current = true` on cleanup
This eliminates ~30 lines of dead duplicate code and ensures any future fetch logic changes only need to be made in one place.

### WR-05: `:invalid` pseudo-class shows error styling on untouched form fields

**File modified:** `app/globals.css`
**Commit:** `644bea5`
**Applied fix:** Added `:not(:focus):not(:placeholder-shown)` to the `:invalid` CSS selectors. This suppresses red borders on empty required form fields until the user has interacted with them (via focus) or entered text (via placeholder-shown). The `:focus` variant retains its box-shadow for active input feedback. Fixes the "everything is wrong before I've done anything" UX pattern.

### WR-06: `formatTimeAgo` handles future dates incorrectly — shows "zojuist"

**File modified:** `components/updates-timeline.tsx`
**Commit:** `3423f60`
**Applied fix:** Added an early return for future dates (`diffMs < 0`) that formats the date using `toLocaleDateString("nl-NL")` with day, short month, and year components. This ensures future dates (from clock skew, API errors, or misformatted date strings) display the absolute date instead of the misleading "zojuist" label.

---

_Fixed: 2026-07-25T18:30:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
