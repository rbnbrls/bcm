# Phase 5: Redesign Startpage & Menu — Pattern Map

**Mapped:** 2026-07-26
**Files analyzed:** 13
**Analogs found:** 12 / 13 (1 no direct analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `components/dashboard/category-card.tsx` | component | static-render | `components/change-type-card.tsx` | exact |
| `components/dashboard/category-section.tsx` | component | static-render | `components/change-type-catalog.tsx` | exact |
| `components/dashboard/dashboard-grid.tsx` | component | static-render | `components/change-type-catalog.tsx` | role-match |
| `lib/dashboard-categories.ts` | config | static | `lib/types.ts` | role-match |
| `lib/dashboard-icons.tsx` | utility | static | — | **no analog** |
| `components/navbar.tsx` | component | client-render | `components/feedback-button.tsx` | role-match |
| `app/page.tsx` | page | request-response | `app/page.tsx` (current) | exact |
| `app/layout.tsx` | layout | request-response | `app/layout.tsx` (current) | exact |
| `app/globals.css` | styles | static | `app/globals.css` (current) | exact |
| `tests/e2e/homepage.spec.ts` | test | e2e | `tests/e2e/homepage.spec.ts` (current) | exact |
| `tests/e2e/global-ui.spec.ts` | test | e2e | `tests/e2e/global-ui.spec.ts` (current) | exact |
| `tests/e2e/a11y.spec.ts` | test | e2e | `tests/e2e/a11y.spec.ts` (current) | exact |
| `tests/e2e/responsive.spec.ts` | test | e2e | `tests/e2e/homepage.spec.ts` | role-match |

---

## Pattern Assignments

### `components/dashboard/category-card.tsx` (component, static-render)

**Analog:** `components/change-type-card.tsx`

**Imports pattern** (lines 1-4):
```typescript
"use client";

import Link from "next/link";
import type { ChangeTypeConfig } from "@/lib/types";
```
→ **Adapt for CategoryCard:** Omit `"use client"` — no client-side hooks needed. Import only `Link` from `next/link` and the action types from `@/lib/dashboard-categories`.

**Core card pattern** (lines 24-86) — `article` element with CSS class composition:
```typescript
export function ChangeTypeCard({ config }: Props) {
  const mermaidDefinition = generateMermaidFlowchart(config);
  return (
    <article className="change-type-card" aria-label={config.name}>
      <div className="change-type-card-header">
        <div>
          <span className="change-type-badge">{formatCategoryLabel(config.category)}</span>
          <h3>{config.name}</h3>
        </div>
        <span className="change-type-sla">{formatLeadDays(config.defaultLeadDays)}</span>
      </div>
      <p className="change-type-desc">{config.description}</p>
      <div className="change-type-cta">
        <Link href={`/changes/new?type=${config.slug}`} className="button button-primary">
          Start {config.name.toLowerCase()} →
        </Link>
      </div>
    </article>
  );
}
```
→ **Adapt for CategoryCard:** Same `article` + className pattern. Replace header with icon (SVG), card title, and subtitle. Replace CTA button with action links list. CSS classes use new names: `category-card`, `category-card-icon`, `category-card-title`, `category-card-subtitle`, `category-card-actions`, `category-card-action`.

**Key structural differences from analog:**
- Omit `"use client"` (CategoryCard is a server component — no interactivity)
- No `mermaidDefinition`, no `cost`, no `stakeholders` sections
- Action links are an array mapped via `.map()` into `<Link>` elements
- Card container is **not** itself a link (only action links are clickable)
- Accepts `DashboardAction[]` instead of `ChangeTypeConfig`

**Empty state pattern** — borrowed from `components/change-type-catalog.tsx` line 16-20:
```typescript
if (types.length === 0) {
  return (
    <div style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
      <p>Geen change types beschikbaar.</p>
    </div>
  );
}
```

---

### `components/dashboard/category-section.tsx` (component, static-render)

**Analog:** `components/change-type-catalog.tsx`

**Imports pattern** (lines 1-2):
```typescript
import type { ChangeTypeConfig } from "@/lib/types";
import { ChangeTypeCard } from "@/components/change-type-card";
```
→ **Adapt:** Import `type { DashboardCategory }` from `@/lib/dashboard-categories` and `{ CategoryCard }` from `./category-card`.

**Core container pattern** (lines 14-29):
```typescript
export function ChangeTypeCatalog({ types }: Props) {
  if (types.length === 0) {
    return <div ...><p>Geen change types beschikbaar.</p></div>;
  }

  return (
    <div className="change-type-catalog">
      {types.map((config) => (
        <ChangeTypeCard key={config.id} config={config} />
      ))}
    </div>
  );
}
```
→ **Adapt for CategorySection:** Accept a single `category: DashboardCategory` prop. Render a section with:
- Section header (eyebrow + h2 — mimicking the existing pattern from `app/page.tsx` lines 56-57: `<p className="eyebrow">CHANGE CATALOGUS</p><h2>Kies een wijziging</h2>`)
- Card grid div with className `category-card-grid`
- Inside the grid, map over `category.actions` rendering `CategoryCard` for each

**Section header pattern** (from `app/page.tsx` lines 56-57):
```typescript
<div>
  <p className="eyebrow">CHANGE CATALOGUS</p>
  <h2 style={{ fontSize: 28, letterSpacing: "-.04em", margin: 0 }}>Kies een wijziging</h2>
</div>
```
→ **Adapt:** Use `category.label` (uppercased) for eyebrow, `category.title` for the h2.

---

### `components/dashboard/dashboard-grid.tsx` (component, static-render)

**Analog:** `components/change-type-catalog.tsx` (role-match — same pattern of mapping data to child components)

**Pattern:**
```typescript
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

**CSS grid container pattern** — from `app/globals.css` lines 1374-1378 (`.admin-grid`):
```css
.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 28px;
}
```
→ **Adapt for `.dashboard-grid`:** Use `display: flex; flex-direction: column; gap: var(--space-xl, 32px);` — the dashboard grid stacks sections vertically, not in a masonry layout.

---

### `lib/dashboard-categories.ts` (config, static)

**Analog:** `lib/types.ts` — type definitions + constant data pattern

**Type definition pattern** (from `lib/types.ts` lines 1-9, 40-47):
```typescript
export type Benchmark = {
  id: string;
  code: string;
  name: string;
  assetClass: string;
  currency: string;
  cost: number;
  provider: string;
};

