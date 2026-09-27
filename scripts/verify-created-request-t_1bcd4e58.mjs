/**
 * Kanban t_1bcd4e58 — verify the created benchmark change request state
 * (created by create-benchmark-request-t_1bcd4e58.mjs).
 *
 * Verifies directly in the local e2e DB that the request created for HOR-RP
 * (instance id passed as argv[2]) is:
 *   - change_requests.status == 'submitted' (Pending, awaiting approval)
 *   - workflow_instance.status == 'running'
 *   - requested benchmark value BLOOMBERG-EU-AGG stored in fields.sollValue
 *     and workflow_variable requested_benchmark_id
 */
import postgres from "postgres";

const DB_URL = process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm";
const INSTANCE_ID = process.argv[2];
const TARGET_BENCHMARK = process.env.TARGET_BENCHMARK ?? "BLOOMBERG-EU-AGG";

if (!INSTANCE_ID) {
  console.error("usage: node scripts/verify-created-request-t_1bcd4e58.mjs <instanceId>");
  process.exit(2);
}

const sql = postgres(DB_URL);

async function main() {
  const instance = await sql`
    SELECT id, status, workflow_version_id, started_by_user_id, started_at
    FROM workflow_instance WHERE id = ${INSTANCE_ID}
  `;
  console.log(`INSTANCE_ROW ${JSON.stringify(instance[0] ?? null)}`);

  const changeReq = await sql`
    SELECT id, reference, change_type, status, requested_by, effective_date,
           fields, workflow_instance_id, submitted_at, created_at
    FROM change_requests WHERE workflow_instance_id = ${INSTANCE_ID}
  `;
  console.log(`CHANGE_REQUEST ${JSON.stringify(changeReq[0] ?? null, null, 1)}`);

  const variables = await sql`
    SELECT name, data_type, value FROM workflow_variable
    WHERE workflow_instance_id = ${INSTANCE_ID} ORDER BY name
  `;
  console.log(`INSTANCE_VARIABLES ${JSON.stringify(variables)}`);

  const audit = await sql`
    SELECT id, action, actor, previous_status, new_status, created_at
    FROM audit_log WHERE change_request_id = ${changeReq[0]?.id} ORDER BY created_at
  `;
  console.log(`AUDIT_LOG ${JSON.stringify(audit)}`);

  const cr = changeReq[0];
  const fields = typeof cr?.fields === "string" ? JSON.parse(cr.fields) : cr?.fields ?? [];
  const targetStored = Array.isArray(fields)
    && fields.some((f) => f.fieldKey === "requested_benchmark_id" && f.sollValue === TARGET_BENCHMARK);
  const variableStored = Array.isArray(variables)
    && variables.some((v) => v.name === "requested_benchmark_id" && v.value === TARGET_BENCHMARK);

  const ok =
    instance[0]?.status === "running" &&
    cr?.status === "submitted" &&
    targetStored &&
    variableStored;
  console.log(`VERIFY_OK ${ok ? "true" : "false"}`);
  console.log(`REQUEST_REFERENCE ${cr?.reference ?? "N/A"}`);
  console.log(`REQUEST_STATUS ${cr?.status ?? "N/A"}`);
  console.log(`REQUEST_TARGET ${TARGET_BENCHMARK}`);
  console.log(`TARGET_STORED_IN_FIELDS ${targetStored}`);
  console.log(`TARGET_STORED_IN_VARIABLES ${variableStored}`);
  console.log(`INSTANCE_STATUS ${instance[0]?.status ?? "N/A"}`);
  await sql.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
