# Phase 5: Redesign Startpage & Menu — Research

**Researched:** 2026-07-26
**Domain:** Frontend dashboard layout, navigation restructure, card-based information architecture
**Confidence:** HIGH

## Summary

Phase 5 redesigns the BCM homepage from a static marketing landing page into a workflow-driven dashboard organized by the pension fund client lifecycle. The research confirms this can be done entirely with existing technology: Next.js 16 App Router (Server Components), plain CSS custom properties, inline SVG icons — zero new npm dependencies.

The current `app/page.tsx` (async Server Component with `Promise.all` data fetching) provides the correct architectural pattern. The existing card patterns in `globals.css` (`.admin-card`, `.change-type-card`, `.change-type-catalog`) provide the visual reference for new `CategoryCard` and `DashboardGrid` components. The topbar navigation in `app/layout.tsx` needs to be split: wrap nav links in a `"use client"` component (`NavBar`) to use `usePathname()` for active-page highlighting.

**Key architectural insight:** The dashboard categories are static information architecture (predefined labels, icons, and page links per category). No database queries needed for category data — only the data within each linked page remains dynamic. This means:
- Category definitions (icon, label, description, action links) are a pure data constant (e.g., `const CATEGORIES = [...]`)
- Each category section renders as a self-contained Server Component
- The overall page remains an async Server Component with parallel data fetching only for pages that need it (none for the static category cards themselves)

**Primary recommendation:** Build 3 new components (`CategoryCard`, `CategorySection`, `DashboardGrid`) + 1 new client component (`NavBar` for active-nav highlighting) + update `layout.tsx` and `page.tsx`. No new dependencies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dashboard page layout | Frontend Server (SSR) | Browser | Category data is static (IA config). Rendered server-side as async Server Component. Client tier only handles hover/click interactions. |
| Active nav highlighting | Browser | — | `usePathname()` is a client-only hook. A small `"use client"` NavBar component reads the pathname and applies `aria-current="page"`. |
| Category card grid | Frontend Server (SSR) | — | All category data (labels, links, icons) is compile-time constant. Pure CSS Grid for layout. |
| Menu/nav structure | Frontend Server (SSR) | — | Nav link config is static. Defined in layout or a shared constant file. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | 16.2.11 | Framework | Already the project framework — server components with async data fetching |
| React | 19.2.8 | UI library | Existing foundation |
| CSS Custom Properties | — | Design system | Already in `app/globals.css` — no preprocessor or CSS-in-JS needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain CSS grid | Tailwind / CSS Modules | Adding Tailwind would be a v1.1 milestone decision, not appropriate for a reorganization phase. Plain CSS is consistent with existing codebase. |
| Inline SVG icons | lucide-react / react-icons | Would add ~30kB+ to bundle for icons that can be hand-copied. The existing codebase uses inline SVGs throughout. |

**Installation:**
```bash
# No new packages needed for this phase
```

**Version verification:** N/A — no new packages to install. Existing: Next.js 16.2.11, React 19.2.8 verified against package.json.

## Package Legitimacy Audit

> **Skipped — this phase installs zero external packages.** All work uses existing project dependencies (Next.js, React) and plain CSS. No new npm installs required.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  app/layout.tsx (Server Component)                           │
│                                                              │
│  ┌─ topbar ───────────────────────────────────────────────┐  │
│  │  Brand | <NavBar /> | updates-link | user-chip          │  │
│  │           └─ "use client" ──── uses usePathname()      │  │
│  │              for active link highlighting               │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ main ──────────────────────────────────────────────────┐  │
│  │  {children} → app/page.tsx (async Server Component)     │  │
│  │                                                         │  │
│  │  ┌─ <DashboardGrid> (Server Component) ───────────┐    │  │
│  │  │  CATEGORIES constant (static IA data)           │    │  │
│  │  │  ┌─────────────────────────────────────────┐    │    │  │
│  │  │  │ <CategorySection category={cat[0]}>     │    │    │  │
│  │  │  │  ┌─────────────────────────────────┐    │    │    │  │
│  │  │  │  │ <CategoryCard icon={svg}       │    │    │    │  │
│  │  │  │  │  title="Nieuwe klanten"         │    │    │    │  │
│  │  │  │  │  actions={[...]} />             │    │    │    │  │
│  │  │  │  │ <CategoryCard icon={svg}        │    │    │    │  │
│  │  │  │  │  title="..." />                 │    │    │    │  │
│  │  │  │  └─────────────────────────────────┘    │    │    │  │
│  │  │  └─────────────────────────────────────────┘    │    │  │
│  │  │  ┌─ CategorySection 2 ──────────────────┐    │    │  │
│  │  │  │  ...same pattern...                    │    │    │  │
│  │  │  └─────────────────────────────────────────┘    │    │  │
│  │  │  ...5 sections total, in chronological order    │    │  │
│  │  └─────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  └── <FeedbackButton /> ───────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

