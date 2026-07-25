---
phase: 3
slug: ui-polish
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-25
---

# Phase 3 — UI Design Contract

> Visual and interaction contract for UI polish, accessibility, responsive layout, loading states, error boundaries, and console error fixes. No new UI components introduced — refines existing surfaces only.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (plain CSS) |
| Preset | not applicable |
| Component library | none (hand-authored BEM-like classes in `globals.css`) |
| Icon library | none (inline SVGs in TSX) |
| Font | Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif |

---

## Design Principles

### 1. Accessibility-First Refinement
- All interactive elements must have visible `:focus-visible` outlines — never `outline: none` without a visible alternative.
- All form controls need `aria-label` or `aria-describedby` where visible label text is insufficient.
- Color contrast ratios must meet WCAG 2.1 AA minimum (4.5:1 for normal text, 3:1 for large text).
- Semantic HTML structure preserved and strengthened (headings in order, landmark elements, proper form associations).

### 2. Progressive Enhancement on Mobile
- Primary breakpoint: **768px** — stacked layouts below, multi-column above.
- Existing 600px feedback button breakpoint remains.
- Touch targets minimum 44×44px on mobile (WCAG 2.5.8).
- Horizontal overflow handled via `overflow-x: auto` on data tables (already partial).

### 3. Defensive UI States
- Every async data-fetching surface gets loading (Suspense skeleton) and error (error.tsx) states.
- Server-rendered pages get `error.tsx` siblings per route group.
- Client-side fetch surfaces (updates page) continue using existing inline loading/error patterns.
- Console errors cleaned to zero in production build.

### 4. Existing Pattern Consistency
- Reuse existing CSS custom properties — never introduce new colors, font sizes, or spacing tokens.
- BEM-like class naming convention preserved.

---

## Component Audit

### Existing Components and Surfaces

| # | Component / Surface | Type | Loading State | Error State | Empty State | Focus Visible | Responsive | ARIA |
|---|---------------------|------|---------------|-------------|-------------|---------------|------------|------|
| C1 | FeedbackButton | Client (`"use client"`) | ✅ disabled state during submit | ✅ `form-errors` alert | N/A | ❌ missing | ✅ @600px | ✅ aria-label on trigger, role=dialog |
| C2 | ExportButton | Client | ✅ disabled + "Exporteren…" | ⚠ `alert()` — needs upgrade | N/A | ❌ missing | ❌ split button not tested | ✅ aria-label on arrow |
| C3 | BenchmarkChangeForm | Client | ✅ pending state on submit | ✅ `form-errors` alert | N/A (form) | ❌ missing | ❌ not tested | ❌ missing field-level aria |
| C4 | BenchmarkNewForm | Client | ✅ pending state on submit | ✅ `form-errors` alert | N/A (form) | ❌ missing | ❌ not tested | ❌ missing field-level aria |
| C5 | UpdatesTimeline | Client | ✅ spinner + "Wijzigingen laden…" | ✅ retry button + error box | ✅ "Er zijn nog geen wijzigingen" | ❌ missing | ⚠ table scroll | ✅ role=status |
| C6 | Topbar navigation | Server | N/A (static) | N/A | N/A | ❌ missing | ❌ not tested (nav may wrap) | ✅ aria-label="Hoofdnavigatie" |
| C7 | BenchmarkCatalogTable | Client | ❌ missing (no loading state) | ❌ missing (no error state) | ✅ "Geen benchmarks gevonden" | ❌ missing | ⚠ table scroll | ❌ missing |
| C8 | ClientConfigTable | Client | ❌ missing (no loading state) | ❌ missing (no error state) | ✅ "Geen resultaten gevonden" | ❌ missing | ⚠ table scroll | ❌ missing |
| C9 | ChangeRequestDetail (C [id]) | Server | ❌ missing (no loading.tsx) | ❌ missing (no error.tsx) | ✅ 404 via notFound() | N/A (server) | ⚠ page shell responsive | ❌ missing |
| C10 | HomePage | Server | ❌ missing (db fetch may be slow) | ❌ missing (no error.tsx) | ❌ no empty state for 0 clients | N/A (server) | ⚠ page shell responsive | ✅ aria-label="Overzicht" |
| C11 | NewBenchmarkPage | Server | ❌ missing (no loading.tsx) | ❌ missing (no error.tsx) | N/A (form) | N/A (server) | ⚠ page shell responsive | ❌ missing |
| C12 | BenchmarkCatalogPage | Server | ❌ missing (no loading.tsx) | ❌ missing (no error.tsx) | ❌ no empty catalog state | N/A (server) | ⚠ page shell responsive | ❌ missing |
| C13 | ClientConfigPage | Server | ❌ missing (no loading.tsx) | ❌ missing (no error.tsx) | ❌ no empty config state | N/A (server) | ⚠ page shell responsive | ❌ missing |
| C14 | UpdatesPage | Client | ✅ inline loading | ✅ inline error | ✅ deferred to UpdatesTimeline | ❌ missing | ❌ not tested | ❌ missing |

