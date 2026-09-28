import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeOfDay = z.string().regex(/^\d{2}:\d{2}$/);
const identityGroup = z.string().regex(/^bcm:[a-zA-Z0-9_:-]+$/);

export const workflowBusinessCalendarSchema = z.object({
  timezone: z.literal("UTC").default("UTC"),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5]),
  businessHours: z.object({
    start: timeOfDay.default("09:00"),
    end: timeOfDay.default("17:00"),
  }).strict().default({ start: "09:00", end: "17:00" }),
  holidays: z.array(dateOnly).max(366).default([]),
  absences: z.array(z.object({
    identityGroup,
    from: z.string().datetime(),
    until: z.string().datetime(),
    delegateToGroup: identityGroup.optional(),
  }).strict()).max(500).default([]),
  stopClockPeriods: z.array(z.object({
    from: z.string().datetime(),
    until: z.string().datetime(),
    reason: z.string().trim().min(1).max(200),
  }).strict()).max(100).default([]),
  escalationLevels: z.array(z.object({
    afterBusinessHours: z.number().int().positive().max(8_760),
    identityGroup,
  }).strict()).max(10).default([]),
}).strict().superRefine((calendar, ctx) => {
  const start = minutesOfDay(calendar.businessHours.start);
  const end = minutesOfDay(calendar.businessHours.end);
  if (start >= end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["businessHours", "end"], message: "Eindtijd moet na starttijd liggen." });
  }
  const workingDays = new Set<number>();
  calendar.workingDays.forEach((day, index) => {
    if (workingDays.has(day)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workingDays", index], message: "Werkdag is dubbel ingesteld." });
    workingDays.add(day);
  });
  const holidays = new Set<string>();
  calendar.holidays.forEach((holiday, index) => {
    if (holidays.has(holiday)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["holidays", index], message: "Feestdag is dubbel ingesteld." });
    holidays.add(holiday);
  });
  calendar.absences.forEach((absence, index) => {
    if (Date.parse(absence.from) >= Date.parse(absence.until)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["absences", index, "until"], message: "Afwezigheid moet na de start eindigen." });
    }
  });
  calendar.stopClockPeriods.forEach((period, index) => {
    if (Date.parse(period.from) >= Date.parse(period.until)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stopClockPeriods", index, "until"], message: "Stop-the-clockperiode moet na de start eindigen." });
    }
  });
});

export type WorkflowBusinessCalendar = z.infer<typeof workflowBusinessCalendarSchema>;

export type WorkflowDeadlineSnapshot = Readonly<{
  startedAt: string;
  durationHours: number;
  deadlineAt: string;
  calendar: WorkflowBusinessCalendar;
}>;

export type WorkflowDelegationDecision = Readonly<{
  assigneeGroup: string;
  recipientGroups: readonly string[];
  delegated: boolean;
  delegateGroups: readonly string[];
}>;

const DEFAULT_CALENDAR = workflowBusinessCalendarSchema.parse({});