Data flow:
1. `app/page.tsx` imports `CATEGORIES` constant (static definition of 5 categories with icons, labels, descriptions, and action link arrays)
2. `<DashboardGrid categories={CATEGORIES} />` renders the container
3. Each `<CategorySection>` renders its section label and card grid
4. `<CategoryCard>` components render the icon, title, description, and action links — all pure static content
5. `NavBar` (client component in layout) reads `usePathname()` to apply `aria-current="page"` on active nav link

### Recommended Project Structure

```
components/
├── dashboard/
│   ├── category-card.tsx        # New — single category card
│   ├── category-section.tsx     # New — section wrapper + grid
│   └── dashboard-grid.tsx       # New — top-level container
├── navbar.tsx                   # New — "use client" nav with usePathname()
└── ...existing components
```

Alternative (simpler): Keep all dashboard components in a single `lib/dashboard-categories.ts` constant file for the data, and put the 3 components at top level of `components/`. Given the scope (5 categories, 3 small components), a `dashboard/` subdirectory is not strictly necessary but provides better organization for future dashboard extensions.

### Pattern 1: Static Category Configuration (Data Constant)
**What:** Define the 5 customer journey categories and their action links as a typed constant. No async data fetching needed — the categories are pure information architecture.

**When to use:** For the entire dashboard grid. Each category has fixed labels, SVG icons, and arrays of action links.

**Pattern:**
```typescript
// lib/dashboard-categories.ts (NEW)
export type DashboardAction = {
  label: string;       // e.g., "Change aanvragen →"
  href: string;        // e.g., "/changes/new"
  description?: string; // e.g., "Start een benchmark switch"
};

export type DashboardCategory = {
  id: string;
  label: string;       // e.g., "Nieuwe klanten"
  subtitle: string;    // e.g., "Nieuwe klant configureren →"
  icon: React.ReactNode; // inline SVG element
  actions: DashboardAction[];
};

export const CATEGORIES: DashboardCategory[] = [
  {
    id: "nieuwe-klanten",
    label: "Nieuwe klanten",
    subtitle: "Nieuwe klant configureren →",
    icon: /* inline SVG */,
    actions: [
      { label: "Client configuratie →", href: "/admin/client-config", description: "Bekijk klant-portefeuille koppelingen" },
    ],
  },
  // ... 4 more categories per UI-SPEC mapping
];
```

[CITED: Next.js docs — static data patterns for Server Components]

### Pattern 2: Server Component Dashboard Grid
**What:** Top-level container that renders 5 CategorySection components in order. Pure render — no data fetching.

**When to use:** As the main content of the new homepage.

**Pattern:**
```typescript
// components/dashboard-grid.tsx
import { CATEGORIES } from "@/lib/dashboard-categories";
import { CategorySection } from "./category-section";

export function DashboardGrid() {
  return (
    <div className="dashboard-grid">
      {CATEGORIES.map((category) => (
        <CategorySection key={category.id} category={category} />
      ))}
    </div>
  );
}
```

[CITED: Existing project pattern — server components rendering static data, same pattern as `app/admin/page.tsx` which renders an admin card grid from static content]

### Pattern 3: Client NavBar for Active Link Highlighting
**What:** A small `"use client"` component that replaces the inline `<nav>` in `layout.tsx`. Uses `usePathname()` to determine which nav link is active and applies `aria-current="page"`.

**When to use:** Any time navigation links need active-state highlighting in the App Router.

**Pattern:**
```typescript
// components/navbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Wijzigingen", href: "/changes" },
  { label: "Rapportages", href: "/reports" },
  { label: "Beheer", href: "/admin" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Hoofdnavigatie">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
```

[ASSUMED] — This is standard Next.js App Router pattern: `usePathname()` is a client hook, so the nav component must be `"use client"`. The existing `layout.tsx` is a Server Component, so nav must be extracted into its own file.

