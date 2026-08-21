/**
 * Inspect the benchmark-change approval outcome for a workflow instance:
 * variables (effective_date type/value), the change intent (status, dry-run
 * result, effective_at) and the instance status.
 *
 * Usage:
 *   DATABASE_URL=postgres://bcm@localhost:5432/bcm \
 *     node scripts/check-approval-outcome.mjs <instanceId>
 */
import postgres from "postgres";
const db = postgres(process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm");
const INSTANCE = process.argv[2] ?? "";

if (!INSTANCE) {
  console.error("Usage: node scripts/check-approval-outcome.mjs <instanceId>");
  process.exit(1);
}

(async () => {
  const vars = await db`
    SELECT name, data_type, value FROM workflow_variable WHERE workflow_instance_id = ${INSTANCE} ORDER BY name
  `;
  console.log(`variables for ${INSTANCE}:`);
  for (const v of vars) console.log(" ", v.name, `(${v.data_type})`, JSON.stringify(v.value));

  const intents = await db`
    SELECT id, adapter_id, resource_id, operation, status, dry_run_result, effective_at
    FROM public.workflow_change_intent WHERE workflow_instance_id = ${INSTANCE}
  `;
  console.log(`workflow_change_intent rows: ${intents.length}`);
  for (const r of intents) {
    console.log("  id:", r.id);
    console.log("  status:", r.status);
    console.log("  effective_at:", String(r.effective_at));
    console.log("  dry_run_result:", JSON.stringify(r.dry_run_result, null, 2));
  }

  const inst = await db`SELECT status, result FROM workflow_instance WHERE id = ${INSTANCE}`;
  console.log("instance:", JSON.stringify(inst[0]));

  await db.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
