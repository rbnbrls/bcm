import type postgres from "postgres";

export function seedClientConfig(
  sql: postgres.Sql,
  options?: { silent?: boolean },
): Promise<Record<string, number>>;
