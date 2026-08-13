/**
 * Normalized client_config data access layer.
 *
 * Queries the 3NF client_config schema (portfolio_configuration and its lookup
 * tables) instead of the legacy flat clients/portfolios structure. This module
 * is the runtime counterpart to lib/entities/ and lib/schemas/domain.ts.
 */

import { sql } from "@/lib/db";
import { demoClientConfigReferenceData } from "@/lib/fixtures";
import type {
  ChangePortfolioMetadataRequest,
  ClientConfigAssetClass,
  ClientConfigAssetClassAdmin,
  ClientConfigBenchmark,
  ClientConfigBenchmarkAdmin,
  ClientConfigClient,
  ClientConfigManager,
  ClientConfigManagerAdmin,
  ClientConfigNpcClassification,
  ClientConfigNpcClassificationAdmin,
  ClientConfigParentAccount,
  ClientConfigPortfolio,
  ClientConfigPortfolioConfigurationRow,
  ClientConfigReferenceData,
  ClientConfigSubAssetClass,
  ClientConfigSubAssetClassAdmin,
  BenchmarkSwitchPortfolioOption,
} from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";
import {
  buildPrimaryAccountId,
  validateActionSpecificRules,
  validateChangePortfolioConfiguration,
  validateRequiredFields,
  type ChangeActionType,
} from "@/lib/validation-rules";
import {
  validatePortfolioMetadataChange,
  type PortfolioMetadataChangeInput,
  type PortfolioMetadataDimension,
  type PortfolioMetadataLookup,
} from "@/lib/portfolio-metadata-validation";

/**
 * Safely execute a client_config query, returning the fallback on any failure.
 * Errors are reported to Sentry so silent failures do not hide incidents.
 */
async function withClientConfigQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!sql) return fallback;
  try {
    return await fn();
  } catch (error) {
    captureError(error, { endpoint: "client-config-db", phase: "db_query" });
    return fallback;
  }
}

function mapDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "string") return value.split("T")[0];
  return String(value);
}

function mapPortfolioConfigurationRow(row: Record<string, unknown>): ClientConfigPortfolioConfigurationRow {
  return {
    primaryAccountId: String(row.primary_account_id),
    clientCode: String(row.client_code),
    clientName: row.client_name != null ? String(row.client_name) : null,
    portfolioCode: String(row.portfolio_code),
    parentAccountId: row.parent_account_id != null ? Number(row.parent_account_id) : null,
    parentAccountCode: row.parent_account_code != null ? String(row.parent_account_code) : null,
    assetClassCode: String(row.asset_class_code),
    assetClassName: String(row.asset_class_name),
    subAssetClassCode: String(row.sub_asset_class_code),
    subAssetClassName: String(row.sub_asset_class_name),
    managerCode: String(row.manager_code),
    managerName: String(row.manager_name),
    benchmarkCode: String(row.benchmark_code),
    benchmarkName: row.benchmark_name != null ? String(row.benchmark_name) : null,
    npcClassificationId: Number(row.npc_classification_id),
    npcClassificationName: String(row.classification_name),
    longName: String(row.long_name),
    shortName: String(row.short_name),
    activeInd: row.active_ind === true || String(row.active_ind) === "true",
    effectiveFrom: mapDate(row.effective_from),
    effectiveUntil: row.effective_until != null ? mapDate(row.effective_until) : null,
    changeRequestId: row.change_request_id != null ? String(row.change_request_id) : null,
  };
}

/**
 * Load all active portfolio_configuration rows joined with their lookup tables.
 * Returns an empty array when the database is unavailable or the tables are not
 * yet populated (e.g. fixture/demo mode).
 */
export async function getClientConfigPortfolioConfigurations(): Promise<ClientConfigPortfolioConfigurationRow[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        pc.primary_account_id,
        pc.client_code,
        c.client_name,
        pc.portfolio_code,
        p.parent_account_id,
        pa.parent_account_code,
        pc.asset_class_code,
        ac.asset_class_name,
        pc.sub_asset_class_code,
        sac.sub_asset_class_name,
        pc.manager_code,
        m.manager_name,
        pc.benchmark_code,
        b.benchmark_name,
        pc.npc_classification_id,
        nc.classification_name,
        pc.long_name,
        pc.short_name,
        pc.active_ind,
        pc.effective_from,
        pc.effective_until,
        pc.change_request_id
      FROM client_config.portfolio_configuration pc
      JOIN client_config.client c ON c.client_code = pc.client_code
      JOIN client_config.portfolio p ON p.portfolio_code = pc.portfolio_code
      LEFT JOIN client_config.parent_account pa ON pa.parent_account_id = p.parent_account_id
      JOIN client_config.asset_class ac ON ac.asset_class_code = pc.asset_class_code
      JOIN client_config.sub_asset_class sac
        ON sac.asset_class_id = ac.asset_class_id
        AND sac.sub_asset_class_code = pc.sub_asset_class_code
      JOIN client_config.manager m ON m.manager_code = pc.manager_code
      JOIN client_config.benchmark b ON b.benchmark_code = pc.benchmark_code
      JOIN client_config.npc_classification nc ON nc.npc_classification_id = pc.npc_classification_id
      WHERE pc.active_ind = true
      ORDER BY pc.portfolio_code, ac.asset_class_name, sac.sub_asset_class_name
    `;
    return rows.map(mapPortfolioConfigurationRow);
  }, []);
}

function buildDemoPortfolioConfigurationRows(): ClientConfigPortfolioConfigurationRow[] {
  const clientName = new Map(demoClientConfigReferenceData.clients.map((client) => [client.clientCode, client.clientName]));
  const assetClassName = new Map(demoClientConfigReferenceData.assetClasses.map((assetClass) => [assetClass.assetClassCode, assetClass.assetClassName]));
  const subAssetClassName = new Map(demoClientConfigReferenceData.subAssetClasses.map((subAssetClass) => [subAssetClass.subAssetClassCode, subAssetClass.subAssetClassName]));
  const managerName = new Map(demoClientConfigReferenceData.managers.map((manager) => [manager.managerCode, manager.managerName]));
  const benchmarkName = new Map(demoClientConfigReferenceData.benchmarks.map((benchmark) => [benchmark.benchmarkCode, benchmark.benchmarkName]));
  const classificationName = new Map(demoClientConfigReferenceData.npcClassifications.map((classification) => [classification.npcClassificationId, classification.classificationName]));

  return [
    {
      primaryAccountId: "HOR*EQACX*ROB",
      clientCode: "HOR",
      clientName: clientName.get("HOR") ?? null,
      portfolioCode: "HORRP",
      parentAccountId: null,
      parentAccountCode: null,
      assetClassCode: "EQ",
      assetClassName: assetClassName.get("EQ") ?? "EQUITIES",
      subAssetClassCode: "ACX",
      subAssetClassName: subAssetClassName.get("ACX") ?? "AC WORLD",
      managerCode: "ROB",
      managerName: managerName.get("ROB") ?? "ROBECO",
      benchmarkCode: "MSCI-WORLD-NR",
      benchmarkName: benchmarkName.get("MSCI-WORLD-NR") ?? null,
      npcClassificationId: 2,
      npcClassificationName: classificationName.get(2) ?? "Niet-pensioen (belegd)",
      longName: "Horizon Rendementsportefeuille Aandelen Wereldwijd",
      shortName: "HOR EQ ACX",
      activeInd: true,
      effectiveFrom: "2024-01-01",
      effectiveUntil: null,
      changeRequestId: null,
    },
    {
      primaryAccountId: "HOR*FISOV*ROB",
      clientCode: "HOR",
      clientName: clientName.get("HOR") ?? null,
      portfolioCode: "HOR-MP",
      parentAccountId: null,
      parentAccountCode: null,
      assetClassCode: "FI",
      assetClassName: assetClassName.get("FI") ?? "FIXED INCOME",
      subAssetClassCode: "SOV",
      subAssetClassName: subAssetClassName.get("SOV") ?? "SOVEREIGN EUROPE",
      managerCode: "ROB",
      managerName: managerName.get("ROB") ?? "ROBECO",
      benchmarkCode: "BLOOMBERG-EU-AGG",
      benchmarkName: benchmarkName.get("BLOOMBERG-EU-AGG") ?? null,
      npcClassificationId: 1,
      npcClassificationName: classificationName.get(1) ?? "Geen NPC",
      longName: "Horizon Matchingportefeuille Overheid Europa",
      shortName: "HOR FI SOV",
      activeInd: true,
      effectiveFrom: "2024-01-01",
      effectiveUntil: null,
      changeRequestId: null,
    },
    {
      primaryAccountId: "ZEK*EQDEV*UBS",
      clientCode: "ZEK",
      clientName: clientName.get("ZEK") ?? null,
      portfolioCode: "ZEK-RET",
      parentAccountId: null,
      parentAccountCode: null,
      assetClassCode: "EQ",
      assetClassName: assetClassName.get("EQ") ?? "EQUITIES",
      subAssetClassCode: "DEV",
      subAssetClassName: subAssetClassName.get("DEV") ?? "DEVELOPED MARKETS",
      managerCode: "UBS",
      managerName: managerName.get("UBS") ?? "UBS",
      benchmarkCode: "MSCI-ACWI-NR",
      benchmarkName: benchmarkName.get("MSCI-ACWI-NR") ?? null,
      npcClassificationId: 2,
      npcClassificationName: classificationName.get(2) ?? "Niet-pensioen (belegd)",
      longName: "Zeker Returnportefeuille Ontwikkelde Markten",
      shortName: "ZEK EQ DEV",
      activeInd: true,
      effectiveFrom: "2024-01-01",
      effectiveUntil: null,
      changeRequestId: null,
    },
  ];
}

export async function getBenchmarkSwitchPortfolioOptions(): Promise<BenchmarkSwitchPortfolioOption[]> {
  const fallback = buildDemoPortfolioConfigurationRows();
  const rows = await getClientConfigPortfolioConfigurations();
  const sourceRows = rows.length > 0 ? rows : fallback;
  return sourceRows.filter((row) => row.activeInd);
}

export async function getConflictingClientConfigPrimaryAccountIds(
  primaryAccountIds: string[],
): Promise<Set<string>> {
  if (!sql || primaryAccountIds.length === 0) return new Set();
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT DISTINCT cpc.target_primary_account_id
      FROM client_config.change_portfolio_configuration cpc
      JOIN change_requests cr ON cr.id = cpc.change_request_id
      WHERE cpc.target_primary_account_id = ANY(${primaryAccountIds})
        AND cpc.apply_status IS DISTINCT FROM 'applied'
        AND cr.status NOT IN ('processed', 'validated', 'rejected', 'failed')
    `;
    return new Set(rows.map((row: Record<string, unknown>) => String(row.target_primary_account_id)));
  }, new Set<string>());
}

function mapPortfolio(row: Record<string, unknown>): ClientConfigPortfolio {
  return {
    portfolioId: Number(row.portfolio_id),
    portfolioCode: String(row.portfolio_code),
    parentAccountId: row.parent_account_id != null ? Number(row.parent_account_id) : null,
    activeInd: row.active_ind === true || String(row.active_ind) === "true",
  };
}

function mapParentAccount(row: Record<string, unknown>): ClientConfigParentAccount {
  return {
    parentAccountId: Number(row.parent_account_id),
    parentAccountCode: String(row.parent_account_code),
    msaParentAccountCode: row.msa_parent_account_code != null ? String(row.msa_parent_account_code) : null,
    activeInd: row.active_ind === true || String(row.active_ind) === "true",
  };
}

function mapClient(row: Record<string, unknown>): ClientConfigClient {
  return {
    clientCode: String(row.client_code),
    clientName: String(row.client_name),
  };
}

function mapAssetClass(row: Record<string, unknown>): ClientConfigAssetClass {
  return {
    assetClassId: Number(row.asset_class_id),
    assetClassCode: String(row.asset_class_code),
    assetClassName: String(row.asset_class_name),
  };
}

function mapSubAssetClass(row: Record<string, unknown>): ClientConfigSubAssetClass {
  return {
    subAssetClassId: Number(row.sub_asset_class_id),
    assetClassId: Number(row.asset_class_id),
    subAssetClassCode: String(row.sub_asset_class_code),
    subAssetClassName: String(row.sub_asset_class_name),
    sortOrder: row.sort_order == null ? null : Number(row.sort_order),
  };
}

function mapManager(row: Record<string, unknown>): ClientConfigManager {
  return {
    managerId: Number(row.manager_id),
    managerCode: String(row.manager_code),
    managerName: String(row.manager_name),
  };
}