function minutesOfDay(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoDay(value: Date): number {
  const day = value.getUTCDay();
  return day === 0 ? 7 : day;
}

function normalizeCalendar(input: WorkflowBusinessCalendar | undefined): WorkflowBusinessCalendar {
  const parsed = workflowBusinessCalendarSchema.parse(input ?? {});
  return {
    ...parsed,
    workingDays: [...new Set(parsed.workingDays)].sort((left, right) => left - right),
    holidays: [...new Set(parsed.holidays)].sort(),
    absences: [...parsed.absences].sort((left, right) => left.identityGroup.localeCompare(right.identityGroup) || left.from.localeCompare(right.from)),
    stopClockPeriods: [...parsed.stopClockPeriods].sort((left, right) => left.from.localeCompare(right.from)),
    escalationLevels: [...parsed.escalationLevels].sort((left, right) => left.afterBusinessHours - right.afterBusinessHours || left.identityGroup.localeCompare(right.identityGroup)),
  };
}

function isInsidePeriod(value: number, period: { from: string; until: string }): boolean {
  return value >= Date.parse(period.from) && value < Date.parse(period.until);
}

function isBusinessMinute(value: Date, calendar: WorkflowBusinessCalendar): boolean {
  const timestamp = value.getTime();
  if (!calendar.workingDays.includes(isoDay(value))) return false;
  if (calendar.holidays.includes(isoDate(value))) return false;
  if (calendar.stopClockPeriods.some((period) => isInsidePeriod(timestamp, period))) return false;
  const minute = value.getUTCHours() * 60 + value.getUTCMinutes();
  return minute >= minutesOfDay(calendar.businessHours.start) && minute < minutesOfDay(calendar.businessHours.end);
}

export function calculateWorkflowBusinessDeadline(input: Readonly<{
  startedAt: string;
  durationHours: number;
  calendar?: WorkflowBusinessCalendar;
}>): WorkflowDeadlineSnapshot {
  if (!Number.isInteger(input.durationHours) || input.durationHours <= 0) {
    throw new Error("Deadline durationHours moet een positief geheel getal zijn.");
  }
  const calendar = normalizeCalendar(input.calendar ?? DEFAULT_CALENDAR);
  const startMs = Date.parse(input.startedAt);
  if (!Number.isFinite(startMs)) throw new Error(`Ongeldige deadline-start: ${input.startedAt}.`);
  let cursor = new Date(startMs);
  let remainingMinutes = input.durationHours * 60;
  const guardLimit = remainingMinutes + 5 * 366 * 24 * 60;
  let guard = 0;
  while (remainingMinutes > 0) {
    if (isBusinessMinute(cursor, calendar)) remainingMinutes -= 1;
    cursor = new Date(cursor.getTime() + 60_000);
    guard += 1;
    if (guard > guardLimit) throw new Error("Deadline kon niet binnen de kalenderlimiet worden berekend.");
  }
  return Object.freeze({
    startedAt: input.startedAt,
    durationHours: input.durationHours,
    deadlineAt: cursor.toISOString(),
    calendar,
  });
}

export function businessMinutesBetween(input: Readonly<{
  from: string;
  until: string;
  calendar?: WorkflowBusinessCalendar;
}>): number {
  const calendar = normalizeCalendar(input.calendar ?? DEFAULT_CALENDAR);
  const from = Date.parse(input.from);
  const until = Date.parse(input.until);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return 0;
  let cursor = new Date(from);
  let minutes = 0;
  while (cursor.getTime() < until) {
    if (isBusinessMinute(cursor, calendar)) minutes += 1;
    cursor = new Date(cursor.getTime() + 60_000);
  }
  return minutes;
}

export function delegationForWorkflowTask(input: Readonly<{
  assigneeGroup: string;
  at: string;
  calendar?: WorkflowBusinessCalendar;
}>): WorkflowDelegationDecision {
  const calendar = normalizeCalendar(input.calendar ?? DEFAULT_CALENDAR);
  const at = Date.parse(input.at);
  const delegateGroups = calendar.absences
    .filter((absence) => absence.identityGroup === input.assigneeGroup && isInsidePeriod(at, absence) && absence.delegateToGroup)
    .map((absence) => absence.delegateToGroup!)
    .sort();
  const recipientGroups = [...new Set([input.assigneeGroup, ...delegateGroups])];
  return Object.freeze({
    assigneeGroup: input.assigneeGroup,
    recipientGroups: Object.freeze(recipientGroups),
    delegated: delegateGroups.length > 0,
    delegateGroups: Object.freeze([...new Set(delegateGroups)]),
  });
}

export function escalationGroupsForWorkflowTask(input: Readonly<{
  deadlineAt: string;
  now: string;
  calendar?: WorkflowBusinessCalendar;
}>): readonly string[] {
  const calendar = normalizeCalendar(input.calendar ?? DEFAULT_CALENDAR);
  const elapsedHours = Math.floor(businessMinutesBetween({ from: input.deadlineAt, until: input.now, calendar }) / 60);
  return Object.freeze(calendar.escalationLevels
    .filter((level) => level.afterBusinessHours <= elapsedHours)
    .map((level) => level.identityGroup));
}
