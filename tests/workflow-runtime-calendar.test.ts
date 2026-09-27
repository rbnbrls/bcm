import { describe, expect, it } from "vitest";

import {
  businessMinutesBetween,
  calculateWorkflowBusinessDeadline,
  delegationForWorkflowTask,
  escalationGroupsForWorkflowTask,
  type WorkflowBusinessCalendar,
} from "@/lib/workflow-studio";

const calendar: WorkflowBusinessCalendar = {
  timezone: "UTC",
  workingDays: [1, 2, 3, 4, 5],
  businessHours: { start: "09:00", end: "17:00" },
  holidays: ["2026-08-12"],
  absences: [{
    identityGroup: "bcm:role:account_manager",
    from: "2026-08-11T00:00:00.000Z",
    until: "2026-08-13T00:00:00.000Z",
    delegateToGroup: "bcm:role:operations",
  }],
  stopClockPeriods: [{
    from: "2026-08-11T12:00:00.000Z",
    until: "2026-08-11T14:00:00.000Z",
    reason: "Wachten op externe bevestiging",
  }],
  escalationLevels: [
    { afterBusinessHours: 2, identityGroup: "bcm:role:teamlead" },
    { afterBusinessHours: 8, identityGroup: "bcm:role:operations" },
  ],
};

describe("workflow runtime business calendars", () => {
  it("calculates reproducible deadlines over business hours, holidays and stop-the-clock periods", () => {
    const result = calculateWorkflowBusinessDeadline({
      startedAt: "2026-08-11T10:00:00.000Z",
      durationHours: 6,
      calendar,
    });

    expect(result.deadlineAt).toBe("2026-08-13T10:00:00.000Z");
    expect(result.calendar).toEqual(calendar);
  });

  it("counts only effective business minutes between two timestamps", () => {
    expect(businessMinutesBetween({
      from: "2026-08-13T10:00:00.000Z",
      until: "2026-08-13T13:30:00.000Z",
      calendar,
    })).toBe(210);
  });

  it("resolves temporary delegation during absence windows", () => {
    expect(delegationForWorkflowTask({
      assigneeGroup: "bcm:role:account_manager",
      at: "2026-08-11T10:00:00.000Z",
      calendar,
    })).toMatchObject({
      delegated: true,
      recipientGroups: ["bcm:role:account_manager", "bcm:role:operations"],
      delegateGroups: ["bcm:role:operations"],
    });
  });

  it("activates escalation levels by elapsed business hours", () => {
    expect(escalationGroupsForWorkflowTask({
      deadlineAt: "2026-08-13T10:00:00.000Z",
      now: "2026-08-13T13:30:00.000Z",
      calendar,
    })).toEqual(["bcm:role:teamlead"]);
  });
});