function mapBenchmark(row: Record<string, unknown>): ClientConfigBenchmark {
  return {
    benchmarkId: Number(row.benchmark_id),
    benchmarkCode: String(row.benchmark_code),
    benchmarkName: row.benchmark_name != null ? String(row.benchmark_name) : null,
    rimesCode: row.rimes_code != null ? String(row.rimes_code) : null,
  };
}

function mapNpcClassification(row: Record<string, unknown>): ClientConfigNpcClassification {
  return {
    npcClassificationId: Number(row.npc_classification_id),
    classificationName: String(row.classification_name),
  };
}

/**
 * Load all reference data needed to populate normalized change-request forms.
 */
export async function getClientConfigReferenceData(): Promise<ClientConfigReferenceData> {
  return withClientConfigQuery(async () => {
    const [clients, portfolios, assetClasses, subAssetClasses, managers, benchmarks, npcClassifications, parentAccounts] = await Promise.all([
      sql!`SELECT client_code, client_name FROM client_config.client ORDER BY client_code`,
      sql!`SELECT portfolio_id, portfolio_code, parent_account_id, active_ind FROM client_config.portfolio WHERE active_ind = true ORDER BY portfolio_code`,
      sql!`SELECT asset_class_id, asset_class_code, asset_class_name FROM client_config.asset_class ORDER BY asset_class_name`,
      sql!`SELECT sub_asset_class_id, asset_class_id, sub_asset_class_code, sub_asset_class_name, sort_order FROM client_config.sub_asset_class ORDER BY asset_class_id, sort_order NULLS LAST, sub_asset_class_name`,
      sql!`SELECT manager_id, manager_code, manager_name FROM client_config.manager ORDER BY manager_name`,
      sql!`SELECT benchmark_id, benchmark_code, benchmark_name, rimes_code FROM client_config.benchmark ORDER BY benchmark_code`,
      sql!`SELECT npc_classification_id, classification_name FROM client_config.npc_classification ORDER BY classification_name`,
      sql!`SELECT parent_account_id, parent_account_code, msa_parent_account_code, active_ind FROM client_config.parent_account WHERE active_ind = true ORDER BY parent_account_code`,
    ]);

    return {
      clients: clients.map(mapClient),
      portfolios: portfolios.map(mapPortfolio),
      assetClasses: assetClasses.map(mapAssetClass),
      subAssetClasses: subAssetClasses.map(mapSubAssetClass),
      managers: managers.map(mapManager),
      benchmarks: benchmarks.map(mapBenchmark),
      npcClassifications: npcClassifications.map(mapNpcClassification),
      parentAccounts: parentAccounts.map(mapParentAccount),
    };
  }, demoClientConfigReferenceData);
}

/**
 * Result of a code-uniqueness check for the onboarding wizard.
 *
 * `clientCodeTaken` / `portfolioCodeTaken` / `parentAccountCodeTaken` are false
 * when the code is free to use. `*Message` carries a human-readable Dutch
 * explanation when the code is already in use (e.g. which client owns it),
 * null when it is free.
 */
export interface CodeUniquenessResult {
  clientCodeTaken: boolean;
  portfolioCodeTaken: boolean;
  parentAccountCodeTaken: boolean;
  clientCodeMessage: string | null;
  portfolioCodeMessage: string | null;
  parentAccountCodeMessage: string | null;
}

/**
 * Check whether a client code and/or portfolio code are already in use.
 *
 * "In use" means the code exists in the live client_config tables
 * (client_config.client / client_config.portfolio / client_config.parent_account)
 * OR is reserved by a pending client_onboarding_staging row (an onboarding
 * change request that has been submitted but not yet applied). Codes reserved
 * by pending onboarding requests must also be rejected so two wizards cannot
 * claim the same code.
 *
 * When no database is available (demo/fixture mode) the check runs against
 * the demo fixture data so the e2e environment still sees realistic
 * duplicates (HOR, ZEK, HOR-RP, HOOFD_HOR, …).
 */
export async function checkCodeUniqueness(input: {
  clientCode?: string;
  portfolioCode?: string;
  parentAccountCode?: string;
}): Promise<CodeUniquenessResult> {
  const empty: CodeUniquenessResult = {
    clientCodeTaken: false,
    portfolioCodeTaken: false,
    parentAccountCodeTaken: false,
    clientCodeMessage: null,
    portfolioCodeMessage: null,
    parentAccountCodeMessage: null,
  };
  if (!input.clientCode && !input.portfolioCode && !input.parentAccountCode) return empty;

  return withClientConfigQuery(async () => {
    const [clientRows, portfolioRows, parentAccountRows, pendingClientRows, pendingPortfolioRows] = await Promise.all([
      input.clientCode
        ? sql!`SELECT client_code, client_name FROM client_config.client WHERE client_code = ${input.clientCode}`
        : Promise.resolve([]),
      input.portfolioCode
        ? sql!`SELECT portfolio_code FROM client_config.portfolio WHERE portfolio_code = ${input.portfolioCode}`
        : Promise.resolve([]),
      input.parentAccountCode
        ? sql!`SELECT parent_account_code FROM client_config.parent_account WHERE parent_account_code = ${input.parentAccountCode}`
        : Promise.resolve([]),
      input.clientCode
        ? sql!`SELECT client_code FROM client_config.client_onboarding_staging WHERE client_code = ${input.clientCode} AND status = 'pending'`
        : Promise.resolve([]),
      input.portfolioCode
        ? sql!`SELECT portfolio_code FROM client_config.client_onboarding_staging WHERE portfolio_code = ${input.portfolioCode} AND status = 'pending'`
        : Promise.resolve([]),
    ]);

    const clientTaken = clientRows.length > 0 || pendingClientRows.length > 0;
    const portfolioTaken = portfolioRows.length > 0 || pendingPortfolioRows.length > 0;
    const parentAccountTaken = parentAccountRows.length > 0;

    return {
      clientCodeTaken: clientTaken,
      portfolioCodeTaken: portfolioTaken,
      parentAccountCodeTaken: parentAccountTaken,
      clientCodeMessage: clientTaken
        ? `Klantcode ${input.clientCode} is al in gebruik.`
        : null,
      portfolioCodeMessage: portfolioTaken
        ? `Portfoliocode ${input.portfolioCode} is al in gebruik.`
        : null,
      parentAccountCodeMessage: parentAccountTaken
        ? `Parent account code ${input.parentAccountCode} is al in gebruik.`
        : null,
    };
  }, checkCodeUniquenessAgainstDemo(input));
}

/**
 * Demo/fixture fallback for checkCodeUniqueness: matches codes against the
 * demo client_config fixtures so no-DB environments (e2e, Storybook-like
 * renders) still report realistic duplicates.
 */
function checkCodeUniquenessAgainstDemo(input: {
  clientCode?: string;
  portfolioCode?: string;
  parentAccountCode?: string;
}): CodeUniquenessResult {
  const clientTaken =
    input.clientCode != null &&
    demoClientConfigReferenceData.clients.some((c) => c.clientCode === input.clientCode);
  const portfolioTaken =
    input.portfolioCode != null &&
    demoClientConfigReferenceData.portfolios.some((p) => p.portfolioCode === input.portfolioCode);
  const parentAccountTaken =
    input.parentAccountCode != null &&
    demoClientConfigReferenceData.parentAccounts.some(
      (pa) => pa.parentAccountCode === input.parentAccountCode,
    );

  return {
    clientCodeTaken: clientTaken,
    portfolioCodeTaken: portfolioTaken,
    parentAccountCodeTaken: parentAccountTaken,
    clientCodeMessage: clientTaken ? `Klantcode ${input.clientCode} is al in gebruik.` : null,
    portfolioCodeMessage: portfolioTaken
      ? `Portfoliocode ${input.portfolioCode} is al in gebruik.`
      : null,
    parentAccountCodeMessage: parentAccountTaken
      ? `Parent account code ${input.parentAccountCode} is al in gebruik.`
      : null,
  };
}

export async function getClientConfigAssetClassAdminRows(): Promise<ClientConfigAssetClassAdmin[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        ac.asset_class_id,
        ac.asset_class_code,
        ac.asset_class_name,
        COUNT(DISTINCT sac.sub_asset_class_id)::int AS sub_asset_class_count,
        COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
        COUNT(DISTINCT acc.primary_account_id)::int AS account_count
      FROM client_config.asset_class ac
      LEFT JOIN client_config.sub_asset_class sac ON sac.asset_class_id = ac.asset_class_id
      LEFT JOIN client_config.portfolio_configuration pc ON pc.asset_class_code = ac.asset_class_code
      LEFT JOIN client_config.account acc ON acc.asset_class_id = ac.asset_class_id
      GROUP BY ac.asset_class_id, ac.asset_class_code, ac.asset_class_name
      ORDER BY ac.asset_class_name
    `;

    return rows.map((row: Record<string, unknown>) => ({
      ...mapAssetClass(row),
      subAssetClassCount: Number(row.sub_asset_class_count ?? 0),
      portfolioConfigurationCount: Number(row.portfolio_configuration_count ?? 0),
      accountCount: Number(row.account_count ?? 0),
    }));
  }, []);
}

export async function getClientConfigSubAssetClassAdminRows(): Promise<ClientConfigSubAssetClassAdmin[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        sac.sub_asset_class_id,
        sac.asset_class_id,
        sac.sub_asset_class_code,
        sac.sub_asset_class_name,
        sac.sort_order,
        ac.asset_class_code,
        ac.asset_class_name,
        COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
        COUNT(DISTINCT acc.primary_account_id)::int AS account_count
      FROM client_config.sub_asset_class sac
      JOIN client_config.asset_class ac ON ac.asset_class_id = sac.asset_class_id
      LEFT JOIN client_config.portfolio_configuration pc
        ON pc.asset_class_code = ac.asset_class_code
        AND pc.sub_asset_class_code = sac.sub_asset_class_code
      LEFT JOIN client_config.account acc ON acc.sub_asset_class_id = sac.sub_asset_class_id
      GROUP BY
        sac.sub_asset_class_id,
        sac.asset_class_id,
        sac.sub_asset_class_code,
        sac.sub_asset_class_name,
        sac.sort_order,
        ac.asset_class_code,
        ac.asset_class_name
      ORDER BY ac.asset_class_name, sac.sort_order NULLS LAST, sac.sub_asset_class_name
    `;

    return rows.map((row: Record<string, unknown>) => ({
      ...mapSubAssetClass(row),
      assetClassCode: String(row.asset_class_code),
      assetClassName: String(row.asset_class_name),
      portfolioConfigurationCount: Number(row.portfolio_configuration_count ?? 0),
      accountCount: Number(row.account_count ?? 0),
    }));
  }, []);
}

export async function getClientConfigManagerAdminRows(): Promise<ClientConfigManagerAdmin[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        m.manager_id,
        m.manager_code,
        m.manager_name,
        COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
        COUNT(DISTINCT acc.primary_account_id)::int AS account_count
      FROM client_config.manager m
      LEFT JOIN client_config.portfolio_configuration pc ON pc.manager_code = m.manager_code
      LEFT JOIN client_config.account acc ON acc.manager_id = m.manager_id
      GROUP BY m.manager_id, m.manager_code, m.manager_name
      ORDER BY m.manager_name
    `;

    return rows.map((row: Record<string, unknown>) => ({
      ...mapManager(row),
      portfolioConfigurationCount: Number(row.portfolio_configuration_count ?? 0),
      accountCount: Number(row.account_count ?? 0),
    }));
  }, []);
}

export async function getClientConfigBenchmarkAdminRows(): Promise<ClientConfigBenchmarkAdmin[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        b.benchmark_id,
        b.benchmark_code,
        b.benchmark_name,
        b.rimes_code,
        COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
        COUNT(DISTINCT acc.primary_account_id)::int AS account_count
      FROM client_config.benchmark b
      LEFT JOIN client_config.portfolio_configuration pc ON pc.benchmark_code = b.benchmark_code
      LEFT JOIN client_config.account acc ON acc.benchmark_id = b.benchmark_id
      GROUP BY b.benchmark_id, b.benchmark_code, b.benchmark_name, b.rimes_code
      ORDER BY b.benchmark_code
    `;

    return rows.map((row: Record<string, unknown>) => ({
      ...mapBenchmark(row),
      portfolioConfigurationCount: Number(row.portfolio_configuration_count ?? 0),
      accountCount: Number(row.account_count ?? 0),
    }));
  }, []);
}

