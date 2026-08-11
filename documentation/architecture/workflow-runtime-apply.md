# Workflow Runtime Apply

`WorkflowRuntimeEngine.applyChangeIntent` is the final runtime boundary before a
validated change intent can mutate governed client-config state.

The apply command locks the workflow instance, loads the target
`workflow_change_intent` within that instance, and only accepts intents in
`validated` or `approved` status. The persisted payload and preconditions are
converted back into the versioned mutation contract; free-form SQL, table names
or column names are never accepted at this layer.

Immediately before invoking an apply adapter, the runtime runs the mutation
dry-run contract again against the current client-config snapshot. This is the
authoritative conflict check for stale workflow data:

- a changed concurrency token yields `workflow_change_intent.status =
  'conflicted'`
- a failed IST assertion yields `workflow_change_intent.status = 'conflicted'`
- invalid or unauthorized intents yield `workflow_change_intent.status =
  'failed'`
- the apply adapter is not called unless the final dry-run status is `ready`

Blocked applies append `workflow.change_intent.apply_blocked` with the issue
codes and `requiresReloadAndReapproval = true` for conflicts. This gives the UI
an explicit recovery path: reload the source data, materialize a fresh intent,
and route that fresh intent through approval again.

Ready intents are handed to the registered mutation apply adapter with runtime
lineage: instance id, version id, node instance id, intent id, actor,
correlation id and causation id. The store persists the adapter result, maps it
to the runtime intent status, and records approval/apply timestamps in the same
transaction that writes the audit event.

The invariant is simple: a stale or invalid intent never reaches the apply
adapter, so conflicts cannot silently overwrite current client-config data.
