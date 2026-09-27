/**
 * Inspect published benchmark-wijziging workflow version + approval task state
 * for kanban t_1bcd4e58.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm");

async function main() {
  const def = await sql`
    SELECT wd.id, wd.slug, wd.status
    FROM workflow_definition wd
    WHERE wd.slug = 'benchmark-wijziging'
    ORDER BY wd.created_at DESC LIMIT 1
  `;
  if (def.length === 0) { console.log("NO_DEF"); await sql.end(); return; }
  const defId = def[0].id;

  const versions = await sql`
    SELECT id, version_number, status, published_at
    FROM workflow_version
    WHERE workflow_definition_id = ${defId}
    ORDER BY version_number DESC
  `;
  console.log("DEFINITION " + JSON.stringify(def[0]));
  console.log("VERSIONS " + JSON.stringify(versions));

  const openTasks = await sql`
    SELECT id, workflow_instance_id, workflow_role_binding_id, assignee_group, status, title, deadline_at
    FROM workflow_task
    WHERE status IN ('open','claimed')
    ORDER BY created_at DESC LIMIT 10
  `;
  console.log("OPEN_TASKS " + JSON.stringify(openTasks, null, 1));

  await sql.end();
}

main().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
