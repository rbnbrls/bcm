/**
 * Pre-state check for the benchmark change approval happy path (t_01a05c9e).
 * Reports the current HOR portfolio_configuration benchmark assignments,
 * legacy portfolios, and workflow_change_intent counts.
 *
 * Usage:
 *   DATABASE_URL=postgres://bcm@localhost:5432/bcm \
 *     node scripts/check-approval-prestate.mjs
 */
import postgres from "postgres";
const db = postgres(process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm");

(async () => {
  const pc = await db`
    SELECT primary_account_id, client_code, portfolio_code, benchmark_code
    FROM client_config.portfolio_configuration
    WHERE client_code = 'HOR'
    ORDER BY primary_account_id
  `;
  console.log("portfolio_configuration HOR rows:");
  for (const r of pc) console.log(" ", r.primary_account_id, r.portfolio_code, r.benchmark_code);

  const legacy = await db`
    SELECT p.external_reference, bc.code FROM portfolios p LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id ORDER BY p.external_reference
  `;
  console.log("legacy portfolios:");
  for (const r of legacy) console.log(" ", r.external_reference, r.code);

  const intents = await db`SELECT status, COUNT(*)::int AS c FROM public.workflow_change_intent GROUP BY status ORDER BY status`;
  console.log("workflow_change_intent by status:", JSON.stringify(intents));

  const inst = await db`SELECT status, COUNT(*)::int AS c FROM workflow_instance GROUP BY status ORDER BY status`;
  console.log("workflow instances by status:", JSON.stringify(inst));

  await db.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