export const CHANGE_STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "Concept",
  submitted: "Ingediend",
  // ...
};
```

**Pattern to follow for `dashboard-categories.ts`:**
```typescript
import type { ReactNode } from "react";

export type DashboardAction = {
  label: string;
  href: string;
  description?: string;
};

export type DashboardCategory = {
  id: string;
  label: string;
  title: string;
  icon: ReactNode;
  actions: DashboardAction[];
};

export const CATEGORIES: DashboardCategory[] = [
  {
    id: "nieuwe-klanten",
    label: "NIEUWE KLANTEN",
    title: "Nieuwe klanten",
    icon: <ClientIcon />,   // imported from ./dashboard-icons
    actions: [
      { label: "Client configuratie →", href: "/admin/client-config", description: "Bekijk klant-portefeuille koppelingen" },
      { label: "Client config importeren →", href: "/admin/client-config/import", description: "Importeer via CSV" },
    ],
  },
  // ... 4 more categories
];
```

**Path alias pattern** — all project imports use `@/` prefix (confirmed across all files):
- `@/lib/dashboard-categories`
- `@/components/dashboard/dashboard-grid`
- `@/components/navbar`

---

### `lib/dashboard-icons.tsx` (utility, static)

**No direct analog in codebase.** The existing codebase uses inline SVGs directly in components or in the layout. Create a new pattern: extract SVG icon components into a dedicated file.

**Suggested pattern** (based on existing inline SVG usage in `app/layout.tsx` lines 27-33):
```typescript
export function ClientIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
```

Each icon is a simple named function component returning inline SVG. 5 icons needed: one per category.

---

### `components/navbar.tsx` (component, client-render)

**Analog:** `components/feedback-button.tsx` — client component pattern with hook usage

**`"use client"` directive pattern** (lines 1-6):
```typescript
"use client";

