import type {
  ChangeRequest, ClientVolumeReport, ProcessingTimeReport, CostReport,
  ReportFilters, DashboardSummary,
} from "@/lib/types";
import { ALL_STATUS_LABELS } from "@/lib/types";

// ── Helpers ──

export function computeProcessingTime(
  createdAt: string,
  processedAt: string | null,
): number | null {
  if (!processedAt) return null;
  const created = new Date(createdAt).getTime();
  const processed = new Date(processedAt).getTime();
  return Math.round((processed - created) / (1000 * 60 * 60 * 24));
}

export function computeVarianceDays(
  actualDays: number | null,
  estimatedDays: number,
): number | null {
  if (actualDays === null) return null;
  return Math.round((actualDays - estimatedDays) * 10) / 10;
}

export function computeVariancePct(
  actualDays: number | null,
  estimatedDays: number,
): number | null {
  if (actualDays === null || estimatedDays === 0) return null;
  return Math.round(((actualDays - estimatedDays) / estimatedDays) * 100);
}

export function getEstimatedDays(change: ChangeRequest): number {
  return change.estimatedLeadDays ?? change.slaLeadWeeks * 7;
}

// ── Aggregations ──

export function aggregateClientVolume(
  changes: ChangeRequest[],
): ClientVolumeReport[] {
  const byClient = new Map<string, {
    total: number; byStatus: Record<string, number>; byType: Record<string, number>;
  }>();

  for (const c of changes) {
    const key = `${c.clientId}::${c.clientName}`;
    const entry = byClient.get(key) ?? { total: 0, byStatus: {}, byType: {} };
    entry.total++;
    entry.byStatus[c.status] = (entry.byStatus[c.status] || 0) + 1;
    entry.byType[c.changeType] = (entry.byType[c.changeType] || 0) + 1;
    byClient.set(key, entry);
  }

  return [...byClient.entries()].map(([key, data]) => {
    const [clientId, clientName] = key.split("::");
    return {
      clientId, clientName, period: "",
      totalChanges: data.total,
      byStatus: data.byStatus,
      byChangeType: data.byType,
    };
  }).sort((a, b) => b.totalChanges - a.totalChanges);
}

export function aggregateMonthlyVolume(
  changes: ChangeRequest[],
): { month: string; count: number }[] {
  const byMonth = new Map<string, number>();
  for (const c of changes) {
    const month = c.createdAt.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) || 0) + 1);
  }
  return [...byMonth.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ── Report builders ──

export function buildProcessingTimeReport(
  changes: ChangeRequest[],
): ProcessingTimeReport[] {
  return changes.map((c) => {
    const actualDays = computeProcessingTime(c.createdAt, c.processedAt);
    const estimatedDays = getEstimatedDays(c);
    const varianceDays = computeVarianceDays(actualDays, estimatedDays);
    const variancePct = computeVariancePct(actualDays, estimatedDays);
    return {
      clientId: c.clientId, clientName: c.clientName,
      changeRequestId: c.id, reference: c.reference,
      changeType: c.changeType, createdAt: c.createdAt,
      processedAt: c.processedAt, actualDays, estimatedDays,
      varianceDays, variancePct, status: c.status,
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function buildCostReport(changes: ChangeRequest[]): CostReport[] {
  return changes.map((c) => ({
    clientId: c.clientId, clientName: c.clientName,
    changeRequestId: c.id, reference: c.reference,
    changeType: c.changeType,
    estimatedCost: c.estimatedCost ?? null,
    estimatedCostCurrency: c.estimatedCostCurrency ?? "EUR",
    actualCost: null,
    status: c.status, createdAt: c.createdAt,
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function buildDashboardSummary(
  changes: ChangeRequest[],
): DashboardSummary {
  const byStatus: Record<string, number> = {};
  const processedDays: number[] = [];
  let totalEstimatedCost = 0;

  for (const c of changes) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    if (c.processedAt) {
      const days = computeProcessingTime(c.createdAt, c.processedAt);
      if (days !== null) processedDays.push(days);
    }
    if (c.estimatedCost) totalEstimatedCost += c.estimatedCost;
  }

  const pendingStatuses = ["submitted", "accepted", "in_progress", "draft", "pending_approval"];
  const processedStatuses = ["processed", "validated", "failed", "approved"];

  const avgProcessingDays = processedDays.length > 0
    ? Math.round((processedDays.reduce((a, b) => a + b, 0) / processedDays.length) * 10) / 10
    : null;

  const totalEstimatedDays = changes.reduce((s, c) => s + getEstimatedDays(c), 0);

  return {
    totalChanges: changes.length,
    pendingChanges: pendingStatuses.reduce((s, st) => s + (byStatus[st] || 0), 0),
    processedChanges: processedStatuses.reduce((s, st) => s + (byStatus[st] || 0), 0),
    avgProcessingDays,
    avgEstimatedDays: changes.length > 0
      ? Math.round((totalEstimatedDays / changes.length) * 10) / 10
      : 0,
    totalEstimatedCost,
    monthlyVolume: aggregateMonthlyVolume(changes),
    byStatus,
  };
}

export function filterReports<T extends { createdAt: string; status: string; clientId: string; changeType: string }>(
  reports: T[],
  filters: ReportFilters,
): T[] {
  return reports.filter((r) => {
    if (filters.clientId && r.clientId !== filters.clientId) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.changeType && r.changeType !== filters.changeType) return false;
    if (filters.dateFrom && r.createdAt < filters.dateFrom) return false;
    if (filters.dateTo && r.createdAt > filters.dateTo) return false;
    return true;
  });
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  fields: (keyof T & string)[],
): string {
  const header = fields.join(",");
  const rows = data.map((row) =>
    fields.map((f) => {
      const val = row[f];
      const str = val == null ? "" : String(val);
      return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(","),
  );
  return [header, ...rows].join("\n");
}

export function getShortStatusLabel(status: string): string {
  return ALL_STATUS_LABELS[status] || status;
}
