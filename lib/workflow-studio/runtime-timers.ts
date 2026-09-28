import { randomUUID } from "node:crypto";

import type {
  WorkflowEngineEvent,
  WorkflowRuntimeStore,
  WorkflowTaskRecord,
} from "@/lib/workflow-studio/runtime-engine";
import type { WorkflowRuntimeActor } from "@/lib/workflow-studio/runtime-state-machine";
import {
  delegationForWorkflowTask,
  escalationGroupsForWorkflowTask,
  workflowBusinessCalendarSchema,
  type WorkflowBusinessCalendar,
} from "@/lib/workflow-studio/runtime-calendar";

export type WorkflowTimerDeliveryType = "deadline_reminder" | "deadline_escalation";

export type WorkflowTimerDueItem = Readonly<{
  task: WorkflowTaskRecord;
  dueDate: string;
  deliveryType: WorkflowTimerDeliveryType;
  escalationGroups: readonly string[];
  recipientGroups: readonly string[];
  delegated: boolean;
  delegateGroups: readonly string[];
  idempotencyKey: string;
}>;

export type WorkflowTimerServiceResult = Readonly<{
  scannedTasks: number;
  queued: number;
  deduplicated: number;
  dueItems: readonly WorkflowTimerDueItem[];
  events: readonly WorkflowEngineEvent[];
}>;

export type WorkflowTimerServiceOptions = Readonly<{
  escalationGroup?: string;
  maxCatchUpDays?: number;
  calendar?: WorkflowBusinessCalendar;
}>;

const DEFAULT_ESCALATION_GROUP = "bcm:role:change_manager";

