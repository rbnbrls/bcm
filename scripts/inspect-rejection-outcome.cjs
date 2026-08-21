/** Verify rejection-path outcome: task record, comment, instance state, benchmark unchanged. */
const postgres = require("postgres");
const sql = postgres("postgres://bcm@localhost:5432/bcm");

(async () => {
  const instanceId = process.argv[2];
  if (!instanceId) throw new Error("usage: node inspect-rejection-outcome.cjs <instanceId>");

  const instance = await sql`
    SELECT id, status, result, error_code, error_message, created_at, updated_at
    FROM workflow_instance WHERE id = ${instanceId}`;
  console.log("INSTANCE:", JSON.stringify(instance, null, 1));

  const tasks = await sql`
    SELECT id, status, outcome, completion_comment, form_data, claimed_by_user_id, completed_at
    FROM workflow_task WHERE workflow_instance_id = ${instanceId} ORDER BY created_at`;
  console.log("TASKS:", JSON.stringify(tasks, null, 1));

  const nodes = await sql`
    SELECT wn.node_key, wni.status, wn.block_type
    FROM workflow_node_instance wni
    JOIN workflow_node wn ON wn.id = wni.workflow_node_id AND wn.workflow_version_id = wni.workflow_version_id
    WHERE wni.workflow_instance_id = ${instanceId} ORDER BY wni.created_at`;
  console.log("NODES:", JSON.stringify(nodes, null, 1));
  const events = await sql`
    SELECT event_type, payload, actor_id FROM workflow_event
    WHERE workflow_instance_id = ${instanceId}
    ORDER BY sequence_number`;
  console.log("EVENTS:", JSON.stringify(events.map((e) => ({ event_type: e.event_type, payload: e.payload, actor_id: e.actor_id })), null, 1));

  const benchmark = await sql`
    SELECT benchmark_code FROM client_config.portfolio_configuration
    WHERE primary_account_id = 'HOR*EQACX*EIG'`;
  console.log("BENCHMARK_NOW:", JSON.stringify(benchmark));

  const variables = await sql`
    SELECT name, value FROM workflow_variable WHERE workflow_instance_id = ${instanceId} ORDER BY name`;
  console.log("VARIABLES:", JSON.stringify(variables));
  await sql.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