### Priority Matrix

| Priority | Component | Issue | Impact |
|----------|-----------|-------|--------|
| P0 | All interactive elements | Missing `:focus-visible` | Keyboard users blocked |
| P0 | Route groups | Missing `error.tsx` | Unhandled errors crash page |
| P0 | Route groups | Missing `loading.tsx` | Blank screen during data fetch |
| P1 | ExportButton | Uses `alert()` for errors | Poor UX, no graceful error |
| P1 | UpdatesTimeline | Deploying spinner has no `role` | Screen reader silent |
| P1 | All forms | Missing `aria-describedby` on fields | Screen reader misses hints |
| P1 | Topbar | May wrap awkwardly below 768px | Navigation broken on mobile |
| P1 | All data tables | No responsive overflow at 768px | Horizontal scroll may not trigger |
| P2 | BenchmarkCatalogTable | Search input lacks `aria-label` | Screen reader ambiguous |
| P2 | ClientConfigTable | Filter toggle lacks `aria-expanded` | Screen reader misses state |
| P2 | ChangeRequestDetail | Status pill is plain `<span>` | Not announced as status |
| P2 | `globals.css` | Hardcoded colors outside variables | Theme inconsistency risk |

---

## Accessibility Improvements

### Focus Visible Outlines

Add to `globals.css`:

```css
/* Global base — all interactive elements */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Override for specific components where outline may clip */
.button:focus-visible,
.button-primary:focus-visible,
.button-secondary:focus-visible,
.button-ghost:focus-visible {
  outline: 2px solid var(--accent-deep);
  outline-offset: 2px;
}

/* Remove existing `outline: none` on focus — replace with focus-visible pattern */
```

### ARIA Additions Required

| Element | Current | Required |
|---------|---------|----------|
| `.catalog-search` input | `placeholder` only | Add `aria-label="Zoeken in benchmark catalogus"` |
| `.sort-header` buttons | No ARIA | Add `aria-sort` on active column header |
| `.config-filter-toggle` | No ARIA | Add `aria-expanded` matching `showFilters` state |
| Form inputs (all) | No field descriptions | Add `aria-describedby` pointing to hint elements |
| `.status-pill` | Plain `<span>` | Add `role="status"` and `aria-live="polite"` |
| `nav` in topbar | `aria-label="Hoofdnavigatie"` ✅ | Keep existing |
| `.feedback-modal` | `role="dialog"` ✅ | Add `aria-modal="true"` |
| `.export-split__dropdown` | No ARIA | Add `role="menu"` with `aria-orientation="vertical"` |
| `.export-split__dropdown button` | Plain buttons | Add `role="menuitem"` |
| Price/cost values | Plain text | Add `aria-label` with full text for screen readers |
| `.timeline-spinner` | No label | Add `aria-label="Bezig met laden…"` (inside SVG) |

### Semantic HTML Improvements

| Element | Current | Required |
|---------|---------|----------|
| `section` wrappers | Some missing landmarks | Add `aria-label` on every `<section>` that lacks a heading sibling |
| `table` captions | None | Add `<caption>` for assistive tech context |
| Error lists | `<ul>` inside `.form-errors` ✅ | Keep, but add `aria-live="polite"` to parent |

### Color Contrast Audit

Existing variables to verify via axe-core scan:

