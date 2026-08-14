import { describe, expect, it } from "vitest";

import {
  WorkflowRuntimeDashboardService,
  type WorkflowRuntimeDashboardDeadLetter,
  type WorkflowRuntimeDashboardReader,
  type WorkflowRuntimeDashboardStatusCounts,
  type WorkflowRuntimeDashboardTask,
} from "@/lib/workflow-studio/runtime-dashboard";

const zeroCounts: WorkflowRuntimeDashboardStatusCounts = Object.freeze({
  active: 0,
  waiting: 0,
  blocked: 0,
  failed: 0,
});

function task(overrides: Partial<WorkflowRuntimeDashboardTask> = {}): WorkflowRuntimeDashboardTask {
  return {
    workflowName: "Benchmark switch",
    workflowVersionId: "version-1",
    versionNumber: 7,
    nodeKey: "approval-am",
    blockType: "approval",
    taskId: "task-1",
    instanceId: "instance-1",
    title: "Controleer wijziging",
    status: "open",
    workflowRole: "account_manager",
    assigneeGroup: "bcm:role:account_manager",
    createdAt: "2026-08-10T08:00:00.000Z",
    deadlineAt: "2026-08-11T08:00:00.000Z",
    ageMinutes: 1440,
    overdueMinutes: 90,
    ...overrides,
  };
}

function deadLetter(overrides: Partial<WorkflowRuntimeDashboardDeadLetter> = {}): WorkflowRuntimeDashboardDeadLetter {
  return {
    workflowName: "Benchmark switch",
    workflowVersionId: "version-1",
    versionNumber: 7,
    nodeKey: "notify-requester",
    blockType: "notification",
    messageId: "message-1",
    instanceId: "instance-1",
    kind: "notification",
    target: "workflow-notification",
    attempt: 3,
    maxAttempts: 3,
    deadLetterAt: "2026-08-11T09:00:00.000Z",
    lastError: "Provider unavailable",
    ...overrides,
  };
}

class MemoryDashboardReader implements WorkflowRuntimeDashboardReader {
  async countInstances() { return { ...zeroCounts, active: 3, blocked: 1 }; }
  async countNodes() { return { ...zeroCounts, waiting: 2, failed: 1 }; }
  async listOldestTasks() { return [task({ taskId: "oldest-task", ageMinutes: 240 })]; }
  async listOverdueTasks() { return [task()]; }
  async listDeadLetters() { return [deadLetter()]; }
  async listAdapterErrors() {
    return [{
      workflowName: "Benchmark switch",
      workflowVersionId: "version-1",
      versionNumber: 7,
      nodeKey: "change-request",
      blockType: "change_request",
      intentId: "intent-1",
      instanceId: "instance-1",
      adapterId: "portfolio-config-adapter",
      resourceId: "portfolio_configuration",
      operation: "UPDATE" as const,
      status: "failed" as const,
      errorCode: "CONFLICT",
      errorMessage: "Concurrency conflict",
      updatedAt: "2026-08-11T09:30:00.000Z",
    }];
  }
  async listCatalogChangeMetrics() {
    return [{
      resourceId: "portfolio_configuration",
      operation: "UPDATE" as const,
      status: "applied",
      count: 2,
    }];
  }
  async listRecentCatalogChanges() {
    return [{
      workflowName: "Portfolio configuration update",
      workflowVersionId: "version-2",
      versionNumber: 3,
      nodeKey: "change-request",
      blockType: "change_request",
      intentId: "intent-2",
      instanceId: "instance-2",
      resourceId: "portfolio_configuration",
      operation: "UPDATE" as const,
      status: "applied",
      targetPrimaryAccountId: "HOR*EQACX*ROB",
      serviceCode: "MSCI-WORLD-NR",
      updatedAt: "2026-08-11T09:45:00.000Z",
    }];
  }
}

describe("workflow runtime dashboard", () => {
  it("combines operational counts, queues and alerts", async () => {
    const model = await new WorkflowRuntimeDashboardService(new MemoryDashboardReader()).load({
      now: "2026-08-11T10:00:00.000Z",
    });

    expect(model.instanceCounts).toMatchObject({ active: 3, blocked: 1 });
    expect(model.nodeCounts).toMatchObject({ waiting: 2, failed: 1 });
    expect(model.oldestTasks).toHaveLength(1);
    expect(model.deadLetters).toHaveLength(1);
    expect(model.catalogChangeMetrics).toEqual([
      { resourceId: "portfolio_configuration", operation: "UPDATE", status: "applied", count: 2 },
    ]);
    expect(model.recentCatalogChanges[0]).toMatchObject({
      resourceId: "portfolio_configuration",
      targetPrimaryAccountId: "HOR*EQACX*ROB",
    });
    expect(model.alerts.map((alert) => alert.kind)).toEqual([
      "blocked",
      "failed",
      "sla_overdue",
      "dead_letter",
      "adapter_error",
    ]);
  });

  it("keeps alerts to workflow, version and node labels without sensitive payload values", async () => {
    const model = await new WorkflowRuntimeDashboardService(new MemoryDashboardReader()).load({
      now: "2026-08-11T10:00:00.000Z",
    });

    const serializedAlerts = JSON.stringify(model.alerts);
    expect(serializedAlerts).toContain("Benchmark switch");
    expect(serializedAlerts).toContain("version-1");
    expect(serializedAlerts).toContain("change-request");
    expect(serializedAlerts).not.toContain("newBenchmarkValue");
    expect(serializedAlerts).not.toContain("concurrencyToken");
    expect(serializedAlerts).not.toContain("clientSecret");
  });
});
