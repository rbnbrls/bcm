# BCM — Requirements

## Overview

BCM (Business Change Management) is a Dutch-language web application for submitting and tracking investment management change requests ("benchmark switches").

---

## Functional Requirements

### F-01: Benchmark Switch Form
Users can submit a change request to switch a client portfolio's benchmark from IST (current) to SOLL (desired).

**Acceptance Criteria:**
- Client selection from dropdown with search/filter
- Portfolio multi-select with IST benchmark shown per portfolio
- SOLL benchmark selection from catalog or "request new benchmark"
- Cost preview based on benchmark type (existing vs new)
- Validation: SOLL != IST, no duplicate portfolios, client exists
- Submit saves to database and redirects to detail page

### F-02: New Benchmark Request
Users can request a new benchmark not yet in the catalog.

**Acceptance Criteria:**
- Form with short name, long name, asset class fields
- New benchmark created in catalog on submit
- Associated with the change request as a new-benchmark type
- Cost and lead time estimates shown

### F-03: Change Request Detail
Users can view a submitted change request with full details.

**Acceptance Criteria:**
- IST/SOLL diff per portfolio (git-diff style visualization)
- New benchmark specifications shown for new-benchmark type
- Metadata: reference, client, requester, date, rationale, status
- Export button for CSV and PDF download

### F-04: Benchmark Catalog
Users can browse all available benchmarks.

**Acceptance Criteria:**
- Sortable table (code, name, asset class, currency, cost, provider)
- Filterable by column
- Cost summary section

### F-05: Client Config Admin
Users can view client/portfolio/benchmark mappings.

**Acceptance Criteria:**
- Read-only table of all client configurations
- Sortable and filterable columns
- Shows current benchmark per portfolio

### F-06: Updates / Changelog
Users can see recent development activity.

**Acceptance Criteria:**
- Live GitHub commit feed (last 20 commits)
- Commit type badges, Dutch relative timestamps
- Author names and truncated commit messages
- Auto-refreshing Coolify deployment status pill (traffic-light)

### F-07: Feedback Form
Users can submit feedback from anywhere in the app.

**Acceptance Criteria:**
- Floating button (bottom-right)
- Modal with title and description fields
- Creates GitHub issue with `feedback` label
- Uses `GITHUB_TOKEN` for API auth

### F-08: Export (CSV + PDF)
Users can download change request details.

**Acceptance Criteria:**
- Split button: choose CSV or PDF format
- CSV: semicolons, UTF-8 BOM, Dutch headers, CRLF line endings
- PDF: A4 document with IST/SOLL diff table
- Metadata header and per-portfolio data
- Formula injection protection (CWE-1236)

---

## Non-Functional Requirements

### NFR-01: Database Resilience
- Self-healing migration on startup (create missing tables)
- Fixture data fallback when database unavailable
- Schema evolution via `ALTER TABLE ADD COLUMN IF NOT EXISTS`

### NFR-02: Deployment
- Docker multi-stage build with standalone Next.js output
- HEALTHCHECK via `/api/health` endpoint
- PostgreSQL 17 with persistent volume
- Coolify-compatible with Traefik + Let's Encrypt

### NFR-03: CI/CD
- GitHub Actions: lint → test → e2e-test
- Auto-deploy to Coolify on push to main
- Auto-create issues on CI failure with priority labels
- npm + Playwright browser caching

### NFR-04: Monitoring
- Sentry error tracking (client, server, edge)
- Health endpoint with DB connectivity check
- Database backup via pg_dump with retention

### NFR-05: Accessibility
- ARIA attributes on all interactive elements
- Keyboard navigation via visible `:focus-visible` outlines
- Color contrast compliant (accent remediation applied)
- axe-core audit coverage (6 routes)

### NFR-06: Responsive Design
- 768px tablet breakpoint (single column layout)
- 600px mobile breakpoint (compact)
- Touch targets ≥44px (WCAG 2.5.8)
- Print styles hiding navigation

### NFR-07: Security
- CSV formula injection prevention (CWE-1236)
- Content-Disposition header sanitization
- Zod validation on all form inputs
- Foreign key violation detection and user-friendly messaging

---

## Implementation Status

| ID | Name | Status |
|----|------|--------|
| F-01 | Benchmark Switch Form | ✅ Implemented (v1.0) |
| F-02 | New Benchmark Request | ✅ Implemented (v1.0) |
| F-03 | Change Request Detail | ✅ Implemented (v1.0) |
| F-04 | Benchmark Catalog | ✅ Implemented (v1.0) |
| F-05 | Client Config Admin | ✅ Implemented (v1.0) |
| F-06 | Updates / Changelog | ✅ Implemented (v1.0) |
| F-07 | Feedback Form | ✅ Implemented (v1.0) |
| F-08 | Export (CSV + PDF) | ✅ Implemented (v1.0) |
| NFR-01 | Database Resilience | ✅ Implemented (v1.0) |
| NFR-02 | Deployment | ✅ Implemented (v1.0) |
| NFR-03 | CI/CD | ✅ Implemented (v1.0) |
| NFR-04 | Monitoring | ✅ Implemented (v1.0, Sentry DSN needed) |
| NFR-05 | Accessibility | ✅ Implemented (v1.0) |
| NFR-06 | Responsive Design | ✅ Implemented (v1.0) |
| NFR-07 | Security | ✅ Implemented (v1.0) |
