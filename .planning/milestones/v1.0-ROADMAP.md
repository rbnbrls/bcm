# BCM — Business Change Management

## 🚧 Milestone: v1.0 — Launch

### Summary

Process change requests ("benchmark switches") for investment management clients, with a catalog of benchmarks, client configuration, change request tracking, and deployment monitoring.

---

## Phases

### Phase 1: Export Feature

- **Goal**: Implement the export/download button for change request details so users can download a PDF or CSV summary.
- **Plans**: 3 plans
- **Success Criteria**:
  - Export button is functional (not "binnenkort")
  - At least one export format works (CSV or PDF)
  - Export includes IST vs SOLL diff per portfolio
  - Tests for export functionality

Plans:

- [ ] 01-01-PLAN.md — CSV + PDF export API route (server-side generation)
- [ ] 01-02-PLAN.md — Split button UI component wired into detail page
- [ ] 01-03-PLAN.md — Tests for export functionality

### Phase 2: E2E Testing

- **Goal**: Set up Playwright-based end-to-end tests covering core user flows.
- **Plans**: 3/3 plans executed
- **Success Criteria**:
  - Playwright installed and configured
  - E2E test for benchmark switch flow (client select → portfolio → submit)
  - E2E test for benchmark catalog browsing
  - E2E test for new benchmark request flow
  - Tests pass in CI

Plans:

- [x] 02-01-PLAN.md — Playwright setup, configuration, and test infrastructure
- [x] 02-02-PLAN.md — E2E tests for benchmark switch flow + catalog browsing
- [x] 02-03-PLAN.md — E2E test for new benchmark request + CI integration

### Phase 3: UI Polish & Final Touches

- **Goal**: Polish the UI, improve accessibility, and fix any remaining rough edges before launch.
- **Plans**: 3/3 plans executed
- **Success Criteria**:
  - Keyboard navigation works on all pages
  - Sufficient color contrast throughout
  - Mobile responsive layout verified
  - Loading states and error boundaries in place
  - No console errors in production build

Plans:

- [x] 03-01-PLAN.md — ARIA attributes + focus-visible outlines + CSS primitives (skeleton, contrast)
- [x] 03-02-PLAN.md — Loading skeleton files + error boundary files per route group
- [x] 03-03-PLAN.md — Responsive layout + visual polish + a11y audit + console error fixes

### Phase 4: Deployment Hardening

- **Goal**: Harden the deployment pipeline, add monitoring, and ensure production readiness.
- **Plans**: 4/4 plans executed
- **Success Criteria**:
  - Docker image optimized (size, layers)
  - Health checks reliable (no restart loops)
  - Error monitoring/reporting configured
  - Backup strategy for PostgreSQL
  - CI pipeline fast and reliable

Plans:

- [x] 04-01-PLAN.md — Docker optimization + health check endpoint + HEALTHCHECK tuning
- [x] 04-02-PLAN.md — Sentry error monitoring integration
- [x] 04-03-PLAN.md — PostgreSQL backup script + docker-compose backup service
- [x] 04-04-PLAN.md — CI caching + parallel job structure

### Phase 5: Redesign Startpage & Menu

- **Goal**: Redesign the frontpage as a workflow-driven dashboard for the change manager, organizing features by customer journey categories with chronological flow guidance.
- **Plans**: 2/3 plans executed
- **Success Criteria**:
  - Homepage organized by customer journey (pension fund client lifecycle)
  - Feature categories group related functionality
  - User selects their goal → sees relevant next steps
  - Menu updated to match new information architecture
  - Mobile responsive layout maintained
  - E2E tests updated for new dashboard and navigation

Plans:

- [x] 05-01-PLAN.md — Dashboard components (CategoryCard, CategorySection, DashboardGrid) + CATEGORIES constant + SVG icons + CSS + page.tsx rewrite
- [x] 05-02-PLAN.md — NavBar client component with usePathname() active highlighting + layout.tsx update
- [x] 05-03-PLAN.md — E2E test updates for dashboard, navigation, responsive layout, and focus styles