export async function getClientConfigNpcClassificationAdminRows(): Promise<ClientConfigNpcClassificationAdmin[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        nc.npc_classification_id,
        nc.classification_name,
        COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count
      FROM client_config.npc_classification nc
      LEFT JOIN client_config.portfolio_configuration pc ON pc.npc_classification_id = nc.npc_classification_id
      GROUP BY nc.npc_classification_id, nc.classification_name
      ORDER BY nc.classification_name
    `;

    return rows.map((row: Record<string, unknown>) => ({
      ...mapNpcClassification(row),
      portfolioConfigurationCount: Number(row.portfolio_configuration_count ?? 0),
    }));
  }, []);
}

async function assertAssetClassCodeIsEditable(assetClassId: number): Promise<void> {
  const rows = await sql!`
    SELECT
      EXISTS (SELECT 1 FROM client_config.portfolio_configuration pc JOIN client_config.asset_class ac ON ac.asset_class_code = pc.asset_class_code WHERE ac.asset_class_id = ${assetClassId}) AS used_in_portfolio_configuration,
      EXISTS (SELECT 1 FROM client_config.account WHERE asset_class_id = ${assetClassId}) AS used_in_account
  `;
  if (rows[0]?.used_in_portfolio_configuration || rows[0]?.used_in_account) {
    throw new Error("De shortcode kan niet worden gewijzigd omdat deze asset class in gebruik is.");
  }
}

async function assertSubAssetClassCodeIsEditable(subAssetClassId: number): Promise<void> {
  const rows = await sql!`
    SELECT
      EXISTS (
        SELECT 1
        FROM client_config.portfolio_configuration pc
        JOIN client_config.sub_asset_class sac ON sac.sub_asset_class_code = pc.sub_asset_class_code
        JOIN client_config.asset_class ac
          ON ac.asset_class_id = sac.asset_class_id
          AND ac.asset_class_code = pc.asset_class_code
        WHERE sac.sub_asset_class_id = ${subAssetClassId}
      ) AS used_in_portfolio_configuration,
      EXISTS (SELECT 1 FROM client_config.account WHERE sub_asset_class_id = ${subAssetClassId}) AS used_in_account
  `;
  if (rows[0]?.used_in_portfolio_configuration || rows[0]?.used_in_account) {
    throw new Error("De shortcode kan niet worden gewijzigd omdat deze sub asset class in gebruik is.");
  }
}

async function assertManagerCodeIsEditable(managerId: number): Promise<void> {
  const rows = await sql!`
    SELECT
      EXISTS (SELECT 1 FROM client_config.portfolio_configuration pc JOIN client_config.manager m ON m.manager_code = pc.manager_code WHERE m.manager_id = ${managerId}) AS used_in_portfolio_configuration,
      EXISTS (SELECT 1 FROM client_config.account WHERE manager_id = ${managerId}) AS used_in_account
  `;
  if (rows[0]?.used_in_portfolio_configuration || rows[0]?.used_in_account) {
    throw new Error("De shortcode kan niet worden gewijzigd omdat deze manager in gebruik is.");
  }
}

async function assertBenchmarkCodeIsEditable(benchmarkId: number): Promise<void> {
  const rows = await sql!`
    SELECT
      EXISTS (SELECT 1 FROM client_config.portfolio_configuration pc JOIN client_config.benchmark b ON b.benchmark_code = pc.benchmark_code WHERE b.benchmark_id = ${benchmarkId}) AS used_in_portfolio_configuration,
      EXISTS (SELECT 1 FROM client_config.account WHERE benchmark_id = ${benchmarkId}) AS used_in_account
  `;
  if (rows[0]?.used_in_portfolio_configuration || rows[0]?.used_in_account) {
    throw new Error("De benchmarkcode kan niet worden gewijzigd omdat deze benchmark in gebruik is.");
  }
}

export async function createClientConfigAssetClass(input: {
  assetClassCode: string;
  assetClassName: string;
}): Promise<ClientConfigAssetClass> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    INSERT INTO client_config.asset_class (asset_class_code, asset_class_name)
    VALUES (${input.assetClassCode}, ${input.assetClassName})
    RETURNING asset_class_id, asset_class_code, asset_class_name
  `;
  return mapAssetClass(rows[0]);
}

export async function updateClientConfigAssetClass(input: {
  assetClassId: number;
  assetClassCode: string;
  assetClassName: string;
}): Promise<ClientConfigAssetClass> {
  if (!sql) throw new Error("Database not available");
  const current = await sql!`
    SELECT asset_class_code FROM client_config.asset_class WHERE asset_class_id = ${input.assetClassId}
  `;
  if (current.length === 0) throw new Error("Asset class bestaat niet.");
  if (String(current[0].asset_class_code) !== input.assetClassCode) {
    await assertAssetClassCodeIsEditable(input.assetClassId);
  }

  const rows = await sql!`
    UPDATE client_config.asset_class
    SET asset_class_code = ${input.assetClassCode},
        asset_class_name = ${input.assetClassName}
    WHERE asset_class_id = ${input.assetClassId}
    RETURNING asset_class_id, asset_class_code, asset_class_name
  `;
  return mapAssetClass(rows[0]);
}

export async function deleteClientConfigAssetClass(assetClassId: number): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    SELECT
      COUNT(DISTINCT sac.sub_asset_class_id)::int AS sub_asset_class_count,
      COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
      COUNT(DISTINCT acc.primary_account_id)::int AS account_count
    FROM client_config.asset_class ac
    LEFT JOIN client_config.sub_asset_class sac ON sac.asset_class_id = ac.asset_class_id
    LEFT JOIN client_config.portfolio_configuration pc ON pc.asset_class_code = ac.asset_class_code
    LEFT JOIN client_config.account acc ON acc.asset_class_id = ac.asset_class_id
    WHERE ac.asset_class_id = ${assetClassId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Asset class bestaat niet.");
  if (Number(row.sub_asset_class_count ?? 0) > 0) {
    throw new Error("Verwijder eerst de gekoppelde sub asset classes.");
  }
  if (Number(row.portfolio_configuration_count ?? 0) > 0 || Number(row.account_count ?? 0) > 0) {
    throw new Error("Deze asset class is in gebruik en kan niet worden verwijderd.");
  }

  await sql!`DELETE FROM client_config.asset_class WHERE asset_class_id = ${assetClassId}`;
}

export async function createClientConfigSubAssetClass(input: {
  assetClassId: number;
  subAssetClassCode: string;
  subAssetClassName: string;
  sortOrder: number | null;
}): Promise<ClientConfigSubAssetClass> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    INSERT INTO client_config.sub_asset_class (
      asset_class_id,
      sub_asset_class_code,
      sub_asset_class_name,
      sort_order
    ) VALUES (
      ${input.assetClassId},
      ${input.subAssetClassCode},
      ${input.subAssetClassName},
      ${input.sortOrder}
    )
    RETURNING sub_asset_class_id, asset_class_id, sub_asset_class_code, sub_asset_class_name, sort_order
  `;
  return mapSubAssetClass(rows[0]);
}

export async function updateClientConfigSubAssetClass(input: {
  subAssetClassId: number;
  assetClassId: number;
  subAssetClassCode: string;
  subAssetClassName: string;
  sortOrder: number | null;
}): Promise<ClientConfigSubAssetClass> {
  if (!sql) throw new Error("Database not available");
  const current = await sql!`
    SELECT asset_class_id, sub_asset_class_code
    FROM client_config.sub_asset_class
    WHERE sub_asset_class_id = ${input.subAssetClassId}
  `;
  if (current.length === 0) throw new Error("Sub asset class bestaat niet.");
  if (
    Number(current[0].asset_class_id) !== input.assetClassId ||
    String(current[0].sub_asset_class_code) !== input.subAssetClassCode
  ) {
    await assertSubAssetClassCodeIsEditable(input.subAssetClassId);
  }

  const rows = await sql!`
    UPDATE client_config.sub_asset_class
    SET asset_class_id = ${input.assetClassId},
        sub_asset_class_code = ${input.subAssetClassCode},
        sub_asset_class_name = ${input.subAssetClassName},
        sort_order = ${input.sortOrder}
    WHERE sub_asset_class_id = ${input.subAssetClassId}
    RETURNING sub_asset_class_id, asset_class_id, sub_asset_class_code, sub_asset_class_name, sort_order
  `;
  return mapSubAssetClass(rows[0]);
}

export async function deleteClientConfigSubAssetClass(subAssetClassId: number): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    SELECT
      COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
      COUNT(DISTINCT acc.primary_account_id)::int AS account_count
    FROM client_config.sub_asset_class sac
    JOIN client_config.asset_class ac ON ac.asset_class_id = sac.asset_class_id
    LEFT JOIN client_config.portfolio_configuration pc
      ON pc.asset_class_code = ac.asset_class_code
      AND pc.sub_asset_class_code = sac.sub_asset_class_code
    LEFT JOIN client_config.account acc ON acc.sub_asset_class_id = sac.sub_asset_class_id
    WHERE sac.sub_asset_class_id = ${subAssetClassId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Sub asset class bestaat niet.");
  if (Number(row.portfolio_configuration_count ?? 0) > 0 || Number(row.account_count ?? 0) > 0) {
    throw new Error("Deze sub asset class is in gebruik en kan niet worden verwijderd.");
  }

  await sql!`DELETE FROM client_config.sub_asset_class WHERE sub_asset_class_id = ${subAssetClassId}`;
}

export async function createClientConfigManager(input: {
  managerCode: string;
  managerName: string;
}): Promise<ClientConfigManager> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    INSERT INTO client_config.manager (manager_code, manager_name)
    VALUES (${input.managerCode}, ${input.managerName})
    RETURNING manager_id, manager_code, manager_name
  `;
  return mapManager(rows[0]);
}

export async function updateClientConfigManager(input: {
  managerId: number;
  managerCode: string;
  managerName: string;
}): Promise<ClientConfigManager> {
  if (!sql) throw new Error("Database not available");
  const current = await sql!`
    SELECT manager_code FROM client_config.manager WHERE manager_id = ${input.managerId}
  `;
  if (current.length === 0) throw new Error("Manager bestaat niet.");
  if (String(current[0].manager_code) !== input.managerCode) {
    await assertManagerCodeIsEditable(input.managerId);
  }

  const rows = await sql!`
    UPDATE client_config.manager
    SET manager_code = ${input.managerCode},
        manager_name = ${input.managerName}
    WHERE manager_id = ${input.managerId}
    RETURNING manager_id, manager_code, manager_name
  `;
  return mapManager(rows[0]);
}

export async function deleteClientConfigManager(managerId: number): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    SELECT
      COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
      COUNT(DISTINCT acc.primary_account_id)::int AS account_count
    FROM client_config.manager m
    LEFT JOIN client_config.portfolio_configuration pc ON pc.manager_code = m.manager_code
    LEFT JOIN client_config.account acc ON acc.manager_id = m.manager_id
    WHERE m.manager_id = ${managerId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Manager bestaat niet.");
  if (Number(row.portfolio_configuration_count ?? 0) > 0 || Number(row.account_count ?? 0) > 0) {
    throw new Error("Deze manager is in gebruik en kan niet worden verwijderd.");
  }

  await sql!`DELETE FROM client_config.manager WHERE manager_id = ${managerId}`;
}

export async function createClientConfigBenchmark(input: {
  benchmarkCode: string;
  benchmarkName: string | null;
  rimesCode: string | null;
}): Promise<ClientConfigBenchmark> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    INSERT INTO client_config.benchmark (benchmark_code, benchmark_name, rimes_code)
    VALUES (${input.benchmarkCode}, ${input.benchmarkName}, ${input.rimesCode})
    RETURNING benchmark_id, benchmark_code, benchmark_name, rimes_code
  `;
  return mapBenchmark(rows[0]);
}

export async function updateClientConfigBenchmark(input: {
  benchmarkId: number;
  benchmarkCode: string;
  benchmarkName: string | null;
  rimesCode: string | null;
}): Promise<ClientConfigBenchmark> {
  if (!sql) throw new Error("Database not available");
  const current = await sql!`
    SELECT benchmark_code FROM client_config.benchmark WHERE benchmark_id = ${input.benchmarkId}
  `;
  if (current.length === 0) throw new Error("Benchmark bestaat niet.");
  if (String(current[0].benchmark_code) !== input.benchmarkCode) {
    await assertBenchmarkCodeIsEditable(input.benchmarkId);
  }

  const rows = await sql!`
    UPDATE client_config.benchmark
    SET benchmark_code = ${input.benchmarkCode},
        benchmark_name = ${input.benchmarkName},
        rimes_code = ${input.rimesCode}
    WHERE benchmark_id = ${input.benchmarkId}
    RETURNING benchmark_id, benchmark_code, benchmark_name, rimes_code
  `;
  return mapBenchmark(rows[0]);
}

export async function deleteClientConfigBenchmark(benchmarkId: number): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    SELECT
      COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count,
      COUNT(DISTINCT acc.primary_account_id)::int AS account_count
    FROM client_config.benchmark b
    LEFT JOIN client_config.portfolio_configuration pc ON pc.benchmark_code = b.benchmark_code
    LEFT JOIN client_config.account acc ON acc.benchmark_id = b.benchmark_id
    WHERE b.benchmark_id = ${benchmarkId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Benchmark bestaat niet.");
  if (Number(row.portfolio_configuration_count ?? 0) > 0 || Number(row.account_count ?? 0) > 0) {
    throw new Error("Deze benchmark is in gebruik en kan niet worden verwijderd.");
  }

  await sql!`DELETE FROM client_config.benchmark WHERE benchmark_id = ${benchmarkId}`;
}

export async function createClientConfigNpcClassification(input: {
  classificationName: string;
}): Promise<ClientConfigNpcClassification> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    INSERT INTO client_config.npc_classification (classification_name)
    VALUES (${input.classificationName})
    RETURNING npc_classification_id, classification_name
  `;
  return mapNpcClassification(rows[0]);
}

