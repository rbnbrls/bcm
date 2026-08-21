/**
 * DB inspection helper for kanban t_1bcd4e58 — benchmark change request creation.
 * Queries change_requests + workflow_instance state against the local e2e DB.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm");

async function main() {
  const statusCounts = await sql`SELECT status, count(*)::int AS n FROM change_requests GROUP BY status ORDER BY status`;
  console.log("STATUS_COUNTS " + JSON.stringify(statusCounts));

  const latest = await sql`
    SELECT id, reference, status, workflow_instance_id, submitted_at
    FROM change_requests ORDER BY created_at DESC LIMIT 8
  `;
  console.log("LATEST_CHANGE_REQUESTS " + JSON.stringify(latest, null, 1));

  const instances = await sql`
    SELECT id, status, workflow_version_id, started_by_user_id, started_at
    FROM workflow_instance ORDER BY started_at DESC LIMIT 8
  `;
  console.log("LATEST_INSTANCES " + JSON.stringify(instances, null, 1));

  const portCfg = await sql`
    SELECT primary_account_id, client_code, portfolio_code, benchmark_code
    FROM client_config.portfolio_configuration
    WHERE primary_account_id = 'HOR*EQACX*EIG'
  `;
  console.log("HORRP_CONFIG " + JSON.stringify(portCfg));

  const benchCatalog = await sql`
    SELECT id, code, name FROM benchmark_catalog ORDER BY code
  `;
  console.log("BENCHMARK_CATALOG " + JSON.stringify(benchCatalog.map((r) => ({ code: r.code, name: r.name }))));

  await sql.end();
}

main().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
