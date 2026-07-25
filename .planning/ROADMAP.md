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
- **Plans**: 3 plans
- **Success Criteria**:
  - Keyboard navigation works on all pages
  - Sufficient color contrast throughout
  - Mobile responsive layout verified
  - Loading states and error boundaries in place
  - No console errors in production build

Plans:

- [ ] 03-01-PLAN.md — ARIA attributes + focus-visible outlines + CSS primitives (skeleton, contrast)
- [ ] 03-02-PLAN.md — Loading skeleton files + error boundary files per route group
- [ ] 03-03-PLAN.md — Responsive layout + visual polish + a11y audit + console error fixes

### Phase 4: Deployment Hardening

- **Goal**: Harden the deployment pipeline, add monitoring, and ensure production readiness.
- **Success Criteria**:
  - Docker image optimized (size, layers)
  - Health checks reliable (no restart loops)
  - Error monitoring/reporting configured
  - Backup strategy for PostgreSQL
  - CI pipeline fast and reliable
