export type ClientConfigColumnModel = Readonly<{
  name: string;
  type: string;
  nullable: boolean;
  key?: "primary" | "unique" | "foreign";
  references?: string;
  default?: string;
  check?: string;
}>;

export type ClientConfigTableModel = Readonly<{
  name: string;
  purpose: string;
  lifecycle: "live" | "staging" | "audit" | "legacy";
  columns: readonly ClientConfigColumnModel[];
  indexes?: readonly string[];
}>;

export const clientConfigDataModel: readonly ClientConfigTableModel[] = [
  {
    name: "client_config.legal_entity",
    purpose: "Juridische entiteiten die aan accounts gekoppeld kunnen worden.",
    lifecycle: "live",
    columns: [
      { name: "legal_entity_id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "legal_name", type: "varchar(100)", nullable: false, key: "unique", check: "geen regeleinden" },
    ],
  },
  {
    name: "client_config.parent_account",
    purpose: "Hoofdrekeningen waarmee portfolios gegroepeerd worden.",
    lifecycle: "live",
    columns: [
      { name: "parent_account_id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "parent_account_code", type: "varchar(16)", nullable: false, key: "unique", check: "A-Z, 0-9 en underscores" },
      { name: "msa_parent_account_code", type: "varchar(16)", nullable: true, check: "A-Z, 0-9 en underscores" },
      { name: "active_ind", type: "boolean", nullable: false, default: "true" },
    ],
    indexes: ["idx_parent_account_active_ind"],
  },
  {
    name: "client_config.client",
    purpose: "Klantidentiteit binnen de client-configuratie.",
    lifecycle: "live",
    columns: [
      { name: "client_code", type: "varchar(3)", nullable: false, key: "primary", check: "^[A-Z0-9]{1,3}$" },
      { name: "client_name", type: "varchar(100)", nullable: false, key: "unique", check: "geen regeleinden" },
    ],
  },
  {
    name: "client_config.portfolio",
    purpose: "Portfolio-identiteit, optioneel gekoppeld aan een parent account.",
    lifecycle: "live",
    columns: [
      { name: "portfolio_id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "portfolio_code", type: "varchar(15)", nullable: false, key: "unique", check: "^[A-Z0-9]{2,15}$" },
      { name: "parent_account_id", type: "bigint", nullable: true, key: "foreign", references: "client_config.parent_account.parent_account_id" },
      { name: "active_ind", type: "boolean", nullable: false, default: "true" },
    ],
    indexes: ["idx_portfolio_active_ind"],
  },
  {
    name: "client_config.asset_class",
    purpose: "Hoofdclassificaties voor beleggingen.",
    lifecycle: "live",
    columns: [
      { name: "asset_class_id", type: "smallint identity", nullable: false, key: "primary" },
      { name: "asset_class_code", type: "char(2)", nullable: false, key: "unique", check: "^[A-Z]{2}$" },
      { name: "asset_class_name", type: "varchar(30)", nullable: false, key: "unique" },
    ],
  },
  {
    name: "client_config.sub_asset_class",
    purpose: "Subcategorieen binnen een asset class.",
    lifecycle: "live",
    columns: [
      { name: "sub_asset_class_id", type: "smallint identity", nullable: false, key: "primary" },
      { name: "asset_class_id", type: "smallint", nullable: false, key: "foreign", references: "client_config.asset_class.asset_class_id" },
      { name: "sub_asset_class_code", type: "char(3)", nullable: false, check: "^[A-Z]{3}$" },
      { name: "sub_asset_class_name", type: "varchar(100)", nullable: false },
      { name: "sort_order", type: "integer", nullable: true },
    ],
  },
  {
    name: "client_config.manager",
    purpose: "Beheerders of externe tegenpartijen.",
    lifecycle: "live",
    columns: [
      { name: "manager_id", type: "smallint identity", nullable: false, key: "primary" },
      { name: "manager_code", type: "char(3)", nullable: false, key: "unique", check: "^[A-Z0-9]{3}$" },
      { name: "manager_name", type: "varchar(50)", nullable: false, key: "unique" },
    ],
  },
  {
    name: "client_config.benchmark",
    purpose: "Referentie-indexen voor portfolio-configuraties.",
    lifecycle: "live",
    columns: [
      { name: "benchmark_id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "benchmark_code", type: "varchar(60)", nullable: false, key: "unique" },
      { name: "benchmark_name", type: "varchar(100)", nullable: true },
      { name: "rimes_code", type: "varchar(40)", nullable: true },
    ],
  },
  {
    name: "client_config.npc_classification",
    purpose: "Interne NPC-classificaties voor portfolioconfiguraties.",
    lifecycle: "live",
    columns: [
      { name: "npc_classification_id", type: "smallint identity", nullable: false, key: "primary" },
      { name: "classification_name", type: "varchar(80)", nullable: false, key: "unique", check: "geen regeleinden" },
    ],
  },
  {
    name: "client_config.portfolio_configuration",
    purpose: "Effectieve configuratieregels per primary account; de basis voor client-configuratiewijzigingen in Workflow Studio.",
    lifecycle: "live",
    columns: [
      { name: "primary_account_id", type: "varchar(13)", nullable: false, key: "primary" },
      { name: "client_code", type: "varchar(3)", nullable: false, key: "foreign", references: "client_config.client.client_code" },
      { name: "portfolio_code", type: "varchar(15)", nullable: false, key: "foreign", references: "client_config.portfolio.portfolio_code" },
      { name: "asset_class_code", type: "char(2)", nullable: false, key: "foreign", references: "client_config.asset_class.asset_class_code" },
      { name: "sub_asset_class_code", type: "char(3)", nullable: false },
      { name: "manager_code", type: "char(3)", nullable: false, key: "foreign", references: "client_config.manager.manager_code" },
      { name: "benchmark_code", type: "varchar(60)", nullable: false },
      { name: "npc_classification_id", type: "smallint", nullable: false, key: "foreign", references: "client_config.npc_classification.npc_classification_id" },
      { name: "long_name", type: "varchar(255)", nullable: false },
      { name: "short_name", type: "varchar(100)", nullable: false },
      { name: "active_ind", type: "boolean", nullable: false, default: "true" },
      { name: "effective_from", type: "date", nullable: false },
      { name: "effective_until", type: "date", nullable: true },
      { name: "change_request_id", type: "uuid", nullable: true, key: "foreign", references: "change_requests.id" },
      { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
      { name: "updated_at", type: "timestamptz", nullable: false, default: "now()" },
    ],
    indexes: ["idx_pc_portfolio_code", "idx_pc_client_code", "idx_pc_benchmark_code", "idx_pc_active_ind"],
  },
  {
    name: "client_config.change_portfolio_configuration",
    purpose: "Stagingtabel voor CREATE, UPDATE en RETIRE van portfolioconfiguraties.",
    lifecycle: "staging",
    columns: [
      { name: "id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "change_request_id", type: "uuid", nullable: false, key: "foreign", references: "change_requests.id" },
      { name: "action_type", type: "varchar(10)", nullable: false, check: "CREATE, UPDATE, DELETE" },
      { name: "target_primary_account_id", type: "varchar(13)", nullable: true },
      { name: "client_code", type: "varchar(3)", nullable: false, key: "foreign", references: "client_config.client.client_code" },
      { name: "portfolio_code", type: "varchar(15)", nullable: false, key: "foreign", references: "client_config.portfolio.portfolio_code" },
      { name: "asset_class_code", type: "char(2)", nullable: false, key: "foreign", references: "client_config.asset_class.asset_class_code" },
      { name: "sub_asset_class_code", type: "char(3)", nullable: false },
      { name: "manager_code", type: "char(3)", nullable: false, key: "foreign", references: "client_config.manager.manager_code" },
      { name: "benchmark_code", type: "varchar(60)", nullable: false },
      { name: "npc_classification_id", type: "smallint", nullable: false, key: "foreign", references: "client_config.npc_classification.npc_classification_id" },
      { name: "long_name", type: "varchar(255)", nullable: false },
      { name: "short_name", type: "varchar(100)", nullable: false },
      { name: "active_ind", type: "boolean", nullable: false, default: "true" },
      { name: "effective_from", type: "date", nullable: false },
      { name: "effective_until", type: "date", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
      { name: "apply_status", type: "varchar(10)", nullable: true },
      { name: "apply_error", type: "text", nullable: true },
    ],
    indexes: ["idx_cpc_change_request_id", "idx_cpc_target_primary_account_id"],
  },
  {
    name: "client_config.change_lookup_request",
    purpose: "Stagingtabel voor nieuwe asset classes, sub-asset classes en benchmarks.",
    lifecycle: "staging",
    columns: [
      { name: "id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "change_request_id", type: "uuid", nullable: false, key: "foreign", references: "change_requests.id" },
      { name: "dimension", type: "varchar(20)", nullable: false, check: "asset_class, sub_asset_class, benchmark" },
      { name: "asset_class_code", type: "char(2)", nullable: true },
      { name: "asset_class_name", type: "varchar(30)", nullable: true },
      { name: "parent_asset_class_code", type: "char(2)", nullable: true },
      { name: "sub_asset_class_code", type: "char(3)", nullable: true },
      { name: "sub_asset_class_name", type: "varchar(100)", nullable: true },
      { name: "benchmark_code", type: "varchar(60)", nullable: true },
      { name: "benchmark_name", type: "varchar(100)", nullable: true },
      { name: "currency", type: "varchar(3)", nullable: true },
      { name: "sort_order", type: "integer", nullable: true },
      { name: "apply_status", type: "varchar(20)", nullable: false, default: "pending" },
      { name: "apply_error", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
    ],
    indexes: ["idx_clr_change_request_id"],
  },
  {
    name: "client_config.client_onboarding_staging",
    purpose: "Stagingtabel voor nieuwe clients met eerste portfolio en configuratieregel.",
    lifecycle: "staging",
    columns: [
      { name: "staging_id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "change_request_id", type: "uuid", nullable: false, key: "unique", references: "change_requests.id" },
      { name: "client_code", type: "varchar(3)", nullable: false },
      { name: "client_name", type: "varchar(100)", nullable: false },
      { name: "portfolio_code", type: "varchar(15)", nullable: false },
      { name: "parent_account_code", type: "varchar(16)", nullable: true },
      { name: "asset_class_code", type: "char(2)", nullable: false },
      { name: "sub_asset_class_code", type: "char(3)", nullable: false },
      { name: "manager_code", type: "char(3)", nullable: false },
      { name: "benchmark_code", type: "varchar(60)", nullable: false },
      { name: "npc_classification_id", type: "smallint", nullable: false },
      { name: "long_name", type: "varchar(255)", nullable: false },
      { name: "short_name", type: "varchar(100)", nullable: false },
      { name: "effective_from", type: "date", nullable: false },
      { name: "effective_until", type: "date", nullable: true },
      { name: "status", type: "varchar(20)", nullable: false, default: "pending" },
      { name: "apply_error", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
      { name: "updated_at", type: "timestamptz", nullable: false, default: "now()" },
      { name: "processed_at", type: "timestamptz", nullable: true },
    ],
  },
  {
    name: "client_config.change_portfolio_metadata_request",
    purpose: "Stagingtabel voor portfolio- en parent-accountmetadata.",
    lifecycle: "staging",
    columns: [
      { name: "id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "change_request_id", type: "uuid", nullable: false, key: "foreign", references: "change_requests.id" },
      { name: "dimension", type: "text", nullable: false, check: "portfolio, parent_account" },
      { name: "action_type", type: "text", nullable: false, check: "CREATE, RETIRE" },
      { name: "code", type: "text", nullable: false },
      { name: "parent_account_code", type: "text", nullable: true },
      { name: "msa_parent_account_code", type: "text", nullable: true },
      { name: "apply_status", type: "text", nullable: false, default: "pending" },
      { name: "apply_error", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
    ],
  },
  {
    name: "client_config.admin_audit_log",
    purpose: "Auditlog voor nood/bypass-mutaties buiten de normale change flow.",
    lifecycle: "audit",
    columns: [
      { name: "id", type: "bigint identity", nullable: false, key: "primary" },
      { name: "action", type: "text", nullable: false },
      { name: "dimension", type: "text", nullable: false },
      { name: "code", type: "text", nullable: false },
      { name: "actor", type: "text", nullable: false, default: "admin" },
      { name: "details", type: "jsonb", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
    ],
  },
];
