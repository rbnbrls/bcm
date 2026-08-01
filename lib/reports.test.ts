/**
 * Tests for the reports module (lib/reports.ts).
 *
 * Covers all helper and aggregation functions: computeProcessingTime,
 * computeVarianceDays/Pct, aggregateClientVolume, aggregateMonthlyVolume,
 * buildProcessingTimeReport, buildCostReport, buildDashboardSummary,
 * filterReports, and exportToCSV.
 */
import { describe, it, expect } from "vitest";
import {
  computeProcessingTime,
  computeVarianceDays,
  computeVariancePct,
  aggregateClientVolume,
  aggregateMonthlyVolume,
  buildProcessingTimeReport,
  buildCostReport,
  buildDashboardSummary,
  filterReports,
  exportToCSV,
  getEstimatedDays,
  getShortStatusLabel,
} from "@/lib/reports";
import type { ChangeRequest, SlaStatus } from "@/lib/types";

// ── Fixtures ──

function createMockChange(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: "cr-001",
    reference: "BCM-2026-0001",
    clientName: "Client A",
    clientReference: "CA-001",
    clientId: "c1",
    requestedBy: "Ruben",
    rationale: "Test change",
    effectiveDate: "2026-03-01",
    status: "processed",
    changeType: "benchmark_switch",
    createdAt: "2026-01-15T10:00:00Z",
    slaLeadWeeks: 2,
    statusUpdatedAt: "2026-02-15T10:00:00Z",
    processedAt: "2026-02-01T10:00:00Z",
    processedBy: "system",
    validatedAt: null,
    validatedBy: null,
    notificationSent: true,
    submittedAt: null,
    daysOpen: 0,
    slaStatus: "ok" as SlaStatus,
    items: [],
    estimatedCost: 1000,
    estimatedCostCurrency: "EUR",
    estimatedLeadDays: undefined,
    ...overrides,
  };
}

function createMockChanges(): ChangeRequest[] {
  return [
    createMockChange({
      id: "cr-001", reference: "BCM-2026-0001", clientId: "c1", clientName: "Client A",
      createdAt: "2026-01-15T10:00:00Z", processedAt: "2026-02-01T10:00:00Z",
      slaLeadWeeks: 2, status: "processed", changeType: "benchmark_switch",
      estimatedCost: 1000,
    }),
    createMockChange({
      id: "cr-002", reference: "BCM-2026-0002", clientId: "c1", clientName: "Client A",
      createdAt: "2026-02-01T10:00:00Z", processedAt: "2026-02-10T10:00:00Z",
      slaLeadWeeks: 1, status: "processed", changeType: "fee_change",
      estimatedCost: 2500, estimatedLeadDays: 7,
    }),
    createMockChange({
      id: "cr-003", reference: "BCM-2026-0003", clientId: "c2", clientName: "Client B",
      createdAt: "2026-01-20T10:00:00Z", processedAt: "2026-02-05T10:00:00Z",
      slaLeadWeeks: 3, status: "processed", changeType: "benchmark_switch",
      estimatedCost: 500,
    }),
    createMockChange({
      id: "cr-004", reference: "BCM-2026-0004", clientId: "c2", clientName: "Client B",
      createdAt: "2026-03-01T10:00:00Z", processedAt: null,
      slaLeadWeeks: 2, status: "submitted", changeType: "mandate_change",
      estimatedCost: 0,
    }),
    createMockChange({
      id: "cr-005", reference: "BCM-2026-0005", clientId: "c1", clientName: "Client A",
      createdAt: "2026-04-10T10:00:00Z", processedAt: null,
      slaLeadWeeks: 2, status: "draft", changeType: "benchmark_switch",
      estimatedCost: undefined,
    }),
  ];
}

// ── computeProcessingTime ──

describe("computeProcessingTime", () => {
  it("returns days between created_at and processed_at", () => {
    expect(computeProcessingTime("2026-01-01T00:00:00Z", "2026-01-15T00:00:00Z")).toBe(14);
  });

  it("returns null when processed_at is missing", () => {
    expect(computeProcessingTime("2026-01-01T00:00:00Z", null)).toBeNull();
  });

  it("returns 0 when dates are the same", () => {
    expect(computeProcessingTime("2026-01-15T00:00:00Z", "2026-01-15T00:00:00Z")).toBe(0);
  });

  it("returns 1 for a single-day difference", () => {
    expect(computeProcessingTime("2026-01-15T00:00:00Z", "2026-01-16T00:00:00Z")).toBe(1);
  });
});

