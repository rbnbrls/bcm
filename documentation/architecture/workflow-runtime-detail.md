# Workflow Runtime Detail

The runtime detail view is a support read model for reconstructing a workflow
instance without ad hoc database queries.

`WorkflowRuntimeDetailService` loads the immutable runtime context for one
instance:

- instance status, scope, start/completion and error metadata
- all node attempts, including active and retryable attempts
- human tasks and deadlines
- data snapshots and selected fields
- change intents, dry-run results and apply results
- decision and approval audit summaries
- full ordered `workflow_event` timeline
- durable outbox delivery state and dead-letter errors

The page at `/workflow-runtime/[instanceId]` is server-rendered behind the
runtime feature flag and an explicit `workflow:view` permission check. It links
from `/tasks`, so users can move from a task to the full instance context.

Retry actions are exposed only for node attempts in `failed` or
`needs_intervention` while `attempt < maxAttempts`. The action uses the runtime
state machine's `retry_node` command, creating a new durable node attempt with a
fresh command id and audit event.

The view is diagnostic: it surfaces payload JSON for auditability, but all
mutating behavior still goes through runtime commands and existing permission
checks.
