export type ChangeTypeFormKind =
  | "portfolio-create"
  | "client-onboarding"
  | "asset-class-request"
  | "sub-asset-class-request"
  | "generic";

export type WorkflowTemplateId =
  | "generic_field_change"
  | "benchmark_switch"
  | "new_benchmark_request"
  | "lookup_asset_class"
  | "lookup_sub_asset_class"
  | "client_onboarding"
  | "portfolio_configuration_create"
  | "portfolio_configuration_update"
  | "portfolio_configuration_retire";

export type ApplyStrategy =
  | "ist_sync"
  | "staged_lookup"
  | "staged_metadata"
  | "staged_portfolio_configuration"
  | "staged_client_onboarding"
  | "new_benchmark_request";

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  label: string;
  formKind: ChangeTypeFormKind;
  applyStrategy: ApplyStrategy;
  description: string;
};

export const WORKFLOW_TEMPLATES: Record<WorkflowTemplateId, WorkflowTemplate> = {
  generic_field_change: {
    id: "generic_field_change",
    label: "Generieke veldwijziging",
    formKind: "generic",
    applyStrategy: "ist_sync",
    description: "Config-gedreven formulier met IST/SOLL velden; verwerking synchroniseert de opgeslagen change velden.",
  },
  benchmark_switch: {
    id: "benchmark_switch",
    label: "Benchmarkwissel",
    formKind: "generic",
    applyStrategy: "ist_sync",
    description: "Benchmarkwijziging met portefeuille- en benchmarkreferenties.",
  },
  new_benchmark_request: {
    id: "new_benchmark_request",
    label: "Nieuwe benchmark",
    formKind: "generic",
    applyStrategy: "new_benchmark_request",
    description: "Staget of verwerkt een nieuwe benchmark aanvraag voor de benchmarkcatalogus.",
  },
  lookup_asset_class: {
    id: "lookup_asset_class",
    label: "Nieuwe asset class",
    formKind: "asset-class-request",
    applyStrategy: "staged_lookup",
    description: "Staget nieuwe asset class waarden in client_config.change_lookup_request.",
  },
  lookup_sub_asset_class: {
    id: "lookup_sub_asset_class",
    label: "Nieuwe sub asset class",
    formKind: "sub-asset-class-request",
    applyStrategy: "staged_lookup",
    description: "Staget nieuwe sub asset class waarden in client_config.change_lookup_request.",
  },
  client_onboarding: {
    id: "client_onboarding",
    label: "Client onboarding",
    formKind: "client-onboarding",
    applyStrategy: "staged_metadata",
    description: "Onboardt een nieuwe client met portfolio- en parent-account metadata.",
  },
  portfolio_configuration_create: {
    id: "portfolio_configuration_create",
    label: "Portefeuilleconfiguratie toevoegen",
    formKind: "portfolio-create",
    applyStrategy: "staged_portfolio_configuration",
    description: "Staget CREATE rows voor client_config.portfolio_configuration.",
  },
  portfolio_configuration_update: {
    id: "portfolio_configuration_update",
    label: "Portefeuilleconfiguratie wijzigen",
    formKind: "generic",
    applyStrategy: "staged_portfolio_configuration",
    description: "Staget UPDATE rows voor client_config.portfolio_configuration.",
  },
  portfolio_configuration_retire: {
    id: "portfolio_configuration_retire",
    label: "Portefeuilleconfiguratie beëindigen",
    formKind: "generic",
    applyStrategy: "staged_portfolio_configuration",
    description: "Staget DELETE/RETIRE rows voor client_config.portfolio_configuration.",
  },
};

const SLUG_TEMPLATE_OVERRIDES: Record<string, WorkflowTemplateId> = {
  portfolio_addition: "portfolio_configuration_create",
  portfolio_configuration_create: "portfolio_configuration_create",
  portfolio_configuration_update: "portfolio_configuration_update",
  portfolio_configuration_retire: "portfolio_configuration_retire",
  client_onboarding: "client_onboarding",
  customer_onboarding: "client_onboarding",
  new_asset_class: "lookup_asset_class",
  new_sub_asset_class: "lookup_sub_asset_class",
  new_benchmark: "new_benchmark_request",
  benchmark_switch: "benchmark_switch",
};

export function resolveWorkflowTemplateId(slugOrWorkflow: string | undefined): WorkflowTemplateId {
  if (!slugOrWorkflow) return "generic_field_change";
  if (slugOrWorkflow in WORKFLOW_TEMPLATES) return slugOrWorkflow as WorkflowTemplateId;
  return SLUG_TEMPLATE_OVERRIDES[slugOrWorkflow] ?? "generic_field_change";
}

export function resolveWorkflowTemplate(slugOrWorkflow: string | undefined): WorkflowTemplate {
  return WORKFLOW_TEMPLATES[resolveWorkflowTemplateId(slugOrWorkflow)];
}