// ── computeVarianceDays ──

describe("computeVarianceDays", () => {
  it("returns 0 when actual equals estimated", () => {
    expect(computeVarianceDays(14, 14)).toBe(0);
  });

  it("returns positive when actual exceeds estimated", () => {
    expect(computeVarianceDays(20, 14)).toBe(6);
  });

  it("returns negative when actual is under estimated", () => {
    expect(computeVarianceDays(10, 14)).toBe(-4);
  });

  it("returns null when actual is null", () => {
    expect(computeVarianceDays(null, 14)).toBeNull();
  });

  it("rounds to one decimal place", () => {
    expect(computeVarianceDays(14.55, 14)).toBe(0.6);
  });
});

// ── computeVariancePct ──

describe("computeVariancePct", () => {
  it("returns 0 when actual matches estimated", () => {
    expect(computeVariancePct(14, 14)).toBe(0);
  });

  it("returns 43 for actual=20, estimated=14", () => {
    expect(computeVariancePct(20, 14)).toBe(43);
  });

  it("returns -29 for actual=10, estimated=14", () => {
    expect(computeVariancePct(10, 14)).toBe(-29);
  });

  it("returns null when actual is null", () => {
    expect(computeVariancePct(null, 14)).toBeNull();
  });

  it("returns null when estimated is 0", () => {
    expect(computeVariancePct(10, 0)).toBeNull();
  });
});

// ── getEstimatedDays ──

describe("getEstimatedDays", () => {
  it("returns estimatedLeadDays when set", () => {
    const change = createMockChange({ estimatedLeadDays: 10, slaLeadWeeks: 2 });
    expect(getEstimatedDays(change)).toBe(10);
  });

  it("falls back to slaLeadWeeks * 7 when estimatedLeadDays is not set", () => {
    const change = createMockChange({ estimatedLeadDays: undefined, slaLeadWeeks: 2 });
    expect(getEstimatedDays(change)).toBe(14);
  });
});

// ── aggregateClientVolume ──

describe("aggregateClientVolume", () => {
  it("groups changes by client and counts totals", () => {
    const result = aggregateClientVolume(createMockChanges());
    expect(result).toHaveLength(2);

    const clientA = result.find((r) => r.clientId === "c1");
    expect(clientA).toBeDefined();
    expect(clientA!.totalChanges).toBe(3);

    const clientB = result.find((r) => r.clientId === "c2");
    expect(clientB).toBeDefined();
    expect(clientB!.totalChanges).toBe(2);
  });

  it("breaks down by status per client", () => {
    const result = aggregateClientVolume(createMockChanges());
    const clientA = result.find((r) => r.clientId === "c1")!;
    expect(clientA.byStatus).toEqual({ processed: 2, draft: 1 });

    const clientB = result.find((r) => r.clientId === "c2")!;
    expect(clientB.byStatus).toEqual({ processed: 1, submitted: 1 });
  });

  it("breaks down by change type per client", () => {
    const result = aggregateClientVolume(createMockChanges());
    const clientA = result.find((r) => r.clientId === "c1")!;
    expect(clientA.byChangeType).toEqual({ benchmark_switch: 2, fee_change: 1 });
  });

  it("returns empty array for empty input", () => {
    expect(aggregateClientVolume([])).toEqual([]);
  });

  it("sorts clients by volume descending", () => {
    const result = aggregateClientVolume(createMockChanges());
    expect(result[0].totalChanges).toBeGreaterThanOrEqual(result[1].totalChanges);
  });
});

// ── aggregateMonthlyVolume ──

describe("aggregateMonthlyVolume", () => {
  it("groups changes by YYYY-MM and counts", () => {
    const result = aggregateMonthlyVolume(createMockChanges());
    // January: cr-001, cr-003; February: cr-002; March: cr-004; April: cr-005
    expect(result).toEqual([
      { month: "2026-01", count: 2 },
      { month: "2026-02", count: 1 },
      { month: "2026-03", count: 1 },
      { month: "2026-04", count: 1 },
    ]);
  });

  it("sorts months chronologically", () => {
    const changes = [
      createMockChange({ id: "a", createdAt: "2026-03-01T00:00:00Z" }),
      createMockChange({ id: "b", createdAt: "2026-01-01T00:00:00Z" }),
    ];
    const result = aggregateMonthlyVolume(changes);
    expect(result.map((r) => r.month)).toEqual(["2026-01", "2026-03"]);
  });

  it("returns empty array for empty input", () => {
    expect(aggregateMonthlyVolume([])).toEqual([]);
  });
});

