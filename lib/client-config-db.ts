/**
 * Normalized client_config data access layer.
 *
 * Queries the 3NF client_config schema (portfolio_configuration and its lookup
 * tables) instead of the legacy flat clients/portfolios structure. This module
 * is the runtime counterpart to lib/entities/ and lib/schemas/domain.ts.
 */

import { sql } from "@/lib/db";
import type {
  ClientConfigAssetClass,
  ClientConfigBenchmark,
  ClientConfigManager,
  ClientConfigNpcClassification,
  ClientConfigPortfolio,
  ClientConfigPortfolioConfigurationRow,
  ClientConfigReferenceData,
  ClientConfigSubAssetClass,
} from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";

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

function mapPortfolio(row: Record<string, unknown>): ClientConfigPortfolio {
  return {
    portfolioId: Number(row.portfolio_id),
    portfolioCode: String(row.portfolio_code),
    parentAccountId: row.parent_account_id != null ? Number(row.parent_account_id) : null,
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
    const [portfolios, assetClasses, subAssetClasses, managers, benchmarks, npcClassifications] = await Promise.all([
      sql!`SELECT portfolio_id, portfolio_code, parent_account_id FROM client_config.portfolio ORDER BY portfolio_code`,
      sql!`SELECT asset_class_id, asset_class_code, asset_class_name FROM client_config.asset_class ORDER BY asset_class_name`,
      sql!`SELECT sub_asset_class_id, asset_class_id, sub_asset_class_code, sub_asset_class_name FROM client_config.sub_asset_class ORDER BY sub_asset_class_name`,
      sql!`SELECT manager_id, manager_code, manager_name FROM client_config.manager ORDER BY manager_name`,
      sql!`SELECT benchmark_id, benchmark_code, benchmark_name, rimes_code FROM client_config.benchmark ORDER BY benchmark_code`,
      sql!`SELECT npc_classification_id, classification_name FROM client_config.npc_classification ORDER BY classification_name`,
    ]);

    return {
      portfolios: portfolios.map(mapPortfolio),
      assetClasses: assetClasses.map(mapAssetClass),
      subAssetClasses: subAssetClasses.map(mapSubAssetClass),
      managers: managers.map(mapManager),
      benchmarks: benchmarks.map(mapBenchmark),
      npcClassifications: npcClassifications.map(mapNpcClassification),
    };
  }, {
    portfolios: [],
    assetClasses: [],
    subAssetClasses: [],
    managers: [],
    benchmarks: [],
    npcClassifications: [],
  });
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
    actionType: "CREATE" | "UPDATE" | "DELETE";
    portfolioCode: string;
    assetClassCode: string;
    subAssetClassCode: string;
    managerCode: string;
    benchmarkCode: string;
    npcClassificationId: number;
    longName: string;
    shortName: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
  },
): Promise<string> {
  if (!sql) throw new Error("Database not available");

  const rows = await sql!`
    INSERT INTO client_config.change_portfolio_configuration (
      change_request_id,
      action_type,
      portfolio_code,
      asset_class_code,
      sub_asset_class_code,
      manager_code,
      benchmark_code,
      npc_classification_id,
      long_name,
      short_name,
      effective_from,
      effective_until
    ) VALUES (
      ${input.changeRequestId},
      ${input.actionType},
      ${input.portfolioCode},
      ${input.assetClassCode},
      ${input.subAssetClassCode},
      ${input.managerCode},
      ${input.benchmarkCode},
      ${input.npcClassificationId},
      ${input.longName},
      ${input.shortName},
      ${input.effectiveFrom},
      ${input.effectiveUntil}
    )
    RETURNING id
  `;
  return String(rows[0].id);
}