export async function updateClientConfigNpcClassification(input: {
  npcClassificationId: number;
  classificationName: string;
}): Promise<ClientConfigNpcClassification> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    UPDATE client_config.npc_classification
    SET classification_name = ${input.classificationName}
    WHERE npc_classification_id = ${input.npcClassificationId}
    RETURNING npc_classification_id, classification_name
  `;
  if (rows.length === 0) throw new Error("NPC classificatie bestaat niet.");
  return mapNpcClassification(rows[0]);
}

export async function deleteClientConfigNpcClassification(npcClassificationId: number): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    SELECT COUNT(DISTINCT pc.primary_account_id)::int AS portfolio_configuration_count
    FROM client_config.npc_classification nc
    LEFT JOIN client_config.portfolio_configuration pc ON pc.npc_classification_id = nc.npc_classification_id
    WHERE nc.npc_classification_id = ${npcClassificationId}
  `;
  const row = rows[0];
  if (!row) throw new Error("NPC classificatie bestaat niet.");
  if (Number(row.portfolio_configuration_count ?? 0) > 0) {
    throw new Error("Deze NPC classificatie is in gebruik en kan niet worden verwijderd.");
  }

  await sql!`DELETE FROM client_config.npc_classification WHERE npc_classification_id = ${npcClassificationId}`;
}

/**
 * Load a single portfolio_configuration row by primary_account_id.
 */
export async function getClientConfigPortfolioConfigurationById(
  primaryAccountId: string,
): Promise<ClientConfigPortfolioConfigurationRow | null> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        pc.primary_account_id,
        pc.client_code,
        c.client_name,
        pc.portfolio_code,
        p.parent_account_id,
        pa.parent_account_code,
        pc.asset_class_code,
        ac.asset_class_name,
        pc.sub_asset_class_code,
        sac.sub_asset_class_name,
        pc.manager_code,
        m.manager_name,
        pc.benchmark_code,
        b.benchmark_name,
        pc.npc_classification_id,
        nc.classification_name,
        pc.long_name,
        pc.short_name,
        pc.active_ind,
        pc.effective_from,
        pc.effective_until,
        pc.change_request_id
      FROM client_config.portfolio_configuration pc
      JOIN client_config.client c ON c.client_code = pc.client_code
      JOIN client_config.portfolio p ON p.portfolio_code = pc.portfolio_code
      LEFT JOIN client_config.parent_account pa ON pa.parent_account_id = p.parent_account_id
      JOIN client_config.asset_class ac ON ac.asset_class_code = pc.asset_class_code
      JOIN client_config.sub_asset_class sac
        ON sac.asset_class_id = ac.asset_class_id
        AND sac.sub_asset_class_code = pc.sub_asset_class_code
      JOIN client_config.manager m ON m.manager_code = pc.manager_code
      JOIN client_config.benchmark b ON b.benchmark_code = pc.benchmark_code
      JOIN client_config.npc_classification nc ON nc.npc_classification_id = pc.npc_classification_id
      WHERE pc.primary_account_id = ${primaryAccountId}
      LIMIT 1
    `;
    return rows.length > 0 ? mapPortfolioConfigurationRow(rows[0]) : null;
  }, null);
}

/**
 * Insert a staged change_portfolio_configuration row for a change request.
 */
export async function saveChangePortfolioConfiguration(
  input: {
    changeRequestId: string;
    actionType: ChangeActionType;
    /** Original primary_account_id of the live row this change targets (UPDATE/DELETE). */
    targetPrimaryAccountId?: string | null;
    clientCode: string;
    portfolioCode: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    longName: string;
    shortName: string;
    activeInd?: boolean;
    effectiveFrom: string;
    effectiveUntil: string | null;
  },
): Promise<string> {
  if (!sql) throw new Error("Database not available");

  const rows = await sql!`
    INSERT INTO client_config.change_portfolio_configuration (
      change_request_id,
      action_type,
      target_primary_account_id,
      client_code,
      portfolio_code,
      asset_class_code,
      sub_asset_class_code,
      manager_code,
      benchmark_code,
      npc_classification_id,
      long_name,
      short_name,
      effective_from,
      effective_until,
      active_ind
    ) VALUES (
      ${input.changeRequestId},
      ${input.actionType},
      ${input.targetPrimaryAccountId ?? null},
      ${input.clientCode},
      ${input.portfolioCode},
      ${input.assetClassCode},
      ${input.subAssetClassCode},
      ${input.managerCode},
      ${input.benchmarkCode},
      ${input.npcClassificationId},
      ${input.longName},
      ${input.shortName},
      ${input.effectiveFrom},
      ${input.effectiveUntil},
      ${input.activeInd ?? true}
    )
    RETURNING id
  `;
  return String(rows[0].id);
}

/**
 * Read all staged change_portfolio_configuration rows for a change request.
 * Used by the change-processor when applying a change to the live
 * portfolio_configuration table, and by the change detail page for
 * rendering staged rows and their apply outcomes.
 */
export async function getChangePortfolioConfigurations(
  changeRequestId: string,
): Promise<
  Array<{
    id: number;
    changeRequestId: string;
    actionType: ChangeActionType;
    /** Original primary_account_id of the live row this change targets (null for CREATE). */
    targetPrimaryAccountId: string | null;
    clientCode: string;
    portfolioCode: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    longName: string;
    shortName: string;
    activeInd: boolean;
    effectiveFrom: string;
    effectiveUntil: string | null;
    applyStatus: string | null;
    applyError: string | null;
  }>
> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        id,
        change_request_id,
        action_type,
        target_primary_account_id,
        client_code,
        portfolio_code,
        asset_class_code,
        sub_asset_class_code,
        manager_code,
        benchmark_code,
        npc_classification_id,
        long_name,
        short_name,
        active_ind,
        effective_from,
        effective_until,
        apply_status,
        apply_error
      FROM client_config.change_portfolio_configuration
      WHERE change_request_id = ${changeRequestId}
      ORDER BY id ASC
    `;
    return rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      changeRequestId: String(row.change_request_id),
      actionType: String(row.action_type) as ChangeActionType,
      targetPrimaryAccountId: row.target_primary_account_id != null ? String(row.target_primary_account_id) : null,
      clientCode: String(row.client_code),
      portfolioCode: String(row.portfolio_code),
      assetClassCode: String(row.asset_class_code),
      subAssetClassCode: row.sub_asset_class_code != null ? String(row.sub_asset_class_code) : "",
      managerCode: String(row.manager_code),
      benchmarkCode: row.benchmark_code != null ? String(row.benchmark_code) : "",
      npcClassificationId: Number(row.npc_classification_id),
      longName: String(row.long_name),
      shortName: String(row.short_name),
      activeInd: row.active_ind == null ? true : row.active_ind === true || String(row.active_ind) === "true",
      effectiveFrom: mapDate(row.effective_from),
      effectiveUntil: row.effective_until != null ? mapDate(row.effective_until) : null,
      applyStatus: row.apply_status != null ? String(row.apply_status) : null,
      applyError: row.apply_error != null ? String(row.apply_error) : null,
    }));
  }, []);
}

/**
 * Update an existing change_portfolio_configuration row.
 *
 * Only used by the change-management flow: a stakeholder amends a staged
 * change before it is processed. Direct caller code is responsible for
 * verifying that the change request is still in 'submitted' or 'accepted'
 * state.
 */
export async function updateChangePortfolioConfiguration(
  id: number,
  patch: Partial<{
    actionType: ChangeActionType;
    /** Original primary_account_id of the live row this change targets (UPDATE/DELETE). */
    targetPrimaryAccountId: string | null;
    clientCode: string;
    portfolioCode: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    longName: string;
    shortName: string;
    activeInd: boolean;
    effectiveFrom: string;
    effectiveUntil: string | null;
  }>,
): Promise<void> {
  if (!sql) throw new Error("Database not available");
  await sql!`
    UPDATE client_config.change_portfolio_configuration SET
      action_type         = COALESCE(${patch.actionType ?? null}, action_type),
      target_primary_account_id = COALESCE(${patch.targetPrimaryAccountId ?? null}, target_primary_account_id),
      client_code         = COALESCE(${patch.clientCode ?? null}, client_code),
      portfolio_code      = COALESCE(${patch.portfolioCode ?? null}, portfolio_code),
      asset_class_code    = COALESCE(${patch.assetClassCode ?? null}, asset_class_code),
      sub_asset_class_code= COALESCE(${patch.subAssetClassCode ?? null}, sub_asset_class_code),
      manager_code        = COALESCE(${patch.managerCode ?? null}, manager_code),
      benchmark_code      = COALESCE(${patch.benchmarkCode ?? null}, benchmark_code),
      npc_classification_id = COALESCE(${patch.npcClassificationId ?? null}, npc_classification_id),
      long_name           = COALESCE(${patch.longName ?? null}, long_name),
      short_name          = COALESCE(${patch.shortName ?? null}, short_name),
      active_ind          = COALESCE(${patch.activeInd ?? null}, active_ind),
      effective_from      = COALESCE(${patch.effectiveFrom ?? null}, effective_from),
      effective_until     = COALESCE(${patch.effectiveUntil ?? null}, effective_until)
    WHERE id = ${id}
  `;
}

/**
 * Delete a staged change_portfolio_configuration row.
 * Returns true if a row was actually deleted.
 */
