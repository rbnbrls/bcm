# Change Type Management Improvement Plan

> Historical note: this plan describes the retired `change_type_config` admin UI.
> BCM now uses Workflow Studio for authoring, publication and runtime start, and
> keeps `change_type_config` only as compatibility metadata for existing
> requests, migrations and cutover checks. Do not add new `/admin/change-types`
> routes or JSON editors; use `/workflow-studio` and the published
> `/change-catalog` instead.

## Goal

Make every change process manageable from `/admin/change-types`, reduce duplicated change request logic, and keep workflow routing explicit through a small catalog of reusable templates.

## Completed Tasks

1. Add a dedicated change type boundary
   - Added `lib/change-types/repository.ts` as the single import surface for admin and request code.
   - Added `lib/change-types/schema.ts` for validating editable definitions and JSON form blocks.
   - Added `lib/change-types/request.ts` for shared estimate and mandatory stakeholder assignment logic.

2. Introduce workflow templates
   - Added `lib/change-types/templates.ts` with explicit form kinds, apply strategies, and process templates.
   - Mapped benchmark, lookup, client onboarding, and portfolio configuration flows to stable template IDs.
   - Reused the registry in catalog routing and backend processing.

3. Make change definitions editable by administrators
   - Added `/admin/change-types/[id]`.
   - Added an admin form for editing basisgegevens, workflow template, cost model, lead time, fields, IST/SOLL mapping, stakeholders, and process flow.
   - Linked change type names in `/admin/change-types` to the new admin detail page.

4. Centralize request creation helpers
   - Updated generic, benchmark, portfolio, and client onboarding server actions to use the shared request helpers.
   - Removed repeated cost estimation and mandatory stakeholder mapping code from those actions.

5. Extend verification coverage
   - Added unit coverage for full change type definition saves and validation failures.
   - Added workflow template tests for dedicated request flows and portfolio lifecycle mappings.
   - Updated E2E navigation expectations for the new admin detail route.

## Remaining Follow-Up Tasks

1. Move default change type seed data out of `lib/db.ts`
   - Keep database access in `lib/db.ts`.
   - Move static catalog definitions to a dedicated seed/catalog module.
   - Preserve existing exports temporarily through `lib/change-types/repository.ts` to avoid a broad migration.

2. Add versioning for change type definitions
   - Store historical definitions when administrators change fields, workflow, stakeholders, or process flow.
   - Keep existing open changes pinned to the definition version they were created with.

3. Add structured editors for JSON blocks
   - Replace raw JSON textareas with field rows, stakeholder rows, and process step controls.
   - Keep JSON validation as the server-side safety net.

4. Add production smoke coverage
   - Add an admin smoke test that opens an existing change type, edits a harmless field, saves, and verifies persistence against a test database.
   - Add a route inventory test for public/admin links that are rendered from the application shell.

## Verification

- `npx vitest run tests/change-type-catalog.test.ts tests/actions/change-type-admin.test.ts tests/actions/generic-change.test.ts tests/actions/portfolio-addition-actions.test.ts tests/actions/client-onboarding-actions.test.ts --reporter=dot`
- `npx playwright test tests/e2e/admin-extended.spec.ts --project=chromium --grep "change type names link|page loads with heading" --reporter=line`
