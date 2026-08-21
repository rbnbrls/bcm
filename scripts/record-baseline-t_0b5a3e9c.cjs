// Record baseline benchmark configuration for the test portfolio(s) — kanban t_0b5a3e9c
// Live check of change_requests / workflow_instance state + benchmark catalog mapping.
const { Client } = require("pg");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL || "postgres://bcm@localhost:5432/bcm" });
  try {
    await c.connect();
    const out = {};

    const reqs = await c.query(
      `SELECT status, count(*)::int AS n FROM change_requests GROUP BY status ORDER BY status`
    );
    out.change_requests_by_status = reqs.rows;

    const latest = await c.query(
      `SELECT id, status, created_at FROM change_requests ORDER BY created_at DESC LIMIT 8`
    );
    out.latest_change_requests = latest.rows;

    const inst = await c.query(
      `SELECT id, status, created_at FROM workflow_instance ORDER BY created_at DESC LIMIT 5`
    );
    out.latest_workflow_instances = inst.rows;

    // Benchmark catalog entries for the three baseline codes
    const bc = await c.query(
      `SELECT id, code, name FROM benchmark_catalog
       WHERE code IN ('MSCI-WORLD-NR','BLOOMBERG-EU-AGG','MSCI-ACWI-NR') ORDER BY code`
    );
    out.benchmark_catalog = bc.rows;

    // Full baseline assignments incl. code mapping
    const base = await c.query(
      `SELECT p.name, p.external_reference, bc.code, bc.name AS benchmark_name
       FROM portfolios p LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id
       ORDER BY p.name`
    );
    out.baselines = base.rows;

    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error("ERR:", e.message);
    process.exit(1);
  } finally {
    try { await c.end(); } catch {}
  }
})();