export async function deleteChangePortfolioConfiguration(id: number): Promise<boolean> {
  if (!sql) throw new Error("Database not available");
  const rows = await sql!`
    DELETE FROM client_config.change_portfolio_configuration
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Validation helpers for direct callers (server actions / admin UI)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate and stage a CREATE/UPDATE/DELETE/RETIRE change on a portfolio_configuration
 * row. Returns the staged row id on success, or an array of issues on failure.
 *
 * For UPDATE, DELETE, and RETIRE actions, the caller MUST provide a targetPrimaryAccountId
 * (the primary_account_id of the live row this change targets). The function
 * verifies that target row exists in the current portfolio_configuration table
 * — independently of the derived primaryAccountId that will be used for the
 * successor row (which may differ when dimension codes change).
 *
 * RETIRE actions are validated but reject with an explicit message since
 * retirement is handled through the metadata request flow, not portfolio
 * configuration.
 */
export async function stageChangePortfolioConfiguration(input: {
  changeRequestId: string;
  actionType: ChangeActionType;
  primaryAccountId?: string | null;
  /** Original primary_account_id of the live row this change targets (UPDATE/DELETE). */
  targetPrimaryAccountId?: string | null;
  clientCode: string;
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
  activeInd?: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; issues: string[] }> {
  // RETIRE is not a portfolio_configuration staging action: retirement is
  // handled through the metadata request flow (stagePortfolioMetadataRequestChange).
  // Reject it explicitly and deterministically instead of falling through to
  // generic validation, which would reject it only incidentally.
  if (input.actionType === "RETIRE") {
    return {
      ok: false,
      issues: [
        'actionType "RETIRE" is niet toegestaan voor portfolio-configuratie: uitfaseren verloopt via het metadata-verzoek-proces.',
      ],
    };
  }

  // Derive primaryAccountId from the four dimensions if not provided.
  const primaryAccountId =
    input.primaryAccountId && input.primaryAccountId.trim().length > 0
      ? input.primaryAccountId.trim().toUpperCase()
      : buildPrimaryAccountId(
          input.clientCode,
          input.assetClassCode,
          input.subAssetClassCode,
          input.managerCode,
        );

  if (!primaryAccountId) {
    return { ok: false, issues: validateRequiredFields(input) };
  }

  // The target row is identified by target_primary_account_id — the ORIGINAL
  // primary_account_id of the live row this change modifies. For UPDATE/DELETE
  // it is required and its existence is verified independently of the derived
  // primaryAccountId (the successor row's id, which may differ).
  const targetPrimaryAccountId =
    input.targetPrimaryAccountId && input.targetPrimaryAccountId.trim().length > 0
      ? input.targetPrimaryAccountId.trim().toUpperCase()
      : null;

  if ((input.actionType === "UPDATE" || input.actionType === "DELETE") && !targetPrimaryAccountId) {
    return { ok: false, issues: ["targetPrimaryAccountId is verplicht voor UPDATE/DELETE."] };
  }

  // For UPDATE/DELETE we look up the TARGET row (not the derived successor id)
  // to enforce consistency. (RETIRE is rejected above; it never reaches here.)
  let existing: { primaryAccountId: string } | null = null;
  if (input.actionType === "UPDATE" || input.actionType === "DELETE") {
    existing = targetPrimaryAccountId
      ? await getClientConfigPortfolioConfigurationById(targetPrimaryAccountId)
      : null;
  }

  const preIssues = validateActionSpecificRules(input.actionType, input, existing);
  if (preIssues.length > 0) {
    return { ok: false, issues: preIssues };
  }

  const validation = validateChangePortfolioConfiguration({
    changeRequestId: input.changeRequestId,
    actionType: input.actionType,
    targetPrimaryAccountId: targetPrimaryAccountId ?? null,
    clientCode: input.clientCode,
    portfolioCode: input.portfolioCode,
    assetClassCode: input.assetClassCode,
    subAssetClassCode: input.subAssetClassCode,
    managerCode: input.managerCode,
    benchmarkCode: input.benchmarkCode,
    npcClassificationId: input.npcClassificationId,
    longName: input.longName,
    shortName: input.shortName,
    activeInd: input.activeInd ?? true,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil,
  });

  if (!validation.valid) {
    return { ok: false, issues: validation.errors };
  }

  const id = await saveChangePortfolioConfiguration({
    changeRequestId: input.changeRequestId,
    actionType: input.actionType,
    targetPrimaryAccountId: targetPrimaryAccountId ?? null,
    clientCode: input.clientCode,
    portfolioCode: input.portfolioCode,
    assetClassCode: input.assetClassCode,
    subAssetClassCode: input.subAssetClassCode,
    managerCode: input.managerCode,
    benchmarkCode: input.benchmarkCode,
    npcClassificationId: input.npcClassificationId,
    longName: input.longName,
    shortName: input.shortName,
    effectiveFrom: input.effectiveFrom,
    effectiveUntil: input.effectiveUntil,
  });

  return { ok: true, id };
}

// ─────────────────────────────────────────────────────────────────────────
// Lookup-addition staging (user-requestable dimensions)
//
// The governed change flow for the user-requestable lookup dimensions
// (asset_class, sub_asset_class, benchmark) stages the *new value* in
// client_config.change_lookup_request. The value does NOT need to exist in
// the live lookup table yet — it is introduced by the change process itself
// (stage → approve → apply). Apply is the only code path that inserts into
// the live lookup tables, mirroring applyChangePortfolioConfigurations().
// ─────────────────────────────────────────────────────────────────────────

export type LookupDimension = "asset_class" | "sub_asset_class" | "benchmark";

export interface ChangeLookupRequestRow {
  id: number;
  changeRequestId: string;
  dimension: LookupDimension;
  assetClassCode: string | null;
  assetClassName: string | null;
  parentAssetClassCode: string | null;
  subAssetClassCode: string | null;
  subAssetClassName: string | null;
  benchmarkCode: string | null;
  benchmarkName: string | null;
  currency: string | null;
  sortOrder: number | null;
  applyStatus: "pending" | "applied" | "failed";
  applyError: string | null;
  createdAt: string;
}

function mapChangeLookupRequestRow(row: Record<string, unknown>): ChangeLookupRequestRow {
  return {
    id: Number(row.id),
    changeRequestId: String(row.change_request_id),
    dimension: String(row.dimension) as LookupDimension,
    assetClassCode: row.asset_class_code != null ? String(row.asset_class_code) : null,
    assetClassName: row.asset_class_name != null ? String(row.asset_class_name) : null,
    parentAssetClassCode: row.parent_asset_class_code != null ? String(row.parent_asset_class_code) : null,
    subAssetClassCode: row.sub_asset_class_code != null ? String(row.sub_asset_class_code) : null,
    subAssetClassName: row.sub_asset_class_name != null ? String(row.sub_asset_class_name) : null,
    benchmarkCode: row.benchmark_code != null ? String(row.benchmark_code) : null,
    benchmarkName: row.benchmark_name != null ? String(row.benchmark_name) : null,
    currency: row.currency != null ? String(row.currency) : null,
    sortOrder: row.sort_order == null ? null : Number(row.sort_order),
    applyStatus: String(row.apply_status ?? "pending") as ChangeLookupRequestRow["applyStatus"],
    applyError: row.apply_error != null ? String(row.apply_error) : null,
    createdAt: mapDate(row.created_at),
  };
}

/**
 * Stage a lookup addition for a change request. Validates that exactly the
 * fields belonging to the dimension are present, and that the value is not
 * already staged by another open change request for the same dimension.
 */
export async function stageChangeLookupRequest(input: {
  changeRequestId: string;
  dimension: LookupDimension;
  assetClassCode?: string | null;
  assetClassName?: string | null;
  parentAssetClassCode?: string | null;
  subAssetClassCode?: string | null;
  subAssetClassName?: string | null;
  benchmarkCode?: string | null;
  benchmarkName?: string | null;
  currency?: string | null;
  sortOrder?: number | null;
}): Promise<{ ok: true; id: string } | { ok: false; issues: string[] }> {
  if (!sql) return { ok: false, issues: ["Database niet bereikbaar."] };

  const issues: string[] = [];
  const dim = input.dimension;

  if (dim === "asset_class") {
    const code = (input.assetClassCode ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      issues.push("Asset class code moet uit precies 2 hoofdletters bestaan (bijv. PR).");
    }
    if (!input.assetClassName || input.assetClassName.trim().length < 2) {
      issues.push("Asset class naam is verplicht (minimaal 2 tekens).");
    }
  } else if (dim === "sub_asset_class") {
    const code = (input.subAssetClassCode ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      issues.push("Sub asset class code moet uit precies 3 hoofdletters bestaan (bijv. PRI).");
    }
    if (!input.subAssetClassName || input.subAssetClassName.trim().length < 2) {
      issues.push("Sub asset class naam is verplicht (minimaal 2 tekens).");
    }
    if (!input.parentAssetClassCode || input.parentAssetClassCode.trim().length === 0) {
      issues.push("Bestaande asset class is verplicht voor een nieuwe sub asset class.");
    } else {
      const [parent] = await sql!`
        SELECT asset_class_code FROM client_config.asset_class
        WHERE asset_class_code = ${input.parentAssetClassCode.trim().toUpperCase()}
        LIMIT 1
      `;
      if (!parent) {
        issues.push(`Asset class "${input.parentAssetClassCode}" bestaat niet in de referentiedata.`);
      }
    }
  } else if (dim === "benchmark") {
    if (!input.benchmarkCode || input.benchmarkCode.trim().length < 2) {
      issues.push("Benchmark code is verplicht.");
    }
    if (!input.benchmarkName || input.benchmarkName.trim().length < 3) {
      issues.push("Benchmark naam is verplicht (minimaal 3 tekens).");
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  // Duplicate check: same dimension + same primary code already staged in an
  // open (non-terminal) change request.
  const codeColumn =
    dim === "asset_class"
      ? sql`asset_class_code`
      : dim === "sub_asset_class"
        ? sql`sub_asset_class_code`
        : sql`benchmark_code`;
  const stagedValue =
    dim === "asset_class"
      ? (input.assetClassCode ?? "").trim().toUpperCase()
      : dim === "sub_asset_class"
        ? (input.subAssetClassCode ?? "").trim().toUpperCase()
        : (input.benchmarkCode ?? "").trim().toUpperCase();

  const dup = await sql!`
    SELECT clr.id
    FROM client_config.change_lookup_request clr
    JOIN change_requests cr ON cr.id = clr.change_request_id
    WHERE clr.dimension = ${dim}
      AND ${codeColumn} = ${stagedValue}
      AND cr.status NOT IN ('processed', 'validated', 'rejected', 'failed')
      AND clr.apply_status = 'pending'
    LIMIT 1
  `;
  if (dup.length > 0) {
    issues.push(
      dim === "asset_class"
        ? `Asset class "${stagedValue}" is al eerder aangevraagd in een open change.`
        : dim === "sub_asset_class"
          ? `Sub asset class "${stagedValue}" is al eerder aangevraagd in een open change.`
          : `Benchmark "${stagedValue}" is al eerder aangevraagd in een open change.`,
    );
    return { ok: false, issues };
  }

  const rows = await sql!`
    INSERT INTO client_config.change_lookup_request (
      change_request_id,
      dimension,
      asset_class_code,
      asset_class_name,
      parent_asset_class_code,
      sub_asset_class_code,
      sub_asset_class_name,
      benchmark_code,
      benchmark_name,
      currency,
      sort_order,
      apply_status
    ) VALUES (
      ${input.changeRequestId},
      ${dim},
      ${dim === "asset_class" ? (input.assetClassCode ?? "").trim().toUpperCase() : null},
      ${dim === "asset_class" ? (input.assetClassName ?? "").trim() : null},
      ${dim === "sub_asset_class" ? (input.parentAssetClassCode ?? "").trim().toUpperCase() : null},
      ${dim === "sub_asset_class" ? (input.subAssetClassCode ?? "").trim().toUpperCase() : null},
      ${dim === "sub_asset_class" ? (input.subAssetClassName ?? "").trim() : null},
      ${dim === "benchmark" ? (input.benchmarkCode ?? "").trim().toUpperCase() : null},
      ${dim === "benchmark" ? (input.benchmarkName ?? "").trim() : null},
      ${dim === "benchmark" ? (input.currency ?? "EUR").trim().toUpperCase() : null},
      ${input.sortOrder ?? null},
      'pending'
    )
    RETURNING id
  `;
  return { ok: true, id: String(rows[0].id) };
}

/**
 * Read all staged lookup-request rows for a change request.
 */
export async function getChangeLookupRequests(
  changeRequestId: string,
): Promise<ChangeLookupRequestRow[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        id,
        change_request_id,
        dimension,
        asset_class_code,
        asset_class_name,
        parent_asset_class_code,
        sub_asset_class_code,
        sub_asset_class_name,
        benchmark_code,
        benchmark_name,
        currency,
        sort_order,
        apply_status,
        apply_error,
        created_at
      FROM client_config.change_lookup_request
      WHERE change_request_id = ${changeRequestId}
      ORDER BY id ASC
    `;
    return rows.map(mapChangeLookupRequestRow);
  }, []);
}

/**
 * Apply every staged lookup-request row for a change request to the live
 * client_config lookup tables.
 *
 *  - asset_class      → INSERT INTO client_config.asset_class (code, name)
 *  - sub_asset_class  → INSERT INTO client_config.sub_asset_class under the
 *                       parent asset class (resolved by parent_asset_class_code)
 *  - benchmark        → INSERT INTO client_config.benchmark (code, name)
 *
 * Each row's apply_status is updated to 'applied' or 'failed'. Existing
 * values are skipped (they are already present in the live reference data).
 *
 * The function sets the same session-level GUC
 * (app.change_process_bypass = 'true') used by
 * applyChangePortfolioConfigurations() so that any future enforcement
 * triggers on the lookup tables treat this as the governed path.
 */
