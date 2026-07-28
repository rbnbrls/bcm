/**
 * @deprecated The old entity model is being replaced by the client_config schema.
 * Use `ClientConfigLegalEntity` / `ClientConfigAccount` etc. from the new schema.
 *
 * Benchmark catalog entry in the old (pre-client_config) schema.
 */
export type Benchmark = {
  id: string;
  code: string;
  name: string;
  assetClass: string;
  currency: string;
  cost: number;
  provider: string;
};

/**
 * @deprecated Replaced by the client_config schema. Use parent_account / legal_entity instead.
 */
export type WtpClassification = {
  id: string;
  name: string;
};

/**
 * @deprecated Replaced by client_config.asset_class. Use `AssetClass` entity instead.
 */
export type AssetClassRow = {
  id: string;
  name: string;
};

/**
 * @deprecated Replaced by client_config.manager. Use `ClientConfigManager` instead.
 */
export type Manager = {
  id: string;
  name: string;
};

/**
 * @deprecated Replaced by client_config.benchmark. Use `ClientConfigBenchmark` instead.
 */
export type BenchmarkGroup = {
  id: string;
  name: string;
};

/**
 * @deprecated Replaced by client_config.portfolio + client_config.account.
 * The new schema splits portfolio metadata from account-level dimension data.
 */
export type Portfolio = {
  id: string;
  name: string;
  externalReference: string;
  currentBenchmarkId: string;
  currentBenchmark: Benchmark;
  wtpClassificationId: string;
  wtpClassification: WtpClassification;
  assetClassId: string;
  assetClassRow: AssetClassRow;
  assetClass: string;
  subAssetClass: string;
  managerId: string;
  manager: Manager;
  benchmarkId: string;
  benchmarkGroup: BenchmarkGroup;
};

/**
 * @deprecated Replaced by client_config.asset_class. The new schema uses
 * char(2) codes (CS, EQ, FI, …) instead of long enum strings.
 */
export type AssetClass =
  | "CASH"
  | "ALTERNATIVES"
  | "EQUITIES"
  | "FIXED_INCOME"
  | "REAL_ASSETS"
  | "OVERLAY"
  | "MULTI_ASSETS"
  | "IMPACT"
  | "OPBOUW"
  | "RENDEMENT"
  | "RENTE"
  | "INFLATION"
  | "MATCHING"
  | "COLLATERAL"
  | "RESERVE";

/** @deprecated Replaced by client_config.asset_class seed data. */
export const ASSET_CLASSES: AssetClass[] = [
  "CASH", "ALTERNATIVES", "EQUITIES", "FIXED_INCOME", "REAL_ASSETS",
  "OVERLAY", "MULTI_ASSETS", "IMPACT",
  "OPBOUW", "RENDEMENT", "RENTE",
  "INFLATION", "MATCHING", "COLLATERAL", "RESERVE",
];

/**
 * @deprecated Replaced by the client_config schema entities.
 * The old "ClientConfig" bundled client + portfolios into one shape.
 * The new schema splits these into legal_entity / parent_account / portfolio / account.
 */
