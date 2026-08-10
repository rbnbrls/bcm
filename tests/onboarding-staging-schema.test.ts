/**
 * Schema contract tests for client_config.client_onboarding_staging.
 *
 * The staging table is the single entry point for onboarding genuinely new
 * pension funds (client + initial portfolio) through the change process.
 * These tests pin the DDL contract so the runtime migration
 * (scripts/migrate.mjs), the fresh-install schema (db/clientconfig_schema.sql)
 * and the data-model documentation stay in lockstep:
 *
 *   1. The required column set is present in BOTH schema sources:
 *      staging_id, client_code, client_name, initial portfolio metadata,
 *      status, and timestamps.
 *   2. The idempotency unique constraint (client_code, status) exists.
 *   3. The status CHECK allows only pending/applied/failed.
 *   4. The column sets of the two schema sources agree (no drift).
 *   5. The per-table documentation exists.
 *
 * These are pure static-analysis tests — no DATABASE_URL required.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs/promises";
import path from "path";

const MIGRATE_PATH = path.resolve(__dirname, "..", "scripts", "migrate.mjs");
const SCHEMA_PATH = path.resolve(
  __dirname,
  "..",
  "db",
  "clientconfig_schema.sql",
);
const DOC_PATH = path.resolve(
  __dirname,
  "..",
  "documentation",
  "database",
  "data-model",
  "client-onboarding-staging.md",
);

const REQUIRED_COLUMNS = [
  "staging_id",
  "change_request_id",
  "client_code",
  "client_name",
  "portfolio_code",
  "parent_account_code",
  "asset_class_code",
  "sub_asset_class_code",
  "manager_code",
  "benchmark_code",
  "npc_classification_id",
  "long_name",
  "short_name",
  "effective_from",
  "effective_until",
  "status",
  "apply_error",
  "created_at",
  "updated_at",
  "processed_at",
];

/**
 * Extract the CREATE TABLE block for client_onboarding_staging from a source
 * file and return the set of declared column names.
 */
function extractColumns(source: string): Set<string> {
  const start = source.indexOf("client_onboarding_staging (");
  expect(start, "client_onboarding_staging DDL not found in source").toBeGreaterThanOrEqual(0);
  const block = source.substring(start);
  const end = block.search(/\n\s*\)/);
  expect(end, "client_onboarding_staging CREATE TABLE block not closed").toBeGreaterThanOrEqual(0);
  const body = block.substring(0, end);

  const columns = new Set<string>();
  for (const line of body.split("\n")) {
    const match = line.match(/^\s{2,}([a-z_]+)\s+(bigint|uuid|varchar|char|smallint|date|timestamptz|text|boolean)/);
    if (match) columns.add(match[1]);
  }
  return columns;
}

describe("client_onboarding_staging — migration contract", () => {
  let migrateSource: string;
  let schemaSource: string;

  beforeAll(async () => {
    migrateSource = await fs.readFile(MIGRATE_PATH, "utf-8");
    schemaSource = await fs.readFile(SCHEMA_PATH, "utf-8");
  });

  it("is created by scripts/migrate.mjs (CC_EXTRA_TABLES)", () => {
    expect(migrateSource).toContain(
      "${CC_SCHEMA}.client_onboarding_staging (",
    );
  });

  it("is created by db/clientconfig_schema.sql (fresh install)", () => {
    expect(schemaSource).toContain(
      "CREATE TABLE client_config.client_onboarding_staging (",
    );
  });

  it("declares every required column in the migration", () => {
    const columns = extractColumns(migrateSource);
    for (const col of REQUIRED_COLUMNS) {
      expect(columns.has(col), `migrate.mjs missing column: ${col}`).toBe(true);
    }
  });

  it("declares every required column in the fresh-install schema", () => {
    const columns = extractColumns(schemaSource);
    for (const col of REQUIRED_COLUMNS) {
      expect(
        columns.has(col),
        `clientconfig_schema.sql missing column: ${col}`,
      ).toBe(true);
    }
  });

  it("keeps the migration and fresh-install schema column sets in sync", () => {
    const migrateColumns = extractColumns(migrateSource);
    const schemaColumns = extractColumns(schemaSource);
    expect(migrateColumns).toEqual(schemaColumns);
  });

  it("supports idempotency via a UNIQUE constraint on (client_code, status)", () => {
    expect(migrateSource).toMatch(
      /CONSTRAINT uq_onboarding_client_status UNIQUE \(client_code, status\)/,
    );
    expect(schemaSource).toMatch(
      /CONSTRAINT uq_onboarding_client_status UNIQUE \(client_code, status\)/,
    );
  });

  it("restricts status to pending/applied/failed via CHECK", () => {
    expect(migrateSource).toContain(
      "status IN ('pending','applied','failed')",
    );
    expect(schemaSource).toContain(
      "status IN ('pending','applied','failed')",
    );
  });

  it("defaults status to 'pending'", () => {
    expect(migrateSource).toContain(
      "status varchar(20) NOT NULL DEFAULT 'pending'",
    );
    expect(schemaSource).toContain(
      "status varchar(20) NOT NULL DEFAULT 'pending'",
    );
  });

  it("links staging rows to exactly one change request (UNIQUE FK)", () => {
    expect(migrateSource).toContain(
      "change_request_id uuid NOT NULL UNIQUE REFERENCES change_requests(id) ON DELETE CASCADE",
    );
    expect(schemaSource).toContain(
      "change_request_id uuid NOT NULL UNIQUE REFERENCES change_requests(id) ON DELETE CASCADE",
    );
  });

  it("documents the table in the data model", async () => {
    const doc = await fs.readFile(DOC_PATH, "utf-8");
    expect(doc).toContain("client_onboarding_staging");
  });
});
