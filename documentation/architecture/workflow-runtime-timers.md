# Workflow Runtime Timers

Runtime timers are processed by a worker service, not by browser requests. The
first implementation focuses on human task deadlines and calendar-day catch-up.

`WorkflowRuntimeTimerService` scans open or claimed tasks whose `deadline_at` is
at or before the worker timestamp. For each overdue task it derives due items
from calendar days:

- the deadline day queues one `deadline_reminder`
- every later missed calendar day queues one `deadline_escalation`

Each due item has an idempotency key containing task id, calendar date and
delivery type. Running the timer worker again, or recovering after downtime,
therefore catches up missed days without creating duplicate reminders.

Timer delivery uses `workflow_outbox` with message kind `notification`. Reminder
messages target the task assignee group. Escalation messages include both the
task assignee group and the configured escalation group; the MVP default is
`bcm:role:change_manager`.

Every queued timer also appends `workflow.timer.notification_queued` with task
id, due date, delivery type, recipient groups and outbox message id. Delivery
retries, leases and dead letters are handled by the durable outbox worker.

The timer worker ignores completed/cancelled/expired tasks and future
deadlines. This keeps human completion authoritative: finishing a task before a
catch-up run prevents further reminders.