export type ClientConfig = {
  id: string;
  name: string;
  externalReference: string;
  regelingType?: string;
  assetClass?: AssetClass;
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

/**
 * Extended status labels covering all statuses including non-canonical ones
 * (pending_approval, approved, rejected, failed) used in reports/views.
 */
export const ALL_STATUS_LABELS: Record<string, string> = {
  ...CHANGE_STATUS_LABELS,
  pending_approval: "In behandeling",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
  failed: "Mislukt",
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
  /** Extended explanation of how the change works, shown on the detail page. */
  extendedExplanation?: string;
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
  processFlow?: FlowStep[];
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

/**
 * A single step in a change type's process flow.
 * Describes which stakeholder performs which action, the lead time,
 * and a description of the step.
 */
export type FlowStep = {
  stepOrder: number;
  stakeholder: string;
  stakeholderId?: string;
  action: string;
  leadTime: string;
  description: string;
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

// ── Report types ──

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

export type ReportFilters = {
  status?: string;
  clientId?: string;
  changeType?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ClientVolumeReport = {
  clientId: string;
  clientName: string;
  period: string;
  totalChanges: number;
  byStatus: Record<string, number>;
  byChangeType: Record<string, number>;
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

// ═════════════════════════════════════════════════════════════════════
// New data model — client_config schema (replaces the deprecated types above)
// ═════════════════════════════════════════════════════════════════════

/**
 * Legal entity (rechtsvorm) — top-level counterparty.
 * Maps to client_config.legal_entity.
 */
export interface ClientConfigLegalEntity {
  legalEntityId: number;
  legalName: string;
}

/**
 * Parent account (hoofdrekening) — groups one or more portfolios.
 * Maps to client_config.parent_account.
 */
export interface ClientConfigParentAccount {
  parentAccountId: number;
  parentAccountCode: string;
  msaParentAccountCode: string | null;
}

/**
 * Portfolio in the client_config schema.
 * Simpler than the old Portfolio type — most dimensions live on Account.
 */
export interface ClientConfigPortfolio {
  portfolioId: number;
  portfolioCode: string;
  parentAccountId: number | null;
  parentAccount?: ClientConfigParentAccount;
}

/**
 * Asset class (asset categorie) — top-level investment category.
 * Uses char(2) codes (CS, EQ, FI, …) instead of long enum strings.
 * Maps to client_config.asset_class.
 */
export interface ClientConfigAssetClass {
  assetClassId: number;
  assetClassCode: string;
  assetClassName: string;
}

/**
 * Sub asset class — detailed classification within an asset class.
 * Maps to client_config.sub_asset_class.
 */
export interface ClientConfigSubAssetClass {
  subAssetClassId: number;
  assetClassId: number;
  subAssetClassCode: string;
  subAssetClassName: string;
  assetClass?: ClientConfigAssetClass;
}

/**
 * Manager (beheerder) — responsible for managing accounts.
 * Maps to client_config.manager.
 */
export interface ClientConfigManager {
  managerId: number;
  managerCode: string;
  managerName: string;
}

/**
 * Benchmark (referentie-index) — performance comparison reference.
 * Maps to client_config.benchmark.
 */
export interface ClientConfigBenchmark {
  benchmarkId: number;
  benchmarkCode: string;
  benchmarkName: string | null;
  rimesCode: string | null;
}

/**
 * Model — model portfolio reference.
 * Maps to client_config.model.
 */
export interface ClientConfigModel {
  modelId: number;
  modelCode: string;
}

/**
 * Classification — account categorisation scheme.
 * Maps to client_config.classification.
 */
export interface ClientConfigClassification {
  classificationId: number;
  classificationCode: string;
}

/**
 * Strategy — high-level investment strategy.
 * Maps to client_config.strategy.
 */
export interface ClientConfigStrategy {
  strategyId: number;
  strategyName: string;
}

/**
 * Sub strategy — detailed strategy classification.
 * Maps to client_config.sub_strategy.
 */
export interface ClientConfigSubStrategy {
  subStrategyId: number;
  strategyId: number;
  subStrategyName: string;
  strategy?: ClientConfigStrategy;
}

/**
 * Account — the central entity tying all dimensions together.
 * Maps to client_config.account.
 *
 * primaryAccountId is derived: {portfolio_code}_{asset_class_code}{sub_asset_class_code}_{manager_code}
 * UNIQUE(portfolio_id, asset_class_id, sub_asset_class_id, manager_id).
 */
export interface ClientConfigAccount {
  primaryAccountId: string;
  portfolioId: number;
  assetClassId: number;
  subAssetClassId: number;
  managerId: number;
  legalEntityId: number | null;
  additionalCode: string | null;
  longName: string;
  shortName: string;
  modelId: number | null;
  classificationId: number | null;
  strategyId: number;
  subStrategyId: number;
  benchmarkId: number | null;

  // Relations (loaded optionally)
  portfolio?: ClientConfigPortfolio;
  assetClass?: ClientConfigAssetClass;
  subAssetClass?: ClientConfigSubAssetClass;
  manager?: ClientConfigManager;
  legalEntity?: ClientConfigLegalEntity | null;
  model?: ClientConfigModel | null;
  classification?: ClientConfigClassification | null;
  strategy?: ClientConfigStrategy;
  subStrategy?: ClientConfigSubStrategy;
  benchmark?: ClientConfigBenchmark | null;
}
