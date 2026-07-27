#!/usr/bin/env node
/**
 * refresh-sla.mjs — Periodic SLA status refresh for change_requests.
 *
 * The sla_status and sla_days_open columns are auto-updated by a DB trigger
 * when status/created_at/sla_lead_weeks change. However, *time-based* SLA
 * transitions (ok → at_risk → overdue) happen without any column change,
 * so they must be refreshed periodically.
 *
 * This script refreshes SLA status for all non-terminal change requests
 * and logs how many rows were updated.
 *
 * Suggested cron schedule: every 30 minutes
 *   */30 * * * *  cd /app && node scripts/refresh-sla.mjs
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/refresh-sla.mjs
 *   DATABASE_URL=postgres://... node scripts/refresh-sla.mjs --dry-run
 *
 * Exit codes:
 *   0 = success (possibly 0 rows stale)
 *   1 = connection failure or SQL error
 */

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[refresh-sla] FATAL: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const isDryRun = process.argv.includes("--dry-run");
const sql = postgres(connectionString, { max: 1 });

async function main() {
  try {
    // Only refresh non-terminal rows — terminal statuses are always "ok"
    // and don't change over time.
    if (isDryRun) {
      const rows = await sql`
        SELECT COUNT(*)::int AS stale_count
        FROM change_requests
        WHERE status NOT IN ('validated', 'processed')
          AND (
            sla_status IS NULL
            OR sla_status != CASE
              WHEN (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) >= (sla_lead_weeks * 7) THEN 'overdue'
              WHEN (sla_lead_weeks * 7) - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) <= CEIL(sla_lead_weeks * 7 * 0.25) THEN 'at_risk'
              ELSE 'ok'
            END
            OR sla_days_open != GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400)
          )
      `;
      console.log(`[refresh-sla] DRY RUN: ${rows[0].stale_count} rows would be updated.`);
    } else {
      const result = await sql`
        UPDATE change_requests
        SET
          sla_status = CASE
            WHEN status IN ('validated', 'processed') THEN 'ok'
            WHEN (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) >= (sla_lead_weeks * 7) THEN 'overdue'
            WHEN (sla_lead_weeks * 7) - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) <= CEIL(sla_lead_weeks * 7 * 0.25) THEN 'at_risk'
            ELSE 'ok'
          END,
          sla_days_open = GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400)
        WHERE status NOT IN ('validated', 'processed')
          AND (
            sla_status IS NULL
            OR sla_status != CASE
              WHEN (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) >= (sla_lead_weeks * 7) THEN 'overdue'
              WHEN (sla_lead_weeks * 7) - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400) <= CEIL(sla_lead_weeks * 7 * 0.25) THEN 'at_risk'
              ELSE 'ok'
            END
            OR sla_days_open != GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int / 86400)
          )
      `;
      console.log(`[refresh-sla] Updated ${result.count} stale SLA rows.`);
    }
  } catch (err) {
    console.error(`[refresh-sla] Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main();
