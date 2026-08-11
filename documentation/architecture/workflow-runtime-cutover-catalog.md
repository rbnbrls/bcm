# Workflow runtime cutover catalog

Active change types no longer treat the legacy `workflow` text value as the
runtime routing source. `change_type_config.workflow` remains a compatibility
template label for historical requests and classic detail renderers; runtime
start routing uses `change_type_config.workflow_version_id`.

## Contract

- Every active change type must have `workflow_version_id` set.
- `workflow_version_id` must reference a `workflow_version` row whose status is
  `published`.
- The change catalog may route a card to `/workflow-runtime/{versionId}/start`
  only after the runtime start service confirms the version is startable for
  the current identity and cutover policy.
- Inactive or historical configs may omit `workflow_version_id`; those are
  compatibility readers only and do not create new active runtime traffic.
- Classic form/action/apply code remains available while a config is blocked or
  while a published workflow is explicitly in rollback/fallback, but the cutover
  audit reports those cases as release blockers for G4.

## Verification

`tests/change-type-runtime-cutover.test.ts` verifies runtime routing,
missing-version blockers, unpublished-version blockers, inactive compatibility
mode and the schema-level foreign key/index. The catalog page also computes the
same audit and exposes a status message when an active change type still lacks a
valid published workflow version.
