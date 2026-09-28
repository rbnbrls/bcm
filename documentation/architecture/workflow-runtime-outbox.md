# Workflow Runtime Outbox

The workflow outbox is the durable delivery boundary for runtime follow-up
work. It separates transactional state changes from side effects such as
engine continuations, notifications and integrations.

`workflow_event` remains the append-only audit source. When the PostgreSQL
runtime appends an event, it also writes an `engine` outbox message in the same
database transaction. If the process crashes after commit but before delivery,
the committed outbox row remains claimable by a later worker.

Outbox messages have four statuses:

- `pending`: available for delivery when `available_at <= now`
- `leased`: claimed by a worker until `lease_expires_at`
- `delivered`: successfully handled exactly once from the runtime point of view
- `dead_letter`: attempts are exhausted and operations must inspect the error

Workers claim one eligible message with `FOR UPDATE SKIP LOCKED`, set a
time-bound lease, and then dispatch to the handler registered for the message
kind. Delivery is idempotent because every message has a unique
`(workflow_instance_id, idempotency_key)` and handlers receive the persisted
message id, target, correlation id and payload.

On transient failure the worker clears the lease, increments `attempt`, stores
`last_error`, and schedules the next `available_at` using the shared bounded
runtime retry policy. When `attempt >= max_attempts`, the message moves to
`dead_letter` instead of being retried forever.

This outbox is generic on purpose:

- `engine` messages are created from runtime audit events.
- `notification` messages are reserved for notification delivery.
- `integration` messages are reserved for external system delivery.

The invariant is: committed workflow progress always has a recoverable delivery
record, and a failed or crashed worker never loses work silently.
