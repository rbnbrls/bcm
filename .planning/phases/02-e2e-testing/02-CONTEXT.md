# Phase 2: E2E Testing — Context

**Gathered:** 2026-07-25
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Set up Playwright-based end-to-end tests covering core user flows for the BCM application.

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
All implementation choices are at the agent's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Vitest is already configured (`vitest.config.ts`)
- Existing test patterns in `tests/` directory (12 test files)
- `lib/fixtures.ts` has demo data used by tests

### Established Patterns
- Tests use Vitest with `globals: true`
- `@/*` path alias for imports
- Server actions tested with form data patterns
- Components tested with source inspection

### Integration Points
- New `tests/e2e/` directory for Playwright tests
- CI pipeline in `.github/workflows/ci.yml` needs Playwright step added

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped.

</deferred>