function dayStartUtc(value: string): number {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Ongeldig timer-tijdstip: ${value}.`);
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function workflowTimerDueItemsForTask(
  task: WorkflowTaskRecord,
  now: string,
  options: WorkflowTimerServiceOptions = {},
): readonly WorkflowTimerDueItem[] {
  if (!task.deadlineAt || !["open", "claimed"].includes(task.status)) return [];
  const deadlineDay = dayStartUtc(task.deadlineAt);
  const nowDay = dayStartUtc(now);
  if (deadlineDay > nowDay) return [];
  const maxCatchUpDays = options.maxCatchUpDays ?? 31;
  const days = Math.min(Math.floor((nowDay - deadlineDay) / 86_400_000), maxCatchUpDays - 1);
  const delegation = delegationForWorkflowTask({ assigneeGroup: task.assigneeGroup, at: now, ...(options.calendar ? { calendar: options.calendar } : {}) });
  const escalationGroups = escalationGroupsForWorkflowTask({ deadlineAt: task.deadlineAt, now, ...(options.calendar ? { calendar: options.calendar } : {}) });
  const items: WorkflowTimerDueItem[] = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const dueDate = dateKey(deadlineDay + offset * 86_400_000);
    const deliveryType: WorkflowTimerDeliveryType = offset === 0 ? "deadline_reminder" : "deadline_escalation";
    const effectiveEscalationGroups = deliveryType === "deadline_escalation"
      ? (escalationGroups.length > 0 ? escalationGroups : [options.escalationGroup ?? DEFAULT_ESCALATION_GROUP])
      : [];
    items.push({
      task,
      dueDate,
      deliveryType,
      escalationGroups: Object.freeze(effectiveEscalationGroups),
      recipientGroups: Object.freeze([...new Set([
        ...delegation.recipientGroups,
        ...effectiveEscalationGroups,
      ])]),
      delegated: delegation.delegated,
      delegateGroups: delegation.delegateGroups,
      idempotencyKey: `timer:${task.id}:${dueDate}:${deliveryType}`,
    });
  }
  return Object.freeze(items);
}

function calendarFromTaskCreatedEvent(events: readonly WorkflowEngineEvent[], taskId: string): WorkflowBusinessCalendar | undefined {
  const created = [...events].reverse().find((event) => event.eventType === "workflow.task.created" && event.payload.taskId === taskId);
  const policy = created?.payload.deadlinePolicy;
  if (!policy || typeof policy !== "object" || !("calendar" in policy)) return undefined;
  const parsed = workflowBusinessCalendarSchema.safeParse((policy as { calendar?: unknown }).calendar);
  return parsed.success ? parsed.data : undefined;
}

export class WorkflowRuntimeTimerService {
  constructor(
    private readonly store: WorkflowRuntimeStore,
    private readonly options: WorkflowTimerServiceOptions = {},
  ) {}

  async processDueTasks(input: Readonly<{
    now: string;
    workerId: string;
    correlationId: string;
    actor?: WorkflowRuntimeActor;
  }>): Promise<WorkflowTimerServiceResult> {
    return this.store.transaction(async (tx) => {
      const actor = input.actor ?? { type: "system" as const, id: input.workerId };
      const tasks = await tx.listOverdueTasks(input.now);
      const instanceEvents = new Map<string, readonly WorkflowEngineEvent[]>();
      const dueItems = [];
      for (const task of tasks) {
        const events = instanceEvents.get(task.instanceId) ?? await tx.listEvents(task.instanceId);
        instanceEvents.set(task.instanceId, events);
        dueItems.push(...workflowTimerDueItemsForTask(task, input.now, {
          ...this.options,
          calendar: calendarFromTaskCreatedEvent(events, task.id) ?? this.options.calendar,
        }));
      }
      const events: WorkflowEngineEvent[] = [];
      let queued = 0;
      let deduplicated = 0;

      for (const item of dueItems) {
        const existing = await tx.findCommandEvent(item.task.instanceId, `${item.idempotencyKey}:event`);
        if (existing) {
          deduplicated += 1;
          events.push(existing);
          continue;
        }
        const recipients = item.recipientGroups.map((identityGroup) => ({
          workflowRole: identityGroup === item.task.assigneeGroup ? item.task.workflowRole : "escalation",
          identityGroup,
        }));
        const outbox = await tx.enqueueOutbox({
          id: randomUUID(),
          workflowInstanceId: item.task.instanceId,
          workflowNodeInstanceId: item.task.nodeInstanceId,
          kind: "notification",
          target: "in_app",
          payload: {
            timerType: item.deliveryType,
            dueDate: item.dueDate,
            taskId: item.task.id,
            taskTitle: item.task.title,
            workflowRole: item.task.workflowRole,
            assigneeGroup: item.task.assigneeGroup,
            deadlineAt: item.task.deadlineAt,
            delegated: item.delegated,
            delegateGroups: item.delegateGroups,
            escalationGroups: item.escalationGroups,
            recipients,
            links: {
              task: `/tasks?taskId=${encodeURIComponent(item.task.id)}`,
              instance: `/workflow-runtime/${item.task.instanceId}`,
            },
          },
          idempotencyKey: item.idempotencyKey,
          correlationId: input.correlationId,
          causationId: item.task.idempotencyKey,
          availableAt: input.now,
        });
        if (outbox.created) queued += 1;
        else deduplicated += 1;
        events.push(await tx.appendEvent({
          instanceId: item.task.instanceId,
          nodeInstanceId: item.task.nodeInstanceId,
          eventType: "workflow.timer.notification_queued",
          eventVersion: 1,
          payload: {
            taskId: item.task.id,
            dueDate: item.dueDate,
            deliveryType: item.deliveryType,
            outboxMessageId: outbox.message.id,
            recipientGroups: recipients.map((recipient) => recipient.identityGroup),
            delegated: item.delegated,
            escalationGroups: item.escalationGroups,
            created: outbox.created,
          },
          actor,
          idempotencyKey: `${item.idempotencyKey}:event`,
          correlationId: input.correlationId,
          causationId: item.task.idempotencyKey,
          occurredAt: input.now,
        }));
      }

      return {
        scannedTasks: tasks.length,
        queued,
        deduplicated,
        dueItems,
        events,
      };
    });
  }
}
