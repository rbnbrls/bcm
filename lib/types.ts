export type Benchmark = {
  id: string;
  code: string;
  name: string;
  assetClass: string;
  currency: string;
  cost: number;
  provider: string;
};

export type Portfolio = {
  id: string;
  name: string;
  externalReference: string;
  currentBenchmarkId: string;
  currentBenchmark: Benchmark;
};

export type ClientConfig = {
  id: string;
  name: string;
  externalReference: string;
  portfolios: Portfolio[];
};

export type ChangeItem = {
  portfolioId: string;
  previousBenchmarkId: string;
  requestedBenchmarkId: string;
};

export type ChangeStatus =
  | "draft"
  | "submitted"
  | "accepted"
  | "in_progress"
  | "processed"
  | "validated";

export const CHANGE_STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "Concept",
  submitted: "Ingediend",
  accepted: "Geaccordeerd",
  in_progress: "In behandeling",
  processed: "Verwerkt",
  validated: "Gevalideerd",
};

export type SlaStatus = "ok" | "at_risk" | "overdue";

export type StatusHistoryEntry = {
  id: string;
  changeRequestId: string;
  fromStatus: ChangeStatus | null;
  toStatus: ChangeStatus;
  changedBy: string | null;
  changedAt: string;
};

export const CHANGE_STATUS_NEXT: Record<ChangeStatus, ChangeStatus | null> = {
  draft: "submitted",
  submitted: "accepted",
  accepted: "in_progress",
  in_progress: "processed",
  processed: "validated",
  validated: null,
};

export const CHANGE_STATUS_PREV: Record<ChangeStatus, ChangeStatus | null> = {
  draft: null,
  submitted: "draft",
  accepted: "submitted",
  in_progress: "accepted",
  processed: "in_progress",
  validated: "processed",
};

export type ChangeRequest = {
  id: string;
  reference: string;
  clientName: string;
  clientReference: string;
  clientId: string;
  requestedBy: string;
  rationale: string;
  effectiveDate: string;
  status: string;
  changeType: string;
  createdAt: string;
  submittedAt: string | null;
  slaLeadWeeks: number;
  daysOpen: number;
  slaStatus: SlaStatus;
  statusUpdatedAt: string;
  processedAt: string | null;
  processedBy: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  notificationSent: boolean;
  items: Array<{
    portfolioName: string;
    portfolioReference: string;
    previousBenchmark: Benchmark;
    requestedBenchmark: Benchmark;
  }>;
  newBenchmark?: NewBenchmarkRequest;
  // Generic change-type model fields (Phase 1+)
  changeTypeConfig?: ChangeTypeConfig;
  fields?: ChangeFieldValue[];
  estimatedCost?: number;
  estimatedCostCurrency?: string;
  estimatedLeadDays?: number;
  stakeholderAssignments?: StakeholderAssignment[];
};

export type NewBenchmarkRequest = {
  id: string;
  shortName: string;
  longName: string;
  assetClass: string;
  currency: string;
  estimatedCost: number;
  estimatedLeadWeeks: number;
};

// ── Generic Change-Type Model ──

export type ChangeFieldType =
  | "benchmark"         // References benchmark_catalog(id)
  | "text"              // Free text (short)
  | "longtext"          // Free text (long / markdown)
  | "number"            // Numeric value
  | "currency"          // Monetary amount (EUR, USD…)
  | "date"              // ISO date
  | "select"            // Single-select from options
  | "multiselect"       // Multi-select from options
  | "boolean";          // Yes/No toggle

export type ChangeField = {
  key: string;
  label: string;
  type: ChangeFieldType;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  referenceTable?: "benchmark_catalog" | "clients" | "portfolios";
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
  helpText?: string;
};

export type CostModel = {
  baseCost: number;
  costCurrency: string;
  perItemCost?: number;
  description: string;
};

export type StakeholderTrigger =
  | "on_submit"
  | "on_approval"
  | "on_completion";

export type StakeholderDef = {
  id: string;
  name: string;
  role: string;
  notifyOn: StakeholderTrigger[];
  mandatory: boolean;
  contactType?: "email" | "webhook";
};

export type ChangeTypeConfig = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  fields: ChangeField[];
  istSollMapping?: Array<{
    ist: string;
    soll: string;
    labelIst: string;
    labelSoll: string;
  }>;
  cost: CostModel;
  defaultLeadDays: number;
  stakeholders: StakeholderDef[];
  workflow: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ChangeFieldValue = {
  fieldKey: string;
  istValue: unknown;
  sollValue: unknown;
};

