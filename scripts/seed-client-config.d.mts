import type postgres from "postgres";

export declare const CLIENT_NAMES_BY_CODE: Readonly<Record<string, string>>;
export declare const LEGACY_CLIENTS: readonly {
  code: string;
  externalReference: string;
}[];

export function seedClientConfig(
  sql: postgres.Sql,
  options?: { silent?: boolean },
): Promise<Record<string, number>>;

/**
 * Idempotently backfill the legacy public `clients` table from
 * LEGACY_CLIENTS so every client_config.client code resolves a PF-<CODE>-%
 * row. Returns the number of rows inserted (0 when already mirrored).
 */
export function ensureLegacyClientsMirror(sql: postgres.Sql): Promise<number>;

/**
 * Drop the stale long_name/short_name CHECK constraints from the
 * client_config.change_portfolio_configuration STAGING table. #532/#533:
 * old migrate.mjs versions stored the name regex with doubled backslashes
 * (forbidding the literal characters \ r n instead of CR/LF); migrate.mjs
 * calls this to remove the broken constraints so staging INSERTs succeed.
 */
export function dropBrokenStagingNameChecks(sql: postgres.Sql): Promise<void>;