export async function applyChangeLookupRequests(
  changeRequestId: string,
): Promise<ApplyChangeResult> {
  if (!sql) return { success: false, applied: [], error: "Database not available" };

  const staged = await getChangeLookupRequests(changeRequestId);
  if (staged.length === 0) {
    return { success: true, applied: [] };
  }

  const applied: ApplyChangeResult["applied"] = [];

  await (sql as any).begin(async (tx: any) => {
    await tx`SET LOCAL app.change_process_bypass = 'true'`;

    for (const row of staged) {
      const identity = `${row.dimension}:${
        row.assetClassCode ?? row.subAssetClassCode ?? row.benchmarkCode ?? "?"
      }`;
      try {
        if (row.dimension === "asset_class") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.asset_class
            WHERE asset_class_code = ${row.assetClassCode}
            LIMIT 1
          `;
          if (existing) {
            applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "skipped", error: "Asset class bestaat al in de referentiedata." });
            await tx`UPDATE client_config.change_lookup_request SET apply_status = 'failed', apply_error = 'Asset class bestaat al.' WHERE id = ${row.id}`;
            continue;
          }
          await tx`
            INSERT INTO client_config.asset_class (asset_class_code, asset_class_name)
            VALUES (${row.assetClassCode}, ${row.assetClassName})
          `;
          applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "applied" });
          await tx`UPDATE client_config.change_lookup_request SET apply_status = 'applied', apply_error = NULL WHERE id = ${row.id}`;
          continue;
        }

        if (row.dimension === "sub_asset_class") {
          const [parent] = await tx`
            SELECT asset_class_id FROM client_config.asset_class
            WHERE asset_class_code = ${row.parentAssetClassCode}
            LIMIT 1
          `;
          if (!parent) {
            applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "failed", error: `Bovenliggende asset class "${row.parentAssetClassCode}" bestaat niet.` });
            await tx`UPDATE client_config.change_lookup_request SET apply_status = 'failed', apply_error = 'Bovenliggende asset class bestaat niet.' WHERE id = ${row.id}`;
            continue;
          }
          const [existing] = await tx`
            SELECT 1 FROM client_config.sub_asset_class
            WHERE asset_class_id = ${parent.asset_class_id}
              AND sub_asset_class_code = ${row.subAssetClassCode}
            LIMIT 1
          `;
          if (existing) {
            applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "skipped", error: "Sub asset class bestaat al onder deze asset class." });
            await tx`UPDATE client_config.change_lookup_request SET apply_status = 'failed', apply_error = 'Sub asset class bestaat al.' WHERE id = ${row.id}`;
            continue;
          }
          await tx`
            INSERT INTO client_config.sub_asset_class (
              asset_class_id,
              sub_asset_class_code,
              sub_asset_class_name,
              sort_order
            ) VALUES (
              ${parent.asset_class_id},
              ${row.subAssetClassCode},
              ${row.subAssetClassName},
              ${row.sortOrder}
            )
          `;
          applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "applied" });
          await tx`UPDATE client_config.change_lookup_request SET apply_status = 'applied', apply_error = NULL WHERE id = ${row.id}`;
          continue;
        }

        if (row.dimension === "benchmark") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.benchmark
            WHERE benchmark_code = ${row.benchmarkCode}
            LIMIT 1
          `;
          if (existing) {
            applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "skipped", error: "Benchmark bestaat al in de referentiedata." });
            await tx`UPDATE client_config.change_lookup_request SET apply_status = 'failed', apply_error = 'Benchmark bestaat al.' WHERE id = ${row.id}`;
            continue;
          }
          await tx`
            INSERT INTO client_config.benchmark (benchmark_code, benchmark_name)
            VALUES (${row.benchmarkCode}, ${row.benchmarkName})
          `;
          applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "applied" });
          await tx`UPDATE client_config.change_lookup_request SET apply_status = 'applied', apply_error = NULL WHERE id = ${row.id}`;
          continue;
        }

        applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "failed", error: `Onbekende dimensie: ${row.dimension}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Onbekende fout";
        applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "failed", error: message });
        await tx`UPDATE client_config.change_lookup_request SET apply_status = 'failed', apply_error = ${message} WHERE id = ${row.id}`;
      }
    }
  });

  return { success: applied.every((a) => a.result !== "failed"), applied };
}

/**
 * Apply a staged new_benchmark_requests row to the live client_config.benchmark
 * table. Mirrors applyChangeLookupRequests for the legacy new-benchmark flow
 * (new_benchmark_requests rows created before the standalone request route was
 * removed; changes are now created via the Workflow Studio change catalog).
 */
export async function applyNewBenchmarkRequest(changeRequestId: string): Promise<ApplyChangeResult> {
  if (!sql) return { success: false, applied: [], error: "Database not available" };

  const rows = await withClientConfigQuery<Array<Record<string, unknown>>>(async () => {
    return await sql!`
      SELECT short_name, long_name, currency
      FROM new_benchmark_requests
      WHERE change_request_id = ${changeRequestId}
      LIMIT 1
    `;
  }, []);

  if (rows.length === 0) {
    return { success: true, applied: [] };
  }

  const shortName = String(rows[0].short_name ?? "").trim().toUpperCase();
  const longName = String(rows[0].long_name ?? "").trim();
  const identity = `benchmark:${shortName}`;
  const applied: ApplyChangeResult["applied"] = [];

  if (!shortName) {
    return { success: false, applied: [{ actionType: "CREATE", primaryAccountId: identity, result: "failed", error: "Benchmark code ontbreekt in de staged aanvraag." }] };
  }

  await (sql as any).begin(async (tx: any) => {
    await tx`SET LOCAL app.change_process_bypass = 'true'`;
    const [existing] = await tx`
      SELECT 1 FROM client_config.benchmark
      WHERE benchmark_code = ${shortName}
      LIMIT 1
    `;
    if (existing) {
      applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "skipped", error: "Benchmark bestaat al in de referentiedata." });
      return;
    }
    await tx`
      INSERT INTO client_config.benchmark (benchmark_code, benchmark_name)
      VALUES (${shortName}, ${longName})
    `;
    applied.push({ actionType: "CREATE", primaryAccountId: identity, result: "applied" });
  });

  return { success: applied.every((a) => a.result !== "failed"), applied };
}

// ─────────────────────────────────────────────────────────────────────────
// Apply staged changes to the live portfolio_configuration table
// ─────────────────────────────────────────────────────────────────────────

export interface ApplyChangeResult {
  success: boolean;
  applied: Array<{
    actionType: ChangeActionType | "RETIRE";
    primaryAccountId: string;
    result: "applied" | "skipped" | "failed";
    error?: string;
  }>;
  error?: string;
}

/**
 * Apply every staged change_portfolio_configuration row for a change request
 * to the live portfolio_configuration table.
 *
 *  - CREATE: INSERT a new portfolio_configuration row.
 *    If a row with the same primary_account_id already exists, mark
 *    active_ind = false on the existing row (close it out) and INSERT a new
 *    active row. CREATE rows have no target row.
 *  - UPDATE: Mark the row identified by target_primary_account_id (the
 *    ORIGINAL primary_account_id of the live row this change modifies)
 *    active_ind = false and effective_until = effective_from (close it out),
 *    then INSERT a new successor row carrying the updated dimension values
 *    and the NEWLY derived primary_account_id. This is a "slowly changing
 *    dimension type 2" pattern that preserves history and supports
 *    identity-changing updates (dimension codes that derive primary_account_id
 *    may change, so the successor's id can differ from the target's).
 *  - DELETE: Mark the row identified by target_primary_account_id
 *    active_ind = false and set effective_until to the requested
 *    retirement date (staged effective_until, else the staged
 *    effective_from — the date the retire change takes effect — else
 *    today for legacy rows). No successor row is inserted.
 *
 * This is the integration point between the BCM change-management workflow
 * and the live configuration. Direct mutations of client_config tables are
 * NOT supported; the only path is via a staged change that reaches the
 * 'processed' state.
 *
 * The function sets a session-level PostgreSQL GUC
 * (app.change_process_bypass = 'true') before mutating the live
 * portfolio_configuration table. This bypasses the DB trigger
 * trg_enforce_change_process_{insert,update,delete}, which would
 * otherwise block any direct DML on client_config.portfolio_configuration.
 * See db/enforce_change_process.sql.
 */
export async function applyChangePortfolioConfigurations(
  changeRequestId: string,
): Promise<ApplyChangeResult> {
  if (!sql) return { success: false, applied: [], error: "Database not available" };

  const staged = await getChangePortfolioConfigurations(changeRequestId);
  if (staged.length === 0) {
    return { success: true, applied: [] };
  }

  const today = new Date().toISOString().split("T")[0];
  const applied: ApplyChangeResult["applied"] = [];

  await (sql as any).begin(async (tx: any) => {
    // Set the session-level GUC so the enforcement trigger allows mutations.
    // This is scoped to the current transaction and is the ONLY code path
    // that should ever mutate client_config.portfolio_configuration.
    await tx`SET LOCAL app.change_process_bypass = 'true'`;
    for (const row of staged) {
      // Derived id for CREATE (new row) and UPDATE (successor row). The row an
      // UPDATE/DELETE acts on is identified by target_primary_account_id — the
      // ORIGINAL primary_account_id of the live row — which may differ from the
      // derived id when dimension codes change.
      const primaryAccountId =
        buildPrimaryAccountId(
          row.clientCode,
          row.assetClassCode,
          row.subAssetClassCode,
          row.managerCode,
        ) ?? "";
      const targetPrimaryAccountId = row.targetPrimaryAccountId ?? primaryAccountId;

      // CREATE and UPDATE need a derivable id for the row they insert; DELETE
      // only retires the target row and never derives a successor.
      if (!primaryAccountId && row.actionType !== "DELETE") {
        await tx`
          UPDATE client_config.change_portfolio_configuration
          SET apply_status = 'failed',
              apply_error = 'Kan primaryAccountId niet afleiden uit de dimensies.'
          WHERE id = ${row.id}
        `;
        applied.push({
          actionType: row.actionType,
          primaryAccountId: "<unknown>",
          result: "failed",
          error: "Kan primaryAccountId niet afleiden uit de dimensies.",
        });
        continue;
      }

      try {
        if (row.actionType === "CREATE") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.portfolio_configuration
            WHERE primary_account_id = ${primaryAccountId} AND active_ind = true
            LIMIT 1
          `;
          if (existing) {
            await tx`
              UPDATE client_config.change_portfolio_configuration
              SET apply_status = 'skipped',
                  apply_error = 'Er bestaat al een actieve configuratie voor deze primary_account_id.'
              WHERE id = ${row.id}
            `;
            applied.push({
              actionType: row.actionType,
              primaryAccountId,
              result: "skipped",
              error: "Er bestaat al een actieve configuratie voor deze primary_account_id.",
            });
            continue;
          }
          await tx`
            INSERT INTO client_config.portfolio_configuration (
              primary_account_id,
              client_code,
              portfolio_code,
              asset_class_code,
              sub_asset_class_code,
              manager_code,
              benchmark_code,
              npc_classification_id,
              long_name,
              short_name,
              active_ind,
              effective_from,
              effective_until,
              change_request_id
            ) VALUES (
              ${primaryAccountId},
              ${row.clientCode},
              ${row.portfolioCode},
              ${row.assetClassCode},
              ${row.subAssetClassCode},
              ${row.managerCode},
              ${row.benchmarkCode},
              ${row.npcClassificationId},
              ${row.longName},
              ${row.shortName},
              ${row.activeInd},
              ${row.effectiveFrom},
              ${row.effectiveUntil},
              ${changeRequestId}
            )
          `;
          await tx`
            UPDATE client_config.change_portfolio_configuration
            SET apply_status = 'applied'
            WHERE id = ${row.id}
          `;
          applied.push({ actionType: row.actionType, primaryAccountId, result: "applied" });
          continue;
        }

        if (row.actionType === "UPDATE") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.portfolio_configuration
            WHERE primary_account_id = ${targetPrimaryAccountId} AND active_ind = true
            LIMIT 1
          `;
          if (!existing) {
            await tx`
              UPDATE client_config.change_portfolio_configuration
              SET apply_status = 'failed',
                  apply_error = 'Geen actieve configuratie gevonden om bij te werken.'
              WHERE id = ${row.id}
            `;
            applied.push({
              actionType: row.actionType,
              primaryAccountId: targetPrimaryAccountId,
              result: "failed",
              error: "Geen actieve configuratie gevonden om bij te werken.",
            });
            continue;
          }
          if (primaryAccountId === targetPrimaryAccountId) {
            await tx`
              UPDATE client_config.portfolio_configuration
              SET
                client_code = ${row.clientCode},
                portfolio_code = ${row.portfolioCode},
                asset_class_code = ${row.assetClassCode},
                sub_asset_class_code = ${row.subAssetClassCode},
                manager_code = ${row.managerCode},
                benchmark_code = ${row.benchmarkCode},
                npc_classification_id = ${row.npcClassificationId},
                long_name = ${row.longName},
                short_name = ${row.shortName},
                active_ind = ${row.activeInd},
                effective_from = ${row.effectiveFrom},
                effective_until = ${row.effectiveUntil},
                change_request_id = ${changeRequestId},
                updated_at = now()
              WHERE primary_account_id = ${targetPrimaryAccountId} AND active_ind = true
            `;
            await tx`
              UPDATE client_config.change_portfolio_configuration
              SET apply_status = 'applied'
              WHERE id = ${row.id}
            `;
            applied.push({ actionType: row.actionType, primaryAccountId, result: "applied" });
            continue;
          }

          // Close out the TARGET row (identified by target_primary_account_id).
          await tx`
            UPDATE client_config.portfolio_configuration
            SET active_ind = false,
                effective_until = ${row.effectiveFrom}
            WHERE primary_account_id = ${targetPrimaryAccountId} AND active_ind = true
          `;
          // Insert the successor row with the NEW derived primaryAccountId.
          await tx`
            INSERT INTO client_config.portfolio_configuration (
              primary_account_id,
              client_code,
              portfolio_code,
              asset_class_code,
              sub_asset_class_code,
              manager_code,
              benchmark_code,
              npc_classification_id,
              long_name,
              short_name,
              active_ind,
              effective_from,
              effective_until,
              change_request_id
            ) VALUES (
              ${primaryAccountId},
              ${row.clientCode},
              ${row.portfolioCode},
              ${row.assetClassCode},
              ${row.subAssetClassCode},
              ${row.managerCode},
              ${row.benchmarkCode},
              ${row.npcClassificationId},
              ${row.longName},
              ${row.shortName},
              ${row.activeInd},
              ${row.effectiveFrom},
              ${row.effectiveUntil},
              ${changeRequestId}
            )
          `;
          await tx`
            UPDATE client_config.change_portfolio_configuration
            SET apply_status = 'applied'
            WHERE id = ${row.id}
          `;
          applied.push({ actionType: row.actionType, primaryAccountId, result: "applied" });
          continue;
        }

        if (row.actionType === "DELETE") {
          const [existing] = await tx`
            SELECT 1 FROM client_config.portfolio_configuration
            WHERE primary_account_id = ${targetPrimaryAccountId} AND active_ind = true
            LIMIT 1
          `;
          if (!existing) {
            await tx`
              UPDATE client_config.change_portfolio_configuration
              SET apply_status = 'skipped',
                  apply_error = 'Geen actieve configuratie gevonden om te verwijderen.'
              WHERE id = ${row.id}
            `;
            applied.push({
              actionType: row.actionType,
              primaryAccountId: targetPrimaryAccountId,
              result: "skipped",
              error: "Geen actieve configuratie gevonden om te verwijderen.",
            });
            continue;
          }
          // Retire the TARGET row (identified by target_primary_account_id);
          // no successor row is inserted. The row is closed out at the
          // REQUESTED retirement date: an explicitly staged effective_until
          // wins, otherwise the staged effective_from (the retire flow stages
          // the requested retirement date there), with today as the last
          // resort for legacy staged rows.
          await tx`
            UPDATE client_config.portfolio_configuration
            SET active_ind = false,
                effective_until = ${row.effectiveUntil ?? row.effectiveFrom ?? today}
            WHERE primary_account_id = ${targetPrimaryAccountId} AND active_ind = true
          `;
          await tx`
            UPDATE client_config.change_portfolio_configuration
            SET apply_status = 'applied'
            WHERE id = ${row.id}
          `;
          applied.push({
            actionType: row.actionType,
            primaryAccountId: targetPrimaryAccountId,
            result: "applied",
          });
          continue;
        }

        await tx`
          UPDATE client_config.change_portfolio_configuration
          SET apply_status = 'failed',
              apply_error = 'Onbekende action_type: ' || ${row.actionType}
          WHERE id = ${row.id}
        `;
        applied.push({
          actionType: row.actionType,
          primaryAccountId,
          result: "failed",
          error: `Onbekende action_type: ${row.actionType}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Onbekende fout";
        try {
          await tx`
            UPDATE client_config.change_portfolio_configuration
            SET apply_status = 'failed',
                apply_error = ${message}
            WHERE id = ${row.id}
          `;
        } catch {
          // Best-effort: the row may not exist or DB may be in a bad state
        }
        applied.push({
          actionType: row.actionType,
          primaryAccountId: targetPrimaryAccountId,
          result: "failed",
          error: message,
        });
      }
    }
  });

  return { success: applied.every((a) => a.result !== "failed"), applied };
}