export type StakeholderAssignment = {
  stakeholderId: string;
  contact: string;
  notifiedAt: string | null;
};

export type AuditLogEntry = {
  id: string;
  changeRequestId: string;
  action: string;
  actor: string;
  previousStatus: string | null;
  newStatus: string;
  diffSnapshot: Record<string, unknown> | null;
  clientConfigVersion: string | null;
  createdAt: string;
};

export type Approval = {
  id: string;
  changeRequestId: string;
  approver: string;
  decision: string;
  remarks: string | null;
  createdAt: string;
};

export type WebhookConfig = {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
};

// ── Report Types ──

export type ReportFilters = {
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  changeType?: string;
};

export type ClientVolumeReport = {
  clientId: string;
  clientName: string;
  period: string;
  totalChanges: number;
  byStatus: Record<string, number>;
  byChangeType: Record<string, number>;
};

export type ProcessingTimeReport = {
  clientId: string;
  clientName: string;
  changeRequestId: string;
  reference: string;
  changeType: string;
  createdAt: string;
  processedAt: string | null;
  actualDays: number | null;
  estimatedDays: number;
  varianceDays: number | null;
  variancePct: number | null;
  status: string;
};

export type CostReport = {
  clientId: string;
  clientName: string;
  changeRequestId: string;
  reference: string;
  changeType: string;
  estimatedCost: number | null;
  estimatedCostCurrency: string;
  actualCost: number | null;
  status: string;
  createdAt: string;
};

export type DashboardSummary = {
  totalChanges: number;
  pendingChanges: number;
  processedChanges: number;
  avgProcessingDays: number | null;
  avgEstimatedDays: number;
  totalEstimatedCost: number;
  monthlyVolume: { month: string; count: number }[];
  byStatus: Record<string, number>;
};

export type ChangeRequestSummary = {
  id: string;
  reference: string;
  clientName: string;
  changeType: string;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  slaLeadWeeks: number;
  daysOpen: number;
  slaStatus: SlaStatus;
  statusUpdatedAt: string;
  itemCount: number;
};

// ── Report Module Types ───────────────────────────────────────────────────────

export interface ClientVolumeReport {
  clientId: string;
  clientName: string;
  period: string;
  totalChanges: number;
  byStatus: Record<string, number>;
  byChangeType: Record<string, number>;
}

export interface ProcessingTimeReport {
  clientId: string;
  clientName: string;
  changeRequestId: string;
  reference: string;
  changeType: string;
  createdAt: string;
  processedAt: string | null;
  actualDays: number | null;
  estimatedDays: number;
  varianceDays: number | null;
  variancePct: number | null;
  status: string;
}

export interface CostReport {
  clientId: string;
  clientName: string;
  changeRequestId: string;
  reference: string;
  changeType: string;
  estimatedCost: number | null;
  estimatedCostCurrency: string;
  actualCost: number | null;
  status: string;
  createdAt: string;
}

export interface ReportFilters {
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  period?: "month" | "quarter" | "year";
  status?: string;
  changeType?: string;
}

export interface DashboardSummary {
  totalChanges: number;
  pendingChanges: number;
  processedChanges: number;
  avgProcessingDays: number | null;
  avgEstimatedDays: number;
  totalEstimatedCost: number;
  monthlyVolume: { month: string; count: number }[];
  byStatus: Record<string, number>;
}

/** Compute SLA status based on creation date and lead weeks. Used on both server and client. */
export function computeSlaStatus(
  createdAt: string,
  slaLeadWeeks: number,
  status: string
): { daysOpen: number; slaDays: number; slaStatus: SlaStatus } {
  const isDone = status === "validated" || status === "processed";
  const created = new Date(createdAt);
  const now = new Date();
  const daysOpen = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const slaDays = slaLeadWeeks * 7;
  const remaining = slaDays - daysOpen;

  let slaStatus: SlaStatus = "ok";
  if (isDone) {
    slaStatus = "ok";
  } else if (remaining <= 0) {
    slaStatus = "overdue";
  } else if (remaining <= Math.ceil(slaDays * 0.25)) {
    slaStatus = "at_risk";
  }

  return { daysOpen, slaDays, slaStatus };
}
