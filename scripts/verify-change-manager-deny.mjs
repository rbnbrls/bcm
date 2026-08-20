/**
 * Live deny-path verification for t_a706ed74 (change manager cannot
 * approve/reject). Creates a real approval task row in the local e2e DB
 * (bound to bcm:role:account_manager with workflow:approve — same shape as
 * the benchmark-wijziging workflow) and runs the REAL WorkflowTaskService
 * against the REAL PostgresWorkflowRuntimeStore with a change_manager
 * identity. Expected: permission_denied for claim, approve and reject.
 *
 * The task is created on the approval node of an existing running instance
 * so the row is fully FK-consistent with the runtime schema.
 */
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";

function encode(value) { return Buffer.from(value, "utf8").toString("base64url"); }
function sign(payload) { return createHmac("sha256", SECRET).update(payload).digest("base64url"); }

function identityContext(role, groups = []) {
  return {
    userId: `e2e:${role}`,
    displayName: role,
    groups: [`bcm:role:${role}`, ...groups],
    tenant: "e2e",
    businessUnit: "e2e",
    sessionId: `e2e-${role}-${Date.now()}`,
  };
}

async function main() {
  const db = postgres("postgres://bcm@localhost:5432/bcm");
  await db`SELECT 1`;
  let failures = 0;
  const expect = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`[${ok ? "PASS" : "FAIL"}] ${label}: expected ${expected}, got ${actual}`);
    return ok;
  };

  const { require } = await import("tsx/cjs/api");
  const taskMod = require(new URL("../lib/workflow-studio/runtime-task.ts", import.meta.url).href, import.meta.url);
  const storeMod = require(new URL("../lib/workflow-studio/runtime-postgres-store.ts", import.meta.url).href, import.meta.url);

  // Create a fresh running instance to hang the approval node off, so the
  // unique (instance, node, attempt) constraint never collides with earlier
  // verification runs and no decision variable exists yet.
  const instanceId = randomUUID();
  const versionId = "0b6f3c56-1176-41ce-bb22-d0f1c661842e"; // benchmark-wijziging v1 (published)
  const now = new Date().toISOString();
  await db`
    INSERT INTO workflow_instance (
      id, workflow_version_id, tenant, business_unit, client_ids, status,
      idempotency_key, correlation_id, input, started_by_user_id, started_at,
      created_at, updated_at
    ) VALUES (
      ${instanceId}, ${versionId}, 'e2e', 'e2e', ARRAY['HOR']::text[], 'running',
      ${`verify-${instanceId}`}, ${`corr-${instanceId}`}, '{}'::jsonb,
      'e2e:change_manager', ${now}, ${now}, ${now}
    )
  `;
  console.log(`using fresh instance ${instanceId}`);

  // Find the approval node definition for this version
  const nodeDef = await db`
    SELECT n.id, n.configuration FROM workflow_node n
    JOIN workflow_version v ON v.id = n.workflow_version_id
    WHERE n.workflow_version_id = ${versionId} AND n.block_type='approval' LIMIT 1
  `;
  if (nodeDef.length === 0) throw new Error("no approval node in workflow version");
  const approvalNodeId = nodeDef[0].id;

  // Create a node instance for the approval node (running status so task can be created)
  const nodeInstanceId = randomUUID();
  const nodeNow = new Date().toISOString();
  await db`
    INSERT INTO workflow_node_instance (
      id, workflow_instance_id, workflow_version_id, workflow_node_id,
      status, attempt, max_attempts, idempotency_key, correlation_id,
      causation_id, input, output, available_at, started_at, created_at, updated_at
    ) VALUES (
      ${nodeInstanceId}, ${instanceId}, ${versionId}, ${approvalNodeId},
      'running', 1, 3, ${`node-${nodeInstanceId}`}, ${`corr-${nodeInstanceId}`},
      ${`cause-${nodeInstanceId}`}, '{}'::jsonb, '{}'::jsonb,
      ${nodeNow}, ${nodeNow}, ${nodeNow}, ${nodeNow}
    )
  `;

  // Find the account_manager role binding (workflow:approve) for this version
  const binding = await db`
    SELECT id FROM workflow_role_binding
    WHERE workflow_version_id=${versionId} AND workflow_role='account_manager' LIMIT 1
  `;
  if (binding.length === 0) throw new Error("no account_manager role binding for version");
  const bindingId = binding[0].id;

  // Insert a real approval task (open, assignee_group=account_manager)
  const taskId = randomUUID();
  await db`
    INSERT INTO workflow_task (
      id, workflow_instance_id, workflow_version_id, workflow_node_instance_id,
      workflow_role_binding_id, status, title, instructions, assignee_group,
      idempotency_key, correlation_id, causation_id, created_at, updated_at
    ) VALUES (
      ${taskId}, ${instanceId}, ${versionId}, ${nodeInstanceId},
      ${bindingId}, 'open', 'Goedkeuring door Account Manager',
      'Bevestig dat de aanvraag akkoord is volgens het mandaat van Account Manager.',
      'bcm:role:account_manager', ${`task-${taskId}`}, ${`corr-${taskId}`},
      ${`cause-${taskId}`}, ${now}, ${now}
    )
  `;
  console.log(`approval task ${taskId} created on instance ${instanceId}`);

  const store = new storeMod.PostgresWorkflowRuntimeStore(db);
  const service = new taskMod.WorkflowTaskService(store);
  const occurredAt = new Date().toISOString();

  // change_manager: has workflow:start, NOT workflow:approve
  const cmCtx = identityContext("change_manager", ["bcm:client:HOR"]);

  const claim = await service.claim(cmCtx, { taskId, occurredAt });
  expect("change_manager claim (approval task) → permission_denied", claim.ok ? "allowed" : claim.code, "permission_denied");

  const approve = await service.decideApproval(cmCtx, {
    taskId, commandId: randomUUID(), correlationId: randomUUID(), occurredAt,
    decision: "approved", comment: "Geen mandaat.",
  });
  expect("change_manager approve → permission_denied", approve.ok ? "allowed" : approve.code, "permission_denied");

  const reject = await service.decideApproval(cmCtx, {
    taskId, commandId: randomUUID(), correlationId: randomUUID(), occurredAt,
    decision: "rejected", comment: "Geen mandaat.",
  });
  expect("change_manager reject → permission_denied", reject.ok ? "allowed" : reject.code, "permission_denied");

  // Control: account_manager CAN claim the same task (has workflow:approve)
  const amCtx = identityContext("account_manager", ["bcm:client:HOR"]);
  const amClaim = await service.claim(amCtx, { taskId, occurredAt });
  expect("account_manager claim (control) → allowed", amClaim.ok ? "allowed" : amClaim.code, "allowed");
  if (amClaim.ok) {
    const amDecide = await service.decideApproval(amCtx, {
      taskId, commandId: randomUUID(), correlationId: randomUUID(), occurredAt,
      decision: "approved", comment: "Akkoord door live verify.",
    });
    expect("account_manager approve (control) → allowed", amDecide.ok ? "allowed" : amDecide.code, "allowed");
  }

  // Cleanup: remove the synthetic node instance + task (cascade), plus any
  // variables written by the approval decision. Events are append-only
  // (audit log) — they stay as a record of this verification, and the FK
  // from workflow_event keeps the synthetic node instance in place. Best
  // effort: a cleanup failure must not mask a green verification.
  try {
    await db`DELETE FROM workflow_variable WHERE source_node_instance_id=${nodeInstanceId}`;
    await db`DELETE FROM workflow_task WHERE id=${taskId}`;
    await db`DELETE FROM workflow_node_instance WHERE id=${nodeInstanceId}`;
    console.log("[cleanup] synthetic node instance + task removed");
  } catch (e) {
    console.log(`[cleanup] left in place (append-only event FK): ${e.message}`);
  }

  console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  await db.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n❌ VERIFY FAILED: ${error.message}`);
  process.exit(1);
});