// ─────────────────────────────────────────────────────────────────────────
// Portfolio / Parent-Account Metadata: Stage, Get, Apply
// ─────────────────────────────────────────────────────────────────────────

function mapChangePortfolioMetadataRequestRow(row: Record<string, unknown>): ChangePortfolioMetadataRequest {
  return {
    id: Number(row.id),
    changeRequestId: String(row.change_request_id),
    dimension: String(row.dimension) as 'portfolio' | 'parent_account',
    actionType: String(row.action_type) as 'CREATE' | 'RETIRE',
    code: String(row.code),
    parentAccountCode: row.parent_account_code != null ? String(row.parent_account_code) : null,
    msaParentAccountCode: row.msa_parent_account_code != null ? String(row.msa_parent_account_code) : null,
    applyStatus: String(row.apply_status) as 'pending' | 'applied' | 'failed',
    applyError: row.apply_error != null ? String(row.apply_error) : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/**
 * DB-backed implementation of `PortfolioMetadataLookup` for the governed
 * portfolio / parent-account metadata flow. Every predicate maps 1:1 to a
 * query in the lifecycle spec (§6.2) — uniqueness across active AND retired
 * rows, parent-account activeness, retire pre-conditions and duplicate
 * staging in open change requests.
 *
 * The lookup is passed to `validatePortfolioMetadataChange` (shared module),
 * which keeps the rules identical for backend helpers and frontend forms.
 */
function createPortfolioMetadataLookup(): PortfolioMetadataLookup {
  return {
    async codeExists(dimension: PortfolioMetadataDimension, code: string): Promise<boolean> {
      if (dimension === "portfolio") {
        const [existingPortfolio] = await sql!`
          SELECT 1 FROM client_config.portfolio
          WHERE portfolio_code = ${code}
          LIMIT 1
        `;
        return Boolean(existingPortfolio);
      }
      const [existingParentAccount] = await sql!`
        SELECT 1 FROM client_config.parent_account
        WHERE parent_account_code = ${code}
        LIMIT 1
      `;
      return Boolean(existingParentAccount);
    },

    async parentAccountActive(code: string): Promise<boolean> {
      const [pa] = await sql!`
        SELECT 1 FROM client_config.parent_account
        WHERE parent_account_code = ${code} AND active_ind = true
        LIMIT 1
      `;
      return Boolean(pa);
    },

    async portfolioHasActiveConfigurations(code: string): Promise<boolean> {
      const [activeConfigs] = await sql!`
        SELECT 1 FROM client_config.portfolio_configuration
        WHERE portfolio_code = ${code} AND active_ind = true
        LIMIT 1
      `;
      return Boolean(activeConfigs);
    },

    async portfolioHasAccounts(code: string): Promise<boolean> {
      const [activeAccounts] = await sql!`
        SELECT 1 FROM client_config.account a
        JOIN client_config.portfolio p ON p.portfolio_id = a.portfolio_id
        WHERE p.portfolio_code = ${code}
        LIMIT 1
      `;
      return Boolean(activeAccounts);
    },

    async parentAccountHasActivePortfolios(code: string): Promise<boolean> {
      const [activePortfolios] = await sql!`
        SELECT 1 FROM client_config.portfolio
        WHERE parent_account_id = (
          SELECT parent_account_id FROM client_config.parent_account WHERE parent_account_code = ${code}
        ) AND active_ind = true
        LIMIT 1
      `;
      return Boolean(activePortfolios);
    },

    async alreadyStagedInOpenChange(
      dimension: PortfolioMetadataDimension,
      code: string,
      changeRequestId: string,
    ): Promise<boolean> {
      const [alreadyStaged] = await sql!`
        SELECT 1 FROM client_config.change_portfolio_metadata_request cpmr
        JOIN change_requests cr ON cr.id = cpmr.change_request_id
        WHERE cpmr.dimension = ${dimension}
          AND cpmr.code = ${code}
          AND cr.status NOT IN ('processed', 'validated')
          AND cpmr.change_request_id != ${changeRequestId}
        LIMIT 1
      `;
      return Boolean(alreadyStaged);
    },
  };
}

/**
 * Stage a create/retire change for portfolio or parent_account metadata.
 *
 * Validation rules (delegated to the shared `validatePortfolioMetadataChange`):
 * 1. Format check on code (matching DB regex patterns)
 * 2. Uniqueness check for CREATE (code not already used in an active OR retired row)
 * 3. For portfolio CREATE with parentAccountCode: verify the parent account exists and is active
 * 4. For RETIRE: verify no active child rows exist
 * 5. Duplicate check: same dimension + same code not already staged in another open change request
 */
export async function stagePortfolioMetadataChange(input: PortfolioMetadataChangeInput): Promise<{ ok: true; id: string } | { ok: false; issues: string[] }> {
  if (!sql) return { ok: false, issues: ["Database niet beschikbaar."] };

  try {
    const issues = await validatePortfolioMetadataChange(input, createPortfolioMetadataLookup());
    if (issues.length > 0) return { ok: false, issues };

    const code = input.code.trim().toUpperCase();
    let parentAccountCode: string | null = null;
    let msaParentAccountCode: string | null = null;

    if (input.dimension === 'portfolio') {
      parentAccountCode = input.parentAccountCode?.trim().toUpperCase() ?? null;
    } else {
      msaParentAccountCode = input.msaParentAccountCode?.trim().toUpperCase() ?? null;
    }

    const rows = await sql!`
      INSERT INTO client_config.change_portfolio_metadata_request (
        change_request_id,
        dimension,
        action_type,
        code,
        parent_account_code,
        msa_parent_account_code
      ) VALUES (
        ${input.changeRequestId},
        ${input.dimension},
        ${input.actionType},
        ${code},
        ${parentAccountCode},
        ${msaParentAccountCode}
      )
      RETURNING id
    `;

    return { ok: true, id: String(rows[0].id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    captureError(error, { endpoint: "client-config-db", phase: "stagePortfolioMetadataChange" });
    return { ok: false, issues: [message] };
  }
}

/**
 * Read all staged change_portfolio_metadata_request rows for a change request.
 */
export async function getChangePortfolioMetadataRequests(
  changeRequestId: string,
): Promise<ChangePortfolioMetadataRequest[]> {
  return withClientConfigQuery(async () => {
    const rows = await sql!`
      SELECT
        id,
        change_request_id,
        dimension,
        action_type,
        code,
        parent_account_code,
        msa_parent_account_code,
        apply_status,
        apply_error,
        created_at
      FROM client_config.change_portfolio_metadata_request
      WHERE change_request_id = ${changeRequestId}
      ORDER BY id ASC
    `;
    return rows.map(mapChangePortfolioMetadataRequestRow);
  }, []);
}

/**
 * Apply every staged change_portfolio_metadata_request row for a change request
 * to the live portfolio and parent_account tables.
 *
 * - CREATE portfolio: INSERT new portfolio row with parent_account_id resolved from code.
 * - CREATE parent_account: INSERT new parent_account row.
 * - RETIRE portfolio: SET active_ind = false.
 * - RETIRE parent_account: SET active_ind = false.
 */
export async function applyChangePortfolioMetadataRequests(
  changeRequestId: string,
): Promise<ApplyChangeResult> {
  if (!sql) return { success: false, applied: [], error: "Database not available" };

  const staged = await getChangePortfolioMetadataRequests(changeRequestId);
  if (staged.length === 0) {
    return { success: true, applied: [] };
  }

  const applied: ApplyChangeResult["applied"] = [];

  await (sql as any).begin(async (tx: any) => {
    await tx`SET LOCAL app.change_process_bypass = 'true'`;

    for (const row of staged) {
      try {
        if (row.dimension === 'portfolio') {
          if (row.actionType === 'CREATE') {
            // Resolve parent_account_code → parent_account_id (nullable)
            let resolvedParentAccountId: number | null = null;
            if (row.parentAccountCode) {
              const [pa] = await tx`
                SELECT parent_account_id FROM client_config.parent_account
                WHERE parent_account_code = ${row.parentAccountCode} AND active_ind = true
                LIMIT 1
              `;
              if (pa) {
                resolvedParentAccountId = Number(pa.parent_account_id);
              }
            }

            await tx`
              INSERT INTO client_config.portfolio (portfolio_code, parent_account_id, active_ind)
              VALUES (${row.code}, ${resolvedParentAccountId}, true)
            `;
          } else if (row.actionType === 'RETIRE') {
            await tx`
              UPDATE client_config.portfolio
              SET active_ind = false
              WHERE portfolio_code = ${row.code}
            `;
          }
        } else if (row.dimension === 'parent_account') {
          if (row.actionType === 'CREATE') {
            await tx`
              INSERT INTO client_config.parent_account (parent_account_code, msa_parent_account_code, active_ind)
              VALUES (${row.code}, ${row.msaParentAccountCode}, true)
            `;
          } else if (row.actionType === 'RETIRE') {
            await tx`
              UPDATE client_config.parent_account
              SET active_ind = false
              WHERE parent_account_code = ${row.code}
            `;
          }
        }

        await tx`
          UPDATE client_config.change_portfolio_metadata_request
          SET apply_status = 'applied'
          WHERE id = ${row.id}
        `;

        applied.push({
          actionType: row.actionType as ChangeActionType,
          primaryAccountId: row.code,
          result: "applied",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Onbekende fout";
        try {
          await tx`
            UPDATE client_config.change_portfolio_metadata_request
            SET apply_status = 'failed',
                apply_error = ${message}
            WHERE id = ${row.id}
          `;
        } catch {
          // Best-effort
        }
        applied.push({
          actionType: row.actionType as ChangeActionType,
          primaryAccountId: row.code,
          result: "failed",
          error: message,
        });
      }
    }
  });

  return { success: applied.every((a) => a.result !== "failed"), applied };
}

// ─────────────────────────────────────────────────────────────────────────
// Admin‑only bypass functions (emergency direct CRUD)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Out-of-band audit trail for admin bypass mutations (lifecycle spec §9.2).
 *
 * The governed change-request flow is audited through `audit_log` +
 * `status_history` + the staged `change_portfolio_metadata_request` rows
 * (apply lineage, spec §6.6). Admin direct CRUD has no change request, so
 * every mutation is recorded in `client_config.admin_audit_log` instead.
 *
 * The table is created lazily (CREATE TABLE IF NOT EXISTS) so the helper is
 * safe on databases that predate migration §18 — a missing table must never
 * block an emergency admin action, and the write itself is best-effort
 * (captureError on failure, never throws).
 */
let adminAuditTableEnsured = false;

async function ensureAdminAuditTable(): Promise<void> {
  if (adminAuditTableEnsured || !sql) return;
  try {
    await sql!`
      CREATE TABLE IF NOT EXISTS client_config.admin_audit_log (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        action text NOT NULL,
        dimension text NOT NULL,
        code text NOT NULL,
        actor text NOT NULL DEFAULT 'admin',
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    adminAuditTableEnsured = true;
  } catch {
    // Best-effort: an audit-table failure must not break the admin action.
    // The flag stays false so the next mutation retries the CREATE.
  }
}

async function recordAdminAudit(input: {
  action: string;
  dimension: "portfolio" | "parent_account";
  code: string;
  actor?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  if (!sql) return;
  try {
    await sql!`
      INSERT INTO client_config.admin_audit_log (action, dimension, code, actor, details)
      VALUES (
        ${input.action},
        ${input.dimension},
        ${input.code},
        ${input.actor ?? "admin"},
        ${input.details ? JSON.stringify(input.details) : null}
      )
    `;
  } catch (error) {
    captureError(error, { endpoint: "client-config-db", phase: "recordAdminAudit" });
  }
}

/**
 * Admin‑only: directly create a portfolio row, bypassing the staging pipeline.
 * Asserts the portfolio_code is unique first.
 */
export async function createClientConfigPortfolio(input: {
  portfolioCode: string;
  parentAccountId?: number | null;
  /** Who performed the admin action; recorded in client_config.admin_audit_log. */
  actor?: string | null;
}): Promise<ClientConfigPortfolio> {
  if (!sql) throw new Error("Database not available");
  const code = input.portfolioCode.trim().toUpperCase();

  // Shared uniqueness validation (active OR retired rows — codes are global identity).
  const lookup = createPortfolioMetadataLookup();
  if (await lookup.codeExists("portfolio", code)) {
    throw new Error(`Portfolio code "${code}" bestaat al.`);
  }

  const rows = await sql!`
    INSERT INTO client_config.portfolio (portfolio_code, parent_account_id, active_ind)
    VALUES (${code}, ${input.parentAccountId ?? null}, true)
    RETURNING portfolio_id, portfolio_code, parent_account_id, active_ind
  `;
  await ensureAdminAuditTable();
  await recordAdminAudit({
    action: "create_portfolio",
    dimension: "portfolio",
    code,
    actor: input.actor,
    details: { parent_account_id: input.parentAccountId ?? null },
  });
  return mapPortfolio(rows[0]);
}

/**
 * Admin‑only: quickly retire a portfolio (soft-delete).
 * Pre-checks that no active portfolio_configuration rows reference it.
 */
export async function retireClientConfigPortfolio(
  portfolioCode: string,
  actor?: string | null,
): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const code = portfolioCode.trim().toUpperCase();

  // Shared retire pre-conditions (spec §5.1): no active configs, no linked accounts.
  const lookup = createPortfolioMetadataLookup();
  if (await lookup.portfolioHasActiveConfigurations(code)) {
    throw new Error(
      `Portfolio "${code}" heeft nog actieve portfolio configuraties. Verwijder of archiveer deze eerst.`
    );
  }

  if (await lookup.portfolioHasAccounts(code)) {
    throw new Error(
      `Portfolio "${code}" is gekoppeld aan actieve rekeningen. Verwijder of archiveer deze eerst.`
    );
  }

  await sql!`
    UPDATE client_config.portfolio SET active_ind = false
    WHERE portfolio_code = ${code}
  `;
  await ensureAdminAuditTable();
  await recordAdminAudit({
    action: "retire_portfolio",
    dimension: "portfolio",
    code,
    actor,
  });
}

/**
 * Admin‑only: hard-delete a portfolio when it has no references.
 * Only succeeds when no active portfolio_configuration or account rows exist.
 */
export async function hardDeleteClientConfigPortfolio(
  portfolioCode: string,
  actor?: string | null,
): Promise<boolean> {
  if (!sql) throw new Error("Database not available");
  const code = portfolioCode.trim().toUpperCase();

  const [activeConfigs] = await sql!`
    SELECT 1 FROM client_config.portfolio_configuration
    WHERE portfolio_code = ${code}
    LIMIT 1
  `;
  if (activeConfigs) {
    throw new Error(
      `Portfolio "${code}" heeft nog portfolio configuraties. Verwijder of archiveer deze eerst.`
    );
  }

  const [activeAccounts] = await sql!`
    SELECT 1 FROM client_config.account a
    JOIN client_config.portfolio p ON p.portfolio_id = a.portfolio_id
    WHERE p.portfolio_code = ${code}
    LIMIT 1
  `;
  if (activeAccounts) {
    throw new Error(
      `Portfolio "${code}" is gekoppeld aan rekeningen. Verwijder of archiveer deze eerst.`
    );
  }

  const rows = await sql!`
    DELETE FROM client_config.portfolio WHERE portfolio_code = ${code}
    RETURNING portfolio_id
  `;
  const deleted = rows.length > 0;
  await ensureAdminAuditTable();
  await recordAdminAudit({
    action: "hard_delete_portfolio",
    dimension: "portfolio",
    code,
    actor,
    details: { deleted },
  });
  return deleted;
}

/**
 * Admin‑only: directly create a parent_account row, bypassing the staging pipeline.
 */
export async function createClientConfigParentAccount(input: {
  parentAccountCode: string;
  msaParentAccountCode?: string | null;
  /** Who performed the admin action; recorded in client_config.admin_audit_log. */
  actor?: string | null;
}): Promise<ClientConfigParentAccount> {
  if (!sql) throw new Error("Database not available");
  const code = input.parentAccountCode.trim().toUpperCase();

  // Shared uniqueness validation (active OR retired rows — codes are global identity).
  const lookup = createPortfolioMetadataLookup();
  if (await lookup.codeExists("parent_account", code)) {
    throw new Error(`Parent account code "${code}" bestaat al.`);
  }

  const rows = await sql!`
    INSERT INTO client_config.parent_account (parent_account_code, msa_parent_account_code, active_ind)
    VALUES (${code}, ${input.msaParentAccountCode?.trim().toUpperCase() ?? null}, true)
    RETURNING parent_account_id, parent_account_code, msa_parent_account_code, active_ind
  `;
  await ensureAdminAuditTable();
  await recordAdminAudit({
    action: "create_parent_account",
    dimension: "parent_account",
    code,
    actor: input.actor,
    details: { msa_parent_account_code: input.msaParentAccountCode?.trim().toUpperCase() ?? null },
  });
  return mapParentAccount(rows[0]);
}

/**
 * Admin‑only: update a parent_account's fields.
 * Code changes are allowed because this is an admin bypass.
 */
export async function updateClientConfigParentAccount(
  parentAccountId: number,
  patch: {
    parentAccountCode?: string;
    msaParentAccountCode?: string | null;
  },
  actor?: string | null,
): Promise<ClientConfigParentAccount> {
  if (!sql) throw new Error("Database not available");

  // Capture the pre-mutation state for the audit trail (§9.2: code changes are
  // identity changes and must be recorded out-of-band).
  const [beforeRow] = await sql!`
    SELECT parent_account_code, msa_parent_account_code
    FROM client_config.parent_account
    WHERE parent_account_id = ${parentAccountId}
  `;

  const rows = await sql!`
    UPDATE client_config.parent_account
    SET
      parent_account_code     = COALESCE(${patch.parentAccountCode?.trim().toUpperCase() ?? null}, parent_account_code),
      msa_parent_account_code = COALESCE(${patch.msaParentAccountCode !== undefined ? (patch.msaParentAccountCode?.trim().toUpperCase() ?? null) : null}, msa_parent_account_code)
    WHERE parent_account_id = ${parentAccountId}
    RETURNING parent_account_id, parent_account_code, msa_parent_account_code, active_ind
  `;
  if (rows.length === 0) throw new Error("Parent account bestaat niet.");

  await ensureAdminAuditTable();
  await recordAdminAudit({
    action: "update_parent_account",
    dimension: "parent_account",
    code: String(rows[0].parent_account_code),
    actor,
    details: {
      parent_account_id: parentAccountId,
      before: beforeRow
        ? {
            parent_account_code: String(beforeRow.parent_account_code),
            msa_parent_account_code: beforeRow.msa_parent_account_code != null ? String(beforeRow.msa_parent_account_code) : null,
          }
        : null,
      after: {
        parent_account_code: String(rows[0].parent_account_code),
        msa_parent_account_code: rows[0].msa_parent_account_code != null ? String(rows[0].msa_parent_account_code) : null,
      },
    },
  });
  return mapParentAccount(rows[0]);
}

/**
 * Admin‑only: retire a parent_account (soft-delete).
 * Pre-checks that no active portfolios reference it.
 */
export async function retireClientConfigParentAccount(
  parentAccountCode: string,
  actor?: string | null,
): Promise<void> {
  if (!sql) throw new Error("Database not available");
  const code = parentAccountCode.trim().toUpperCase();

  // Shared retire pre-condition (spec §5.1): no active portfolios may reference it.
  const lookup = createPortfolioMetadataLookup();
  if (await lookup.parentAccountHasActivePortfolios(code)) {
    throw new Error(
      `Parent account "${code}" heeft nog actieve portfolios. Archiveer deze eerst.`
    );
  }

  await sql!`
    UPDATE client_config.parent_account SET active_ind = false
    WHERE parent_account_code = ${code}
  `;
  await ensureAdminAuditTable();
  await recordAdminAudit({
    action: "retire_parent_account",
    dimension: "parent_account",
    code,
    actor,
  });
}

/**
 * Admin‑only: hard-delete a parent_account when it has no references.
 */
export async function hardDeleteClientConfigParentAccount(
  parentAccountCode: string,
  actor?: string | null,
): Promise<boolean> {
  if (!sql) throw new Error("Database not available");
  const code = parentAccountCode.trim().toUpperCase();

  const [hasPortfolios] = await sql!`
    SELECT 1 FROM client_config.portfolio
    WHERE parent_account_id = (
      SELECT parent_account_id FROM client_config.parent_account WHERE parent_account_code = ${code}
    )
    LIMIT 1
  `;
  if (hasPortfolios) {
    throw new Error(
      `Parent account "${code}" is gekoppeld aan portfolios. Verwijder deze eerst.`
    );
  }

  const rows = await sql!`
    DELETE FROM client_config.parent_account WHERE parent_account_code = ${code}
    RETURNING parent_account_id
  `;
  const deleted = rows.length > 0;
  await ensureAdminAuditTable();
  await recordAdminAudit({
    action: "hard_delete_parent_account",
    dimension: "parent_account",
    code,
    actor,
    details: { deleted },
  });
  return deleted;
}
