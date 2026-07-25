# Milestones

## v1.0 v1.0 (Shipped: 2026-07-25)

**Phases completed:** 4 phases, 13 plans, 6 tasks

**Key accomplishments:**

- CSV format
- Installed Playwright, configured webServer pointing at Next.js dev server (port 3000), created reusable test helpers for E2E navigation and form interaction.
- Created 8 E2E tests covering the full benchmark switch flow (happy path, client selection, SOLL enable/disable, validation) and benchmark catalog browsing (table display, cost cards, asset classes, homepage navigation).
- Created 4 E2E tests for the new benchmark request flow (happy path, validation, shortName check, uppercase transforms) and added an `e2e-test` CI job that installs Chromium and runs all Playwright tests.
- 768px breakpoint

---