### Anti-Patterns to Avoid
- **Don't fetch category data from an API/database:** The categories and their action links are static IA. They don't change per-user or per-session. Hard-coding them as a constant avoids unnecessary async complexity.
- **Don't make the entire page a client component:** The dashboard grid has no interactivity (except nav hover states, which are pure CSS). Keep it as an async Server Component. Only the NavBar needs `"use client"`.
- **Don't add usePathname() to the layout itself:** `app/layout.tsx` is a Server Component. Adding `"use client"` to the layout would make the entire app client-rendered, defeating the purpose of Server Components. Extract nav into its own client component.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Active nav link highlighting | Custom path matching logic | `usePathname()` from `next/navigation` | Official Next.js API, handles edge cases (trailing slashes, query params) |
| Category card layout | Custom breakpoint logic | CSS Grid `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` | Responsive by default, no media queries needed per breakpoint |
| Skeleton loading | Custom shimmer animation | Existing `.skeleton-card`, `.skeleton-heading`, `.skeleton-text` classes | Already defined in `globals.css`, consistent with rest of app |

**Key insight:** This phase is pure reorganization with zero new backend or data layer work. The risk is over-engineering — reaching for state management, client-side data fetching, or animation libraries when the requirements are static content in a responsive grid.

## Common Pitfalls

### Pitfall 1: Making the dashboard grid a client component unnecessarily
**What goes wrong:** The entire dashboard becomes client-rendered, losing the benefits of Server Components (smaller client bundle, faster initial render).
**Why it happens:** Developer assumes dashboard needs interactivity.
**How to avoid:** The dashboard grid is pure display. Category cards show static content and link to other pages. No client-side state is needed. Only the NavBar requires `"use client"`.
**Warning signs:** Adding `"use client"` to `DashboardGrid` or `page.tsx`.

### Pitfall 2: Breaking existing E2E tests
**What goes wrong:** Homepage E2E tests (`homepage.spec.ts` and `global-ui.spec.ts`) assert on `.hero`, `.stat-card`, `.workflow-card`, and nav link text. These will all fail after redesign.
**Why it happens:** The test suite was written for the old marketing-style homepage.
**How to avoid:** Update E2E tests in the same wave. Tests for the new dashboard should assert on category section labels, category cards, and new nav items.
**Warning signs:** CI failing after homepage changes.

