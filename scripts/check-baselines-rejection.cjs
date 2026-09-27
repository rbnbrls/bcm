/** Verify all 3 baseline benchmark assignments unchanged after rejection test. */
const postgres = require("postgres");
const sql = postgres("postgres://bcm@localhost:5432/bcm");

(async () => {
  const rows = await sql`
    SELECT pc.primary_account_id, pc.portfolio_code, pc.benchmark_code
    FROM client_config.portfolio_configuration pc
    WHERE pc.portfolio_code IN ('HORRP','HORMP','ZEKRET')
       OR pc.primary_account_id LIKE 'HOR%' OR pc.primary_account_id LIKE 'ZEK%'
    ORDER BY pc.portfolio_code, pc.primary_account_id`;
  console.log("BASELINES:", JSON.stringify(rows, null, 1));
  await sql.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
