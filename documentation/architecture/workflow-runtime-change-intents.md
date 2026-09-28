# Workflow Runtime Change Intents

`change_request` nodes materialize governed mutation intents. They never write
directly to live client-config tables.

The runtime handler requires a claimed `change_request` node in `running` state.
It reloads the pinned workflow version, validates the node configuration, and
resolves all mapped values from persisted runtime variables.

For `UPDATE` and `RETIRE`, IST mappings must reference snapshot variables
created by lookup execution. The handler reloads the referenced
`workflow_data_snapshot` by id inside the same instance and uses it for both
the mutation precondition and audit lineage. A single change-request node may
use one source snapshot in this MVP runtime slice.

The handler builds a versioned `WorkflowChangeIntent`, then calls the closed
mutation adapter dry-run service. A ready dry-run is persisted in
`workflow_change_intent` with status `validated` and a staging reference to the
governed stage handler. Conflicted or invalid dry-runs are also persisted with
their dry-run result and issue codes, but no successor node is activated.

Successful materialization appends `workflow.change_intent.materialized` with:

- intent id
- node key
- adapter id
- resource and operation
- dry-run status
- stage handler and staging reference when ready
- source snapshot id when present
- dry-run issue codes

Concrete apply and final conflict checks remain separate runtime steps.
