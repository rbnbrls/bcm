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
  events: string[]; // e.g. ["change.approved", "change.rejected"]
  active: boolean;
  createdAt: string;
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
