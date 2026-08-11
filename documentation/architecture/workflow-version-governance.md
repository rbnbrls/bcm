# Workflow Version Governance

Phase 4 extends the existing review diff with semantic impact analysis and a
rollback draft helper.

## Semantic Diff

`createWorkflowReviewDiff` still reports stable metadata, node, edge and role
binding changes. `analyzeWorkflowVersionImpact` adds governance flags for
changes that need explicit reviewer attention:

- fewer approval nodes;
- broader role binding client scope;
- changed change-intent surface;
- changed integration connectors or operations;
- active instances on impacted versions.

These flags are deterministic and derived only from immutable version
snapshots plus the caller-provided active instance counts.

## Dependency Graph

The impact analysis includes:

- subworkflow references that point at the current or baseline version;
- integration connector dependencies used by the current version.

This gives reviewers a single dependency view before deprecating, replacing or
rolling back a version.

## Rollback

`prepareWorkflowRollbackDraft` converts an immutable previous version snapshot
into a new draft input. It preserves scope, metadata, nodes, edges and role
bindings, and adds rollback origin tags such as:

```text
rollback
rollback-source:<workflowVersionId>
```

Publishing remains the normal guarded publish path. Rollback therefore creates
a new immutable version instead of mutating historical content.