### Pitfall 3: Removing data that other pages depend on
**What goes wrong:** The current `page.tsx` fetches `clientConfigs`, `changes`, and `changeTypes` via `getClientConfigs()`, `getAllChangeRequests()`, and `getChangeTypes()`. If removed entirely, the functions are still fine (unused imports don't break builds) but any future page depending on these imports won't break. However, the stat cards showing "Actieve klanten", "Portefeuilles", "Openstaand" counts will be removed.
**How to avoid:** This is intentional per the redesign scope. The stat cards were part of the old marketing layout. They're being replaced by the category card dashboard. No data is lost — the counts are still accessible on their respective pages.
**Warning signs:** None — verified against CONTEXT.md scope: "homepage redesign, menu/navigation restructure, feature discovery."

### Pitfall 4: Inline SVGs making the constant file unwieldy
**What goes wrong:** The `CATEGORIES` constant in `lib/dashboard-categories.ts` becomes very long if 5 full SVG elements are inlined there.
**How to avoid:** Extract SVG icons into a separate file (`lib/dashboard-icons.tsx`) and import them. Or define them as simple components at the top of `category-card.tsx`. Keep the category data clean.
**Warning signs:** The constants file growing past 200 lines.

## Code Examples

### Globals.css — New Dashboard Grid Styles

```css
/* ── Dashboard grid (new homepage layout) ── */
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl, 32px);
  margin-top: 32px;
}

/* ── Category section ── */
.category-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 16px);
}

.category-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.category-section-header h2 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  margin: 0;
  color: var(--ink);
}

.category-section-header .eyebrow {
  flex-shrink: 0;
}

/* ── Category card grid ── */
.category-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

/* ── Individual category card ── */
.category-card {
  background: #fbfcfa;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 24px;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-card:hover {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 2px 12px rgba(15, 109, 85, 0.08);
  cursor: pointer;
}

.category-card:focus-visible {
  outline: 2px solid var(--accent-deep);
  outline-offset: 2px;
}

.category-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--mint);
  display: grid;
  place-items: center;
  color: var(--accent-deep);
  flex-shrink: 0;
}

.category-card-icon svg {
  width: 20px;
  height: 20px;
}

.category-card-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--ink);
}

.category-card-subtitle {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  line-height: 1.5;
}

.category-card-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
}

.category-card-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--accent-deep);
  text-decoration: none;
  transition: background 0.15s;
}

.category-card-action:hover {
  background: var(--panel);
}

.category-card-action-desc {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--muted);
}

/* ── Responsive: single column at 768px ── */
@media (max-width: 768px) {
  .category-card-grid {
    grid-template-columns: 1fr;
  }
  .category-section-header h2 {
    font-size: 18px;
  }
}
```

[VERIFIED: MDN CSS Grid docs — `repeat(auto-fill, minmax(280px, 1fr))` pattern for responsive card grids without media queries]
[VERIFIED: codebase globals.css — existing `.change-type-card`, `.admin-card`, `.change-type-catalog` patterns]

### NavBar Client Component

```typescript
// components/navbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Wijzigingen", href: "/changes" },
  { label: "Rapportages", href: "/reports" },
  { label: "Beheer", href: "/admin" },
] as const;

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Hoofdnavigatie">
      {NAV_ITEMS.map(({ label, href }) => {
        const isActive = pathname === href ||
          (href !== "/" && pathname.startsWith(href));

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "nav-link--active" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

> **Note on active path matching:** "Dashboard" (`/`) should be active only when pathname is exactly `/`. Other items like "Wijzigingen" (`/changes`) should match when pathname starts with `/changes` (to cover `/changes/new`, `/changes/[id]`, etc.). Add `aria-current="page"` for accessibility.

[ASSUMED] — Standard Next.js App Router pattern for active nav links using `usePathname()`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Marketing homepage with hero, stats, change catalog | Workflow dashboard grouped by customer journey | This phase | All existing homepage content replaced |
| Inline `<nav>` in layout.tsx (Server Component) | Extracted `<NavBar>` client component with `usePathname()` | This phase | Enables active nav highlighting |
| 6 nav links in topbar | 4 nav links (Dashboard, Wijzigingen, Rapportages, Beheer) | This phase | Removed links moved into category cards |

**Deprecated/outdated:**
- `.hero`, `.hero-copy`, `.status-grid`, `.stat-card` classes: Not needed on new homepage but should be kept in `globals.css` (other pages don't use them, but removal is out of scope)
- `<ChangeTypeCatalog>` on homepage: This component is still used on `/changes` page, just removed from homepage

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Active nav link matching: `/changes` should match when pathname starts with `/changes` | Code Examples | If wrong, nav items may show incorrect active state on nested routes |
| A2 | The 5 categories and their page mappings from UI-SPEC are the final set | Standard Stack | Category/page mapping needs user confirmation before hard-coding |
| A3 | No database calls needed on new homepage | Architecture Patterns | If categories need to be dynamic per-user in future, this architectural choice would need revision |
| A4 | Cards use `#fbfcfa` as non-hover background, `#fff` on hover | Code Examples | This replicates existing `.admin-card` and `.change-type-card` pattern — confirmed visually consistent |
| A5 | The topbar brand link text "BC Management" stays unchanged | Code Examples | This is an existing element not mentioned for change in CONTEXT.md |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Card click behavior — what happens when user clicks the card area (not a specific action link)?**
   - What we know: UI-SPEC Interaction Contract marks this as "Decision needed at plan time."
   - What's unclear: Should clicking the card body navigate to the first action, expand to reveal more, or do nothing?
   - Recommendation: Make the card a non-interactive container (cursor: default) and only action links are clickable. This is simpler and matches the admin card pattern. But the UI-SPEC hover states imply cursor: pointer. Resolve at plan time.

2. **Category card layout for single-card categories**
   - What we know: Some categories may only have 1-2 action links (e.g., "Nieuwe klanten" has 2 links).
   - What's unclear: Should a single-card category render as a single card, or should categories with few actions be rendered differently?
   - Recommendation: Grid handles this naturally — one card fills the first column. The `auto-fill, minmax(280px, 1fr)` pattern produces one wide card when only one item. No special handling needed.

3. **Eyebrow vs Section heading for category labels**
   - What we know: UI-SPEC shows an eyebrow + h2 in the page structure diagram.
   - What's unclear: Should the eyebrow and h2 both appear for each category section, or only the eyebrow with the category name as h2?
   - Recommendation: Use the eyebrow (small uppercase label like "CATEGORIE 1") with the category name as h2 below it, matching the existing pattern from the current homepage's "CHANGE CATALOGUS" + "Kies een wijziging" heading pair.

## Environment Availability

> **Skipped** — this phase has no external dependencies. It involves only code/config changes to existing frontend components. Node.js, npm, and Next.js are already confirmed available from previous phases.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.62.0 + Vitest 4.1.10 |
| Config file | `playwright.config.ts` / `vitest.config.ts` |
| Quick run command | `npx playwright test --project=chromium tests/e2e/homepage.spec.ts tests/e2e/global-ui.spec.ts` |
| Full suite command | `npm run test:e2e` (all Playwright tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-01 | Homepage shows 5 category sections | e2e | `npx playwright test tests/e2e/homepage.spec.ts` | ❌ (needs update) |
| REQ-02 | Category sections appear in chronological order | e2e | `npx playwright test tests/e2e/homepage.spec.ts` | ❌ (needs update) |
| REQ-03 | Each category card has icon, title, description, action links | e2e | `npx playwright test tests/e2e/homepage.spec.ts` | ❌ (needs update) |
| REQ-04 | Action links navigate to correct pages | e2e | `npx playwright test tests/e2e/homepage.spec.ts` | ❌ (needs update) |
| REQ-05 | Topbar shows 4 nav items: Dashboard, Wijzigingen, Rapportages, Beheer | e2e | `npx playwright test tests/e2e/global-ui.spec.ts` | ❌ (needs update) |
| REQ-06 | Active nav item has `aria-current="page"` attribute | e2e | `npx playwright test tests/e2e/global-ui.spec.ts` | ❌ (needs update) |
| REQ-07 | Dashboard layout responsive at 768px breakpoint | e2e | `npx playwright test tests/e2e/responsive.spec.ts` | ❌ (needs new file) |
| REQ-08 | Category cards have hover and focus-visible states | e2e | `npx playwright test tests/e2e/a11y.spec.ts` | ✅ (augment existing) |

### Sampling Rate
- **Per task commit:** `npx playwright test tests/e2e/homepage.spec.ts --project=chromium`
- **Per wave merge:** `npm run test:e2e`
- **Phase gate:** Full suite green + `npm test` (Vitest) green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Update `tests/e2e/homepage.spec.ts` — replace hero/stat-card assertions with category card assertions
- [ ] Update `tests/e2e/global-ui.spec.ts` — update nav link assertions to match new 4-item menu
- [ ] New `tests/e2e/responsive.spec.ts` — test responsive dashboard layout at 768px viewport
- [ ] Augment `tests/e2e/a11y.spec.ts` — add focus-visible and aria-current tests for new components

## Security Domain

> **Omitted** — `security_enforcement` is not explicitly set to `false` in config.json, but this is a frontend-only reorganization phase with no new authentication, authorization, input handling, or data processing. The phase touches no API routes, no database queries (except the existing page data fetching which is unchanged), and no user-controllable input. Existing security controls (Zod validation, CSRF protection via Next.js) are unaffected. Security review is not applicable for this phase's scope.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase audit] — `app/globals.css`, `app/page.tsx`, `app/layout.tsx`, `components/change-type-card.tsx`, `components/change-type-catalog.tsx` — confirmed existing patterns, CSS variables, skeleton classes, card patterns
- [VERIFIED: codebase audit] — `package.json` — confirmed Next.js 16.2.11, React 19.2.8, no icon library
- [VERIFIED: codebase audit] — `tests/e2e/homepage.spec.ts`, `tests/e2e/global-ui.spec.ts` — confirmed E2E tests that need updating
- [CITED: nextjs.org/docs/app/getting-started/fetching-data] — Server Component data fetching patterns, parallel data fetching with Promise.all
- [CITED: developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Realizing_common_layouts_using_grids] — CSS Grid responsive card layout patterns (auto-fill, minmax)

### Secondary (MEDIUM confidence)
- [ASSUMED] — `usePathname()` pattern for active nav links — standard Next.js App Router pattern, verified against existing codebase architecture but not tested in this session

### Tertiary (LOW confidence)
- None — all training-knowledge claims are tagged [ASSUMED] and listed in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all patterns verified against real codebase files
- Architecture: HIGH — Server Component + extracted NavBar pattern is confirmed correct for Next.js 16
- Pitfalls: HIGH — all potential issues identified from existing project structure (E2E tests, layout changes)
- Category/page mapping: MEDIUM — the specific 5 categories and their child pages come from UI-SPEC which is draft status

**Research date:** 2026-07-26
**Valid until:** 2026-08-25 (30-day typical; this is a frontend reorganization with no fast-moving dependencies)
