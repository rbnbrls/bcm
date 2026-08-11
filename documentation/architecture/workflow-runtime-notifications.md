# Workflow Runtime Notifications

Notification nodes are automated runtime steps. They queue delivery work; they
do not deliver synchronously inside the workflow transaction.

When a `notification` node is running, the runtime reloads the pinned published
node configuration and validates it with the notification schema. Recipient
roles are resolved through the immutable workflow role bindings. A recipient
may be a task role or an approval role, so the runtime accepts bindings with
`workflow:tasks:execute` or `workflow:approve`.

Templates are rendered only through the safe notification renderer:

- placeholders must be declared as template variables
- undeclared or missing variables fail closed before delivery is queued
- values are HTML-escaped before they enter subject or message content
- rendered subject and message length limits are enforced

Successful rendering writes a `notification` message to `workflow_outbox` with
the rendered subject, rendered message, channel, trigger, recipient roles,
recipient groups and a link to the workflow instance. The same transaction
appends `workflow.notification.queued`, then marks the node succeeded and
activates successors.

Delivery attempts are auditable through the outbox delivery log: status,
attempt, max attempts, lease owner, lease expiry, delivery timestamp,
dead-letter timestamp and last error. Transient delivery failure is retried by
the outbox worker. Exhausted or poison messages move to `dead_letter`.

The workflow only blocks when the notification definition or rendering is
invalid. Once a valid message has been queued, delivery failure does not roll
back or block process routing unless a later workflow version explicitly adds a
separate blocking confirmation step.