// ── buildProcessingTimeReport ──

describe("buildProcessingTimeReport", () => {
  it("returns correct processing time for each change", () => {
    const result = buildProcessingTimeReport(createMockChanges());
    expect(result).toHaveLength(5);

    const cr1 = result.find((r) => r.changeRequestId === "cr-001")!;
    expect(cr1.actualDays).toBe(17); // Jan 15 → Feb 1
    expect(cr1.estimatedDays).toBe(14); // 2 weeks * 7
    expect(cr1.varianceDays).toBe(3);
    expect(cr1.variancePct).toBe(21);
  });

  it("handles changes with estimatedLeadDays", () => {
    const result = buildProcessingTimeReport(createMockChanges());
    const cr2 = result.find((r) => r.changeRequestId === "cr-002")!;
    expect(cr2.estimatedDays).toBe(7); // estimatedLeadDays overrides slaLeadWeeks
    expect(cr2.actualDays).toBe(9); // Feb 1 → Feb 10
    expect(cr2.varianceDays).toBe(2);
  });

  it("has null actualDays for unprocessed changes", () => {
    const result = buildProcessingTimeReport(createMockChanges());
    const cr4 = result.find((r) => r.changeRequestId === "cr-004")!;
    expect(cr4.actualDays).toBeNull();
    expect(cr4.varianceDays).toBeNull();
    expect(cr4.variancePct).toBeNull();
  });

  it("sorts by createdAt descending", () => {
    const result = buildProcessingTimeReport(createMockChanges());
    expect(result[0].changeRequestId).toBe("cr-005"); // April
  });
});

// ── buildCostReport ──

describe("buildCostReport", () => {
  it("returns cost data for every change", () => {
    const result = buildCostReport(createMockChanges());
    expect(result).toHaveLength(5);
  });

  it("includes estimated costs", () => {
    const result = buildCostReport(createMockChanges());
    const cr1 = result.find((r) => r.changeRequestId === "cr-001")!;
    expect(cr1.estimatedCost).toBe(1000);
    expect(cr1.estimatedCostCurrency).toBe("EUR");
  });

  it("has null estimatedCost for changes without cost data", () => {
    const result = buildCostReport(createMockChanges());
    const cr5 = result.find((r) => r.changeRequestId === "cr-005")!;
    expect(cr5.estimatedCost).toBeNull();
  });

  it("uses EUR as default currency", () => {
    const result = buildCostReport(createMockChanges());
    expect(result.every((r) => r.estimatedCostCurrency === "EUR")).toBe(true);
  });
});

// ── buildDashboardSummary ──

describe("buildDashboardSummary", () => {
  it("returns correct total counts", () => {
    const summary = buildDashboardSummary(createMockChanges());
    expect(summary.totalChanges).toBe(5);
  });

  it("calculates pending and processed counts", () => {
    const summary = buildDashboardSummary(createMockChanges());
    // draft(1) + submitted(1) = 2 pending
    expect(summary.pendingChanges).toBe(2);
    expect(summary.processedChanges).toBe(3); // three processed changes
  });

  it("calculates average processing days", () => {
    const summary = buildDashboardSummary(createMockChanges());
    // 3 processed changes: 17 + 9 + 16 = 42, avg = 14
    expect(summary.avgProcessingDays).toBe(14);
  });

  it("calculates average estimated days", () => {
    const summary = buildDashboardSummary(createMockChanges());
    // 14 + 7 + 21 + 14 + 14 = 70, avg = 14
    expect(summary.avgEstimatedDays).toBe(14);
  });

  it("calculates total estimated cost", () => {
    const summary = buildDashboardSummary(createMockChanges());
    expect(summary.totalEstimatedCost).toBe(4000); // 1000 + 2500 + 500 + 0
  });

  it("generates monthly volume", () => {
    const summary = buildDashboardSummary(createMockChanges());
    expect(summary.monthlyVolume.length).toBeGreaterThan(0);
    expect(summary.monthlyVolume[0].month).toBe("2026-01");
  });

  it("returns breakdown by status", () => {
    const summary = buildDashboardSummary(createMockChanges());
    expect(summary.byStatus).toEqual({
      processed: 3,
      submitted: 1,
      draft: 1,
    });
  });

  it("handles empty changes gracefully", () => {
    const summary = buildDashboardSummary([]);
    expect(summary.totalChanges).toBe(0);
    expect(summary.pendingChanges).toBe(0);
    expect(summary.processedChanges).toBe(0);
    expect(summary.avgProcessingDays).toBeNull();
    expect(summary.avgEstimatedDays).toBe(0);
    expect(summary.totalEstimatedCost).toBe(0);
    expect(summary.monthlyVolume).toEqual([]);
    expect(summary.byStatus).toEqual({});
  });

  it("handles changes with no processedAt", () => {
    const changes = [
      createMockChange({ id: "a", createdAt: "2026-01-01T00:00:00Z", processedAt: null }),
      createMockChange({ id: "b", createdAt: "2026-01-15T00:00:00Z", processedAt: null }),
    ];
    const summary = buildDashboardSummary(changes);
    expect(summary.avgProcessingDays).toBeNull();
    expect(summary.pendingChanges).toBe(0); // none have pending statuses
  });
});