import { useActionState, useState } from "react";
import { submitFeedback, type FeedbackState } from "@/app/feedback/actions";
```
→ **Adapt for NavBar:**
```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
```

**Nav link data pattern:**
```typescript
const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Wijzigingen", href: "/changes" },
  { label: "Rapportages", href: "/reports" },
  { label: "Beheer", href: "/admin" },
] as const;
```

**Active link matching pattern** (standard Next.js App Router pattern):
```typescript
export function NavBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Hoofdnavigatie">
      {NAV_ITEMS.map(({ label, href }) => {
        const isActive = href === "/"
          ? pathname === "/"
          : pathname.startsWith(href);

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

**Mounting in layout** — replaces the inline `<nav>` element in `app/layout.tsx`:
```
// Before:
<nav aria-label="Hoofdnavigatie">
  <Link href="/changes">Changes</Link>
  <Link href="/changes/new">Nieuwe change</Link>
  ...
</nav>

// After:
<NavBar />
```

**Existing nav link hover pattern** (from `app/globals.css` lines 938-940):
```css
.topbar nav a {
  transition: color .15s;
}
.topbar nav a:hover {
  color: var(--accent);
}
```
→ **Add active state:** `.topbar nav a.nav-link--active, .topbar nav a[aria-current="page"] { color: var(--accent-deep); font-weight: 700; }`

---

### `app/page.tsx` (page, request-response) — MODIFY

**Current pattern** (lines 1-120): Async Server Component with parallel data fetching via `Promise.all`, rendering hero section, status grid, change type catalog, recent changes, and about section.

**New pattern:** Replace entire content with DashboardGrid:
```typescript
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";

export default async function HomePage() {
  return (
    <div className="page-shell home-shell">
      <section className="hero" role="region" aria-label="Dashboard">
        <p className="eyebrow">DASHBOARD</p>
        <h1>Welkom bij BCM</h1>
        <p className="hero-copy">Kies een categorie om te beginnen met het beheren van benchmark wijzigingen voor je klanten.</p>
      </section>

      <DashboardGrid />
    </div>
  );
}
```

**Key changes:**
- Remove `Promise.all` data fetching (no dynamic data needed for the dashboard grid)
- Remove `ChangeTypeCatalog`, `recentChanges`, stat cards, "Over BCM" section
- Keep `page-shell home-shell` wrapper, keep `hero` region but simplify its content
- Remove imports: `getClientConfigs`, `getAllChangeRequests`, `getChangeTypes`, `CHANGE_STATUS_LABELS`, `sortChangeTypes`, `getActiveChangeTypes`, `ChangeTypeCatalog`

---

### `app/layout.tsx` (layout, request-response) — MODIFY

**Current pattern** (lines 11-42): Server Component with inline `<nav>` containing all navigation links.

**Change:**
- Import `NavBar` from `@/components/navbar`
- Replace the inline `<nav>...</nav>` block with `<NavBar />`
- Keep everything else unchanged (brand link, topbar-right with updates-link and user-chip, FeedbackButton)

```typescript
import { NavBar } from "@/components/navbar";
// ... rest of imports unchanged

<header className="topbar">
  <Link className="brand" href="/" aria-label="BCM home"><span>BC</span> Management</Link>
  <NavBar />
  <div className="topbar-right">...</div>
</header>
```

---

### `app/globals.css` (styles, static) — MODIFY

**Existing card patterns to reference** (lines 1373-1405, 1557-1703):

**`.admin-card` pattern** (lines 1380-1405):
```css
.admin-card {
  display: block;
  background: #fbfcfa;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 24px;
  transition: all .15s;
  text-decoration: none;
  color: inherit;
}
.admin-card:hover {
  border-color: var(--accent);
  background: #fff;
}
.admin-card h2 {
  margin: 0 0 8px;
  font-size: 17px;
  letter-spacing: -.02em;
  color: var(--accent-deep);
}
.admin-card p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
```

**`.change-type-card` pattern** (lines 1566-1594):
```css
.change-type-card {
  background: #fbfcfa;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 24px;
  transition: all .15s;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.change-type-card:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 12px rgba(15,109,85,.08);
}
```

**Grid container pattern** (lines 1559-1564):
```css
.change-type-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
  margin-top: 16px;
}
```

**Responsive breakpoint pattern** (lines 975-1045):
```css
@media (max-width: 768px) {
  .topbar { flex-wrap: wrap; gap: 12px; height: auto; padding: 12px 16px; }
  .topbar nav { gap: 14px; font-size: 13px; flex-wrap: wrap; }
  .page-shell { padding: 32px 16px 64px; }
  .home-shell { padding-top: 48px; }
  .cost-grid { grid-template-columns: 1fr; }
  .change-type-catalog { grid-template-columns: 1fr; }
}

@media (max-width: 600px) {
  .topbar nav { gap: 10px; font-size: 12px; }
  .brand { font-size: 16px; }
}
```

**New CSS to add to globals.css:**

```css
/* ── Dashboard grid (new homepage layout) ── */
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: 32px;
  margin-top: 32px;
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.category-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

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

/* ── Active nav link ── */
.topbar nav a.nav-link--active,
.topbar nav a[aria-current="page"] {
  color: var(--accent-deep);
  font-weight: 700;
}

/* ── Responsive: dashboard at 768px ── */
@media (max-width: 768px) {
  .category-card-grid {
    grid-template-columns: 1fr;
  }
  .category-section-header h2 {
    font-size: 18px;
  }
}
```

**Where to insert in globals.css:** After line 173 (after the `@keyframes fadeIn` and `:focus-visible` section), or near the existing card patterns. The research.md CSS can be added after the `.change-type-card` section (~line 1703) and before `.detail-workflow-section`.

---

### `tests/e2e/homepage.spec.ts` (test, e2e) — MODIFY

**Current pattern** (lines 1-65): 5 tests asserting on `.hero` CTAs, `.stat-card` visibility, `.change-type-catalog` sections, and navigation.

**New tests needed:**
1. Hero section shows "DASHBOARD" eyebrow and welcome heading
2. Dashboard grid shows 5 category sections (assert on `.category-section` count)
3. Each category section has an eyebrow + heading
4. Each category section contains action links with correct hrefs
5. Action links navigate to correct pages

**Pattern to follow** (existing test structure from lines 1-7):
```typescript
import { test, expect } from "@playwright/test";

test.describe("Dashboard homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("shows 5 category sections", async ({ page }) => {
    const sections = page.locator(".category-section");
    await expect(sections).toHaveCount(5);
  });

  test("category section has eyebrown and heading", async ({ page }) => {
    const firstSection = page.locator(".category-section").first();
    await expect(firstSection.locator(".eyebrow")).toBeVisible();
    await expect(firstSection.locator("h2")).toBeVisible();
  });

  test("category card action links navigate correctly", async ({ page }) => {
    const actionLink = page.locator(".category-card-action").first();
    const href = await actionLink.getAttribute("href");
    await actionLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(href!));
  });
});
```

---

### `tests/e2e/global-ui.spec.ts` (test, e2e) — MODIFY

**Current pattern** (lines 40-57): Tests check that nav links contain "Changes" and that nav links appear on other pages. These need to be updated for the new 4-item nav.

**Updated nav tests:**
```typescript
test("navigation links show Dashboard, Wijzigingen, Rapportages, Beheer", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const nav = page.locator("nav[aria-label='Hoofdnavigatie'] a");
  await expect(nav).toHaveText(["Dashboard", "Wijzigingen", "Rapportages", "Beheer"]);
});

test("active nav item has aria-current attribute", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const dashboardLink = page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/']");
  await expect(dashboardLink).toHaveAttribute("aria-current", "page");
});
```

---

### `tests/e2e/a11y.spec.ts` (test, e2e) — AUGMENT

**Current pattern** (lines 1-26): Runs axe-core audit on 6 pages. After redesign, the homepage will have new interactive elements.

**Add** focus-visible test for category cards (new test block following existing pattern):
```typescript
test("Dashboard category cards have visible focus styles", async ({ page: p }) => {
  await p.goto("/");
  await p.waitForLoadState("networkidle");
  const card = p.locator(".category-card").first();
  await card.focus();
  await expect(card).toHaveCSS("outline-style", "solid");
});
```

---

### `tests/e2e/responsive.spec.ts` (test, e2e) — NEW FILE

**Analog:** `tests/e2e/homepage.spec.ts` (same test structure pattern)

**Pattern to follow:**
```typescript
import { test, expect } from "@playwright/test";

test.describe("Dashboard responsive layout", () => {
  test("category cards stack in single column at 768px", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const grid = page.locator(".category-card-grid");
    // Assert grid-template-columns is 1fr (single column)
    await expect(grid).toHaveCSS("grid-template-columns", "1fr");
  });
});
```

---

## Shared Patterns

### Server Component Architecture
**Source:** `app/page.tsx` (current), `components/change-type-catalog.tsx`
**Apply to:** `CategoryCard`, `CategorySection`, `DashboardGrid`, modified `app/page.tsx`

The entire dashboard grid is a Server Component tree. No `"use client"` directive needed. Data is static (compile-time constant `CATEGORIES`). This matches the existing pattern in `components/change-type-catalog.tsx` which is a server component accepting pre-fetched data.

### Card Visual Pattern
**Source:** `app/globals.css` — `.admin-card` (lines 1380-1405), `.change-type-card` (lines 1566-1594), `.cost-card` (lines 640-676)

All cards in the project share a consistent pattern:
- Background: `#fbfcfa` (non-hover), `#fff` (hover)
- Border: `1px solid var(--line)` (non-hover), `var(--accent)` (hover)
- Border-radius: `12px`
- Padding: `24px` (or `20px` for compact variants)
- Transition: `all .15s`
- Hover shadow: `0 2px 12px rgba(15, 109, 85, 0.08)` (change-type-card only)

**The `.category-card` follows this exact pattern** with the addition of an icon area and action link list.

### CSS Grid Layout Pattern
**Source:** `app/globals.css` — `.change-type-catalog` (lines 1559-1564), `.cost-grid` (lines 635-639), `.admin-grid` (lines 1374-1378), `.report-cards` (page.tsx reports/ line 25)

All grids use the same responsive pattern:
```css
grid-template-columns: repeat(auto-fill, minmax(MIN_WIDTH, 1fr));
gap: 16px;
```
With breakpoint at 768px collapsing to `1fr`.

### NavLink Active Styling
**Source:** `app/globals.css` lines 938-940 (existing hover) + new active state

The existing nav link hover uses `color: var(--accent)`. The new active state should use `color: var(--accent-deep)` + `font-weight: 700` to differentiate from hover.

### Ruby Class naming convention
**Source:** All existing components and CSS

The project uses BEM-like lowercase-with-hyphens class names:
- `.change-type-card`, `.change-type-card-header`, `.change-type-card-header h3`
- `.admin-card`, `.admin-grid`
- `.category-card`, `.category-card-icon`, `.category-card-actions`
- `.feedback-trigger`, `.feedback-modal--open` (modifier with double hyphen)

New classes follow this convention: `.dashboard-grid`, `.category-section`, `.category-section-header`, `.category-card-grid`, `.category-card`, `.category-card-icon`, `.category-card-title`, `.category-card-subtitle`, `.category-card-actions`, `.category-card-action`, `.category-card-action-desc`, `.nav-link--active`.

### Path Alias Pattern
All project imports use the `@/` path alias:
- `import { ChangeTypeCard } from "@/components/change-type-card"`
- `import type { ChangeTypeConfig } from "@/lib/types"`
- `import { getAllChangeRequests } from "@/lib/db"`

New files follow the same convention: `@/components/dashboard/...`, `@/lib/dashboard-categories`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/dashboard-icons.tsx` | utility | static | No existing file extracts SVG icons into a dedicated utility. All icons are currently inlined in components. New pattern. |

**Guidance for planner:** Extract 5 simple SVG icon components (e.g., `ClientIcon`, `BenchmarkIcon`, `MonitorIcon`, `ReportIcon`, `SettingsIcon`) — each is 5-15 lines. Take icon paths from existing inline SVGs in the codebase (e.g., the user icon in `app/layout.tsx` lines 27-33) or use standard SVG path patterns from Feather/Pixelarticons style consistent with the project's existing icon aesthetic (thin stroke, rounded caps, 20x20 viewBox).

---

## Metadata

**Analog search scope:** `components/`, `app/`, `lib/`, `tests/e2e/`
**Files scanned:** 14 (all existing components + page.tsx + layout.tsx + globals.css + 3 test files + types.ts + reports page + admin page)
**Pattern extraction date:** 2026-07-26