| Token | Value | Typical Use | WCAG AA Concern |
|-------|-------|-------------|-----------------|
| `--muted` | `#5d6864` | Secondary text on `--panel` (#f6f8f5) | 4.5:1 ✅ (passes at 15px) |
| `--muted` | `#5d6864` | Secondary text on white (#fff) | 4.5:1 ✅ |
| `--accent` | `#0f6d55` | Accent text on `--panel` (#f6f8f5) | 3.8:1 ⚠ (large text only) |
| `--accent` | `#0f6d55` | Accent text on white (#fff) | 3.5:1 ⚠ (large text only) |
| `--danger` | `#a44032` | Error text on `--danger-bg` (#fff0ed) | 4.7:1 ✅ |
| `--danger` | `#a44032` | Error text on white (#fff) | 3.8:1 ⚠ (large text only) |

Remediation: Use `--accent-deep` (#0a513f) for text-on-white where `--accent` is used for body-size text. The `--accent` token stays for large/display text and backgrounds.

---

## Responsive Breakpoints

### Breakpoint Contract

| Breakpoint | Purpose | Layout Change |
|------------|---------|---------------|
| ≥ 1180px | Page shell max-width | Centered container with side padding |
| 769px – 1179px | Tablet / small desktop | Multi-column grids collapse to 2-col |
| ≤ 768px | Mobile (primary breakpoint) | **Full stack**: all multi-column → single column |
| ≤ 600px | Small mobile | Compact padding, smaller buttons, touch-friendly targets |

### Specific Responsive Rules to Add in `globals.css`

**768px breakpoint:**

```css
@media (max-width: 768px) {
  .topbar {
    flex-wrap: wrap;
    gap: 12px;
    height: auto;
    padding: 12px 16px;
  }
  .topbar nav {
    gap: 14px;
    font-size: 13px;
    flex-wrap: wrap;
  }
  .page-shell {
    padding: 32px 16px 64px;
  }
  .home-shell {
    padding-top: 48px;
  }
  .field-row {
    flex-direction: column;
  }
  .new-benchmark-grid {
    grid-template-columns: 1fr;
  }
  .cost-grid {
    grid-template-columns: 1fr;
  }
  .estimate-grid {
    grid-template-columns: 1fr;
  }
  .nb-detail-grid {
    grid-template-columns: 1fr 1fr;
  }
  .stakeholder-grid {
    flex-direction: column;
    gap: 12px;
  }
  .handoff-grid {
    flex-direction: column;
  }
  .hero h1,
  .page-intro h1,
  .request-header h1,
  .empty-state h1 {
    font-size: clamp(32px, 8vw, 42px);
  }
  .workflow-card {
    flex-direction: column;
  }
  .bottom-actions {
    flex-direction: column;
    gap: 12px;
  }
  .hero-copy {
    max-width: 100%;
  }
  .status-grid {
    grid-template-columns: 1fr;
  }
}

/* Small mobile overrides (keep existing 600px rule) */
@media (max-width: 600px) {
  .topbar nav {
    gap: 10px;
    font-size: 12px;
  }
  .brand {
    font-size: 16px;
  }
  .user-chip .avatar {
    width: 26px;
    height: 26px;
  }
  .updates-table th,
  .updates-table td {
    padding: 8px 10px;
    font-size: 12px;
  }
  .config-table th,
  .config-table td {
    padding: 6px 10px;
  }
}
```

**600px breakpoint**: Existing `.feedback-trigger` and `.feedback-modal` rules at 600px are **kept as-is**.

---

## Loading States

### Route-Level `loading.tsx`

Create `loading.tsx` in each route group:

| Route | Loading Content | Pattern |
|-------|----------------|---------|
| `/changes/new` | Skeleton form: 4 section placeholders with shimmer | Server component with CSS skeleton |
| `/changes/[id]` | Skeleton detail: header + 2 section cards | Server component with CSS skeleton |
| `/benchmarks` | Skeleton table: 6 column headers + 5 row placeholders | Server component with CSS skeleton |
| `/benchmark-aanvraag` | Skeleton form: 3 section placeholders | Server component with CSS skeleton |
| `/admin/client-config` | Skeleton table: 4 column headers + 5 row placeholders | Server component with CSS skeleton |
| `/updates` | Already client-side loading ✅ — keep existing spinner | Already covered |

### Skeleton CSS Primitives

Add to `globals.css`:

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, var(--panel) 25%, #e8ede9 37%, var(--panel) 63%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}

.skeleton-text {
  height: 14px;
  margin-bottom: 8px;
  width: 100%;
}

.skeleton-heading {
  height: 24px;
  margin-bottom: 16px;
  width: 60%;
}

.skeleton-card {
  height: 120px;
  border-radius: 12px;
  margin-bottom: 16px;
}
```

### Content Suspense Boundaries

Wrap async data-fetching sections in `<Suspense>` with skeleton fallbacks. Specific boundaries:

| Surface | Async Fetch | Suspense Boundary Location |
|---------|-------------|---------------------------|
| HomePage | `getClientConfigs()` | Wrap `section.status-grid` + `section.workflow-card` |
| BenchmarkCatalogPage | `getBenchmarks()` | Wrap `<BenchmarkCatalogTable>` + `.cost-summary` |
| ClientConfigPage | `getClientConfigs()` + `getBenchmarks()` | Wrap `<ClientConfigTable>` + `.catalog-section` |
| ChangeRequestDetail | `getChangeRequest(id)` | Wrap `.request-overview` + `.diff-section` / `.nb-detail` |

---

## Error States

### Route-Level `error.tsx` (Server Components)

Create `error.tsx` in each route group directory:

| Route | Error Content | Retry Action |
|-------|---------------|--------------|
| `/changes/new` | "Aanvraagformulier laden mislukt" + "Probeer opnieuw" button | Retry page load |
| `/changes/[id]` | "Change request laden mislukt" + "Terug naar overzicht" link | Navigate to /changes/new |
| `/benchmarks` | "Catalogus laden mislukt" + "Probeer opnieuw" button | Retry page load |
| `/benchmark-aanvraag` | "Formulier laden mislukt" + "Probeer opnieuw" button | Retry page load |
| `/admin/client-config` | "Configuratie laden mislukt" + "Probeer opnieuw" button | Retry page load |

### Error Page Visual Contract

```tsx
// All error.tsx share this structure:
<div className="page-shell empty-state">
  <p className="eyebrow">FOUT</p>
  <h1>{error title}</h1>
  <p>{error description}</p>
  <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
    <button className="button button-primary" onClick={reset}>
      Probeer opnieuw
    </button>
    <Link className="button button-secondary" href="/">
      Naar home
    </Link>
  </div>
</div>
```

### Client-Side Error Upgrades

| Current | Upgrade | Component |
|---------|---------|-----------|
| `alert()` on export failure | Inline `.form-errors` div + toast-style error | ExportButton |
| `console.error` with no user feedback | Add inline `.form-errors` for network failures | BenchmarkCatalogTable, ClientConfigTable |

### Global Error Boundary

Add `app/error.tsx` (top-level) for unexpected errors anywhere in the app tree:
- Full page error with logo, "Er is een fout opgetreden" copy, "Probeer opnieuw" and "Naar home" buttons.
- Logs to `console.error` for debugging.

---

## Spacing Scale

Already established via CSS classes. No new tokens needed.

| Token | Typical Value | Usage |
|-------|---------------|-------|
| 4px | — | Icon-to-icon gaps, badge padding |
| 8px | `gap: 8px` | Compact element spacing, grid gaps |
| 12px | `padding: 12px 16px` | Card padding (form-errors, nb-fields) |
| 14px | `padding: 10px 14px` | Input padding |
| 16px | `gap: 16px` | Default element spacing, grid gap |
| 20px | `padding: 20px` | Cost card, estimate card padding |
| 24px | `padding: 24px` | Section padding, nb-detail padding |
| 28px | `padding: 0 max(28px ...)` | Page shell side padding |
| 32px | `padding: 32px 16px` | Layout gaps, success state padding |
| 48px | `padding: 48px 24px` | Timeline state, empty state padding |
| 64px | `padding: 64px 28px 88px` | Page shell top padding |
| 88px | `padding-bottom: 88px` | Page shell bottom padding |

Exceptions: Touch targets below 768px must be minimum **44×44px** (WCAG 2.5.8). Currently `.feedback-close` is 32×32px — expand to 44×44px on mobile.

---

## Typography

Already declared in `globals.css`. No new sizes or weights needed.

| Role | Size | Weight | Line Height | Notes |
|------|------|--------|-------------|-------|
| Body | 15px | 400 | 1.5 | Default `body` font |
| Small label | 11px | 750 (ExtraBold) | 1.3 | `.eyebrow`, `.updates-table th`, label spans |
| Small text | 12–13px | 400/600 | 1.4 | `.catalog-subtitle`, `.commit-badge-sm`, `.cost-card-detail` |
| Input text | 14px | 400 | 1.5 | Form inputs |
| Button text | 13–14px | 700 | 1.4 | All buttons |
| Section heading | 18–22px | 700 | 1.2 | `h2` elements |
| Page heading / Display | clamp(42px, 6vw, 74px) | 700 | 0.96 | `h1` in hero, page-intro, request-header |
| Brand | 19px | 750 | 1 | `.brand` in topbar |
| Monospace | 11.5px | 400 | 1.5 | `.id-cell`, `.updates-table .col-hash code`, `.diff-line code` |

---

## Color

Existing CSS custom properties (locked — no new tokens):

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Dominant (60%) | `--canvas` | `#eef1ed` | Page background |
| Dominant surface | `--panel` | `#f6f8f5` | Table headers, secondary backgrounds |
| Card surface | — | `#fbfcfa` | `.topbar`, `.updates-table-wrapper`, `.cost-card`, cards |
| Secondary (30%) | `--line` | `#d9dfdb` | Borders, dividers, table borders |
| Accent (10%) | `--accent` | `#0f6d55` | **Reserved for:** buttons, links, focus borders, active states, status dots, actionable elements |
| Accent deep | `--accent-deep` | `#0a513f` | Reserved for: hover states, text on white requiring AA, active sort headers |
| Mint | `--mint` | `#dff4e9` | Reserved for: highlight cards (alt workflow, new benchmark fields, highlight rows) |
| Destructive | `--danger` | `#a44032` | Reserved for: error messages, destructive actions (none in this phase) |
| Danger bg | `--danger-bg` | `#fff0ed` | Error alert background |
| Ink | `--ink` | `#14231e` | Primary text color |
| Muted | `--muted` | `#5d6864` | Secondary text, metadata, placeholder |
| Code | `--code` | `#15221e` | Code/monospace text |

### Accent Contrast Remediation

Where `--accent` (#0f6d55) is used for body-size text on white backgrounds (contrast 3.5:1, fails WCAG AA), replace with `--accent-deep` (#0a513f, contrast 4.5:1 ✅). Audit locations:

- `.button-ghost` color
- `a` link underlines in `.feedback-success`
- `.catalog-section a` in client-config page
- Any `color: var(--accent)` applied to body-size (≤18px) text on white

---

## Copywriting Contract

All copy in Dutch (existing locale — no English additions).

| Element | Copy | Notes |
|---------|------|-------|
| Global error page title | "Er is een fout opgetreden" | |
| Global error page body | "Probeer het nog een keer of ga terug naar de homepagina." | |
| Global error retry CTA | "Probeer opnieuw" | |
| Global error home link | "Naar home" | |
| Loading skeleton fallback | "Bezig met laden…" | `aria-label` on skeleton wrapper |
| Route error page title | "[Page name] laden mislukt" | e.g. "Catalogus laden mislukt" |
| Route error body | "Controleer je verbinding en probeer het opnieuw." | |
| Route error retry CTA | "Probeer opnieuw" | |
| Export failure (client) | "Export mislukt. Probeer het opnieuw." | Inline error, not `alert()` |
| Network failure (tables) | "Gegevens ophalen mislukt. Probeer het opnieuw." | BenchmarkCatalogTable, ClientConfigTable |
| Empty benchmark catalog | "Er zijn nog geen benchmarks beschikbaar." | `.cost-summary` section also hidden |
| Empty client config | "Er zijn nog geen client configuraties ingesteld." | |
| Destructive actions | **None in this phase** | No delete/remove in scope |

---

## UI-State Considerations

### Shape-Rooted State Coverage

Resolved via probe (to be confirmed post-verification). Expected applicable categories:

| Category | Element(s) | Expectation |
|----------|------------|-------------|
| empty | Benchmark table, Config table, Updates timeline, Home stats | Documented Dutch copy + centered layout |
| loading | All async pages + client fetch surfaces | Skeleton shimmer (server) + spinner (client) |
| error | All route groups + client fetch | error.tsx per group + inline error fallbacks |
| populated | All data tables | Multi-row scroll, sort/filter active |
| overflow | Data tables, long commit messages | Horizontal scroll, text truncation with title tooltip |
| zero-one-many | Home stats, Updates timeline | Singular vs plural for count display |
| long-text | Commit messages, benchmark names | `truncate()` + `title` attribute |

---

## Visual Polish Items

### 1. Console Error Fixes
- Build production bundle, check `npm run build` output for warnings.
- Fix any React hydration mismatches (common: date formatting between server/client).
- Remove unused imports across all components.
- Fix any `key` prop warnings in lists.

### 2. Hover/Active States Uniformity
| Element | Current | Fix |
|---------|---------|-----|
| `.topbar nav a` | `color: var(--accent)` on hover | Add `transition: color .15s` |
| `.updates-table tbody tr` | Hover has background ✅ | Verify works inside scroll wrapper |
| `.catalog-list div` | No hover | Add `background: var(--panel)` on hover |
| `.diff-block` | No hover | Add subtle background for readability |

### 3. Button Alignment Consistency
- Verify all `button` and `a.button` have identical `display: inline-flex` and `align-items: center`.
- Add `gap: 8px` to all buttons that contain icon + text.

### 4. Status Pills and Badges
- `.status-pill` on change request detail: ensure contrast with background variants.
- `.commit-badge-sm` colors: verify against `--panel` / white backgrounds.

### 5. Form Validation Feedback
- All `minLength` and `required` attributes currently use native browser validation — confirm `novalidate` not used.
- Add visual error indicator on invalid fields (red border + aria-invalid).

### 6. 404 Page Polish
- Existing `not-found.tsx` is minimal. Ensure it uses same `.page-shell.empty-state` styling as other empty/error states.
- Add home link alongside the "Nieuwe change" CTA.

### 7. Print Styles
- Add minimal `@media print` block: hide `.topbar`, `.feedback-trigger`, `.bottom-actions`. Show content full-width.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none (plain CSS) | — | not applicable |

---

## Execution Checklist

### Loading States
- [ ] `app/changes/new/loading.tsx` — skeleton form
- [ ] `app/changes/[id]/loading.tsx` — skeleton detail
- [ ] `app/benchmarks/loading.tsx` — skeleton table
- [ ] `app/benchmark-aanvraag/loading.tsx` — skeleton form
- [ ] `app/admin/client-config/loading.tsx` — skeleton table
- [ ] Skeleton CSS primitives in `globals.css`

### Error Boundaries
- [ ] `app/error.tsx` — global
- [ ] `app/changes/new/error.tsx`
- [ ] `app/changes/[id]/error.tsx`
- [ ] `app/benchmarks/error.tsx`
- [ ] `app/benchmark-aanvraag/error.tsx`
- [ ] `app/admin/client-config/error.tsx`
- [ ] ExportButton: replace `alert()` with inline `.form-errors`

### Accessibility
- [ ] `:focus-visible` global style in `globals.css`
- [ ] Remove all `outline: none` — replace with `:focus-visible` pattern
- [ ] Add `aria-label` to `.catalog-search` input
- [ ] Add `aria-expanded` to `.config-filter-toggle`
- [ ] Add `role="menu"` / `role="menuitem"` to export dropdown
- [ ] Add `aria-sort` on sortable column headers
- [ ] Add `aria-describedby` on form fields
- [ ] Add `aria-modal="true"` to feedback dialog
- [ ] Add `aria-live="polite"` to error containers and `.status-pill`

### Responsive
- [ ] 768px breakpoint styles for topbar, forms, grids, tables
- [ ] Touch targets (44×44px) on mobile for `.feedback-close`, `.sort-header`, filter toggle
- [ ] Verify all data tables have `overflow-x: auto` on mobile

### Visual Polish
- [ ] Build production and fix all console errors
- [ ] Add hover states to catalog list items
- [ ] Add `@media print` block
- [ ] Polish 404 page with home link
- [ ] Check all buttons for alignment consistency
- [ ] Add `aria-invalid` + red border on invalid form fields

### Testing
- [ ] Run `@axe-core/playwright` scan — resolve all critical/serious violations
- [ ] Verify `npm run build` succeeds with zero warnings
- [ ] Verify keyboard navigation works on all pages (Tab, Enter, Escape)
- [ ] Verify mobile layout at 768px, 600px, 375px viewports

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: pending
- [ ] Dimension 2 Visuals: pending
- [ ] Dimension 3 Color: pending
- [ ] Dimension 4 Typography: pending
- [ ] Dimension 5 Spacing: pending
- [ ] Dimension 6 Registry Safety: pending

**Approval:** pending
