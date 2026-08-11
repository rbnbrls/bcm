# Workflow Runtime calendars, delegation and escalation

Phase 4 adds deterministic business-calendar deadlines for workflow tasks.
Deadlines are calculated at task creation time and stored as both `deadlineAt`
and an immutable audit snapshot in `workflow.task.created`.

## Calendar Contract

Role tasks can configure `deadlineCalendar` together with `deadlineHours`.
The calendar contains:

- UTC business hours;
- ISO working days;
- date-only holidays;
- temporary absences with optional delegate groups;
- stop-the-clock periods with reasons;
- escalation levels by elapsed business hours after the deadline.

The first implementation intentionally supports only `UTC`. That keeps
deadline calculations reproducible while the runtime and audit model settle.

## Deadline Calculation

`calculateWorkflowBusinessDeadline` consumes the task start time, duration and
calendar snapshot. It counts only effective business minutes:

- non-working days are skipped;
- holidays are skipped;
- time outside business hours is skipped;
- stop-the-clock periods pause the counter.

The resulting `deadlineAt` is written to the task. The full normalized policy
is copied into the task-created audit event, so later calendar edits never
change an existing task's deadline silently.

## Delegation And Escalation

Timer processing first tries to recover the original calendar from the
`workflow.task.created` event. If present, reminders and escalations use that
snapshot rather than current settings.

Delegation adds delegate groups to the recipients while preserving the original
assignee group. Escalation levels are activated by elapsed business hours after
the stored deadline. If a task has no calendar snapshot or matching escalation
level, the legacy fallback escalation group is still used.

Every queued timer event records delegated state, delegate groups, escalation
groups and recipient groups for audit reconstruction.