// ── filterReports ──

describe("filterReports", () => {
  const changes = createMockChanges();
  const reports = buildProcessingTimeReport(changes);

  it("filters by clientId", () => {
    const filtered = filterReports(reports, { clientId: "c1" });
    expect(filtered).toHaveLength(3);
    expect(filtered.every((r) => r.clientId === "c1")).toBe(true);
  });

  it("filters by status", () => {
    const filtered = filterReports(reports, { status: "draft" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("draft");
  });

  it("filters by changeType", () => {
    const filtered = filterReports(reports, { changeType: "fee_change" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].changeType).toBe("fee_change");
  });

  it("filters by date range", () => {
    const filtered = filterReports(reports, {
      dateFrom: "2026-02-01T00:00:00Z",
      dateTo: "2026-04-01T00:00:00Z",
    });
    expect(filtered.every((r) => r.createdAt >= "2026-02-01T00:00:00Z" && r.createdAt <= "2026-04-01T00:00:00Z")).toBe(true);
  });

  it("combines multiple filters", () => {
    const filtered = filterReports(reports, {
      clientId: "c1",
      status: "processed",
    });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.clientId === "c1" && r.status === "processed")).toBe(true);
  });

  it("returns all items when no filters provided", () => {
    const filtered = filterReports(reports, {});
    expect(filtered).toHaveLength(reports.length);
  });

  it("returns empty array when no items match", () => {
    const filtered = filterReports(reports, { status: "rejected" });
    expect(filtered).toEqual([]);
  });
});

// ── exportToCSV ──

describe("exportToCSV", () => {
  it("converts report data to CSV string with header", () => {
    const data = [
      { reference: "BCM-001", clientName: "Client A", status: "processed" },
      { reference: "BCM-002", clientName: "Client B", status: "submitted" },
    ];
    const csv = exportToCSV(data, ["reference", "clientName", "status"]);
    expect(csv).toContain("reference,clientName,status");
    expect(csv).toContain("BCM-001,Client A,processed");
    expect(csv).toContain("BCM-002,Client B,submitted");
  });

  it("handles null/undefined values as empty strings", () => {
    const data = [
      { reference: "BCM-001", cost: null, note: undefined as any },
    ];
    const csv = exportToCSV(data, ["reference", "cost", "note"]);
    expect(csv).toContain("BCM-001,,");
  });

  it("quotes fields with commas", () => {
    const data = [
      { name: "Client, B.V.", value: "100" },
    ];
    const csv = exportToCSV(data, ["name", "value"]);
    expect(csv).toContain('"Client, B.V.",100');
  });

  it("handles empty data", () => {
    const csv = exportToCSV([], ["a", "b"]);
    expect(csv).toBe("a,b");
  });
});

// ── getShortStatusLabel ──

describe("getShortStatusLabel", () => {
  it("returns Dutch label for known statuses", () => {
    expect(getShortStatusLabel("processed")).toBe("Verwerkt");
    expect(getShortStatusLabel("draft")).toBe("Concept");
    expect(getShortStatusLabel("submitted")).toBe("Ingediend");
  });

  it("returns the status itself for unknown statuses", () => {
    expect(getShortStatusLabel("unknown_status")).toBe("unknown_status");
  });
});
