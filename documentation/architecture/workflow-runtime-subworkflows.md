# Workflow Runtime subworkflows

Phase 4 introduces reusable workflow fragments through an explicit
`subworkflow` block. The block references an immutable child workflow version;
it never points at a mutable draft or "latest" alias.

## Contract

`subworkflow` configuration contains:

- `childWorkflowVersionId`: pinned child workflow version UUID;
- `pinnedVersionLabel`: optional human label for the pinned version;
- `inputMappings`: parent variable to child variable mappings;
- `outputMappings`: child variable to parent variable mappings;
- `nestingDepth`: declared nesting depth, capped at 3.

Mappings are explicit and duplicate-safe. Parent input variables count as
readers in the validator. Parent output variables count as writers, so normal
duplicate data mapping rules prevent two blocks from writing the same parent
variable.

## Validation

The block registry exposes the contract and UI metadata as a normal versioned
block. The static validator additionally blocks direct self-reference when the
current parent `workflowVersionId` is known. The Zod contract enforces pinned
version shape, mapping identifier shape, duplicate mapping prevention and the
nesting limit.

The runtime graph remains acyclic. Complex reuse is therefore modeled as
versioned child references rather than loops.

## Impact Analysis

Impact analysis scans workflow version snapshots for `subworkflow` nodes and
reports every parent version that references a given child version. The report
includes parent definition id, name, slug, version id, version number, status,
node key, mapping counts and declared nesting depth.

This is the governance basis for fragment upgrades: before replacing or
deprecating a fragment version, Studio can show exactly which workflows still
pin that version.
