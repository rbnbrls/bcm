# Phase 3: UI Polish & Final Touches — Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the BCM application UI: improve accessibility, add responsive layout, loading states, error boundaries, and fix console errors.

</domain>

<decisions>
## Implementation Decisions

### Polish Priorities
- Use **manual ARIA + semantic HTML** (matches existing CSS-only approach)
- Primary mobile breakpoint: **768px**, stacked layouts below
- Loading states via **React Suspense with fallback skeletons**
- Error boundaries: **Page-level `error.tsx`** per route group

### Scope & Fixes
- Audit tool: **axe-core via `@axe-core/playwright`** (already have Playwright)
- Run one-time **Playwright a11y scan** for contrast issues
- Add **visible `:focus-visible` outlines** on all interactive elements
- **Fix all console errors and warnings** in production build

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `globals.css` (~800 lines) — all styling in one file, BEM-like conventions
- `components/` — individual client components with CSS classes
- `app/layout.tsx` — root layout with navigation

### Established Patterns
- Plain CSS (no framework), Dutch locale throughout
- `button`, `input`, `select`, `textarea` base styles in globals.css
- Responsive via media queries in globals.css

### Integration Points
- Each `app/*/page.tsx` needs an `error.tsx` sibling
- `app/layout.tsx` for loading.tsx
- `components/` for focus styles and ARIA attributes

</code_context>

<specifics>
## Specific Ideas

- Add `aria-label`, `aria-describedby` to form controls
- Wrap async sections in `<Suspense>` with skeleton placeholders
- Test with Playwright + @axe-core/playwright to measure a11y compliance

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
