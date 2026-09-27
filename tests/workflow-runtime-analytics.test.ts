import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@/lib/identity/types";
import {
  WorkflowRuntimeAnalyticsService,
  type WorkflowRuntimeAnalyticsFilters,
  type WorkflowRuntimeAnalyticsReader,
  type WorkflowRuntimeNodeMetric,
  type WorkflowRuntimeRoleMetric,
  type WorkflowRuntimeWorkflowMetric,
} from "@/lib/workflow-studio/runtime-analytics";

const filters: WorkflowRuntimeAnalyticsFilters = Object.freeze({
  scope: { tenant: "tenant-a", businessUnit: "bu-a", clientIds: ["client-a"] },
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  workflowVersionIds: ["version-1"],
});

const identity = (overrides: Partial<IdentityContext> = {}): IdentityContext => ({
  userId: "manager-1",
  displayName: "Manager",
  groups: ["bcm:role:change_manager", "bcm:client:client-a"],
  tenant: "tenant-a",
  businessUnit: "bu-a",
  sessionId: "session-1",
  ...overrides,
});

const workflowMetric = (overrides: Partial<WorkflowRuntimeWorkflowMetric> = {}): WorkflowRuntimeWorkflowMetric => ({
  workflowName: "Benchmark switch",
  workflowVersionId: "version-1",
  versionNumber: 4,
  volume: 10,
  completed: 7,
  cancelled: 1,
  failed: 2,
  averageLeadTimeMinutes: 180,
  failureRate: 0.2,
  ...overrides,
});

const nodeMetric = (overrides: Partial<WorkflowRuntimeNodeMetric> = {}): WorkflowRuntimeNodeMetric => ({
  workflowName: "Benchmark switch",
  workflowVersionId: "version-1",
  versionNumber: 4,
  nodeKey: "approval-am",
  blockType: "approval",
  executions: 12,
  succeeded: 9,
  skipped: 1,
  failed: 2,
  reworkCount: 3,
  averageDurationMinutes: 45,
  failureRate: 0.1667,
  ...overrides,
});

const roleMetric = (overrides: Partial<WorkflowRuntimeRoleMetric> = {}): WorkflowRuntimeRoleMetric => ({
  workflowName: "Benchmark switch",
  workflowVersionId: "version-1",
  versionNumber: 4,
  workflowRole: "account_manager",
  taskCount: 8,
  completed: 7,
  rejected: 2,
  slaOverdue: 3,
  averageWaitMinutes: 30,
  averageCompletionMinutes: 240,
  ...overrides,
});

class MemoryAnalyticsReader implements WorkflowRuntimeAnalyticsReader {
  calls: WorkflowRuntimeAnalyticsFilters[] = [];

  async listWorkflowMetrics(input: WorkflowRuntimeAnalyticsFilters) {
    this.calls.push(input);
    return [workflowMetric()];
  }

  async listNodeMetrics(input: WorkflowRuntimeAnalyticsFilters) {
    this.calls.push(input);
    return [nodeMetric()];
  }

  async listRoleMetrics(input: WorkflowRuntimeAnalyticsFilters) {
    this.calls.push(input);
    return [roleMetric()];
  }
}

describe("workflow runtime analytics", () => {
  it("loads authorized process analytics with summary metrics and scoped filters", async () => {
    const reader = new MemoryAnalyticsReader();
    const result = await new WorkflowRuntimeAnalyticsService(reader).load(identity(), {
      filters,
      now: "2026-08-11T10:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected analytics model");
    expect(result.value.summary).toEqual({
      volume: 10,
      completed: 7,
      failed: 2,
      failureRate: 0.2,
      reworkCount: 3,
      rejected: 2,
      rejectionRate: 0.25,
      slaOverdue: 3,
    });
    expect(result.value.filters).toMatchObject(filters);
    expect(reader.calls).toHaveLength(3);
    expect(reader.calls.every((call) => call.scope.clientIds?.includes("client-a"))).toBe(true);
  });

  it("denies analytics outside the signed identity scope before reading", async () => {
    const reader = new MemoryAnalyticsReader();
    const result = await new WorkflowRuntimeAnalyticsService(reader).load(identity(), {
      filters: { ...filters, scope: { tenant: "tenant-a", businessUnit: "bu-b", clientIds: ["client-a"] } },
      now: "2026-08-11T10:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: false, code: "scope_denied" });
    expect(reader.calls).toHaveLength(0);
  });

  it("rejects invalid periods and empty version filters", async () => {
    const service = new WorkflowRuntimeAnalyticsService(new MemoryAnalyticsReader());

    await expect(service.load(identity(), {
      filters: { ...filters, from: filters.to, to: filters.from },
      now: "2026-08-11T10:00:00.000Z",
    })).resolves.toMatchObject({ ok: false, code: "invalid_filter" });
    await expect(service.load(identity(), {
      filters: { ...filters, workflowVersionIds: [] },
      now: "2026-08-11T10:00:00.000Z",
    })).resolves.toMatchObject({ ok: false, code: "invalid_filter" });
  });

  it("returns pseudonymized aggregates without instance, task, actor or payload values", async () => {
    const result = await new WorkflowRuntimeAnalyticsService(new MemoryAnalyticsReader()).load(identity(), {
      filters,
      now: "2026-08-11T10:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: true });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Benchmark switch");
    expect(serialized).toContain("approval-am");
    expect(serialized).not.toContain("instance-1");
    expect(serialized).not.toContain("task-1");
    expect(serialized).not.toContain("manager-1");
    expect(serialized).not.toContain("newBenchmarkValue");
    expect(serialized).not.toContain("clientSecret");
  });
});
