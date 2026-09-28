/**
 * Live verification for kanban task t_f7413517:
 * the account manager account (e2e:account_manager / Arjan Accountmanager)
 * can log in, CLAIM and APPROVE/REJECT benchmark change approval tasks, but
 * CANNOT create benchmark change requests and has no admin access.
 *
 * Uses the real dev server (login via signed session cookie + HTTP create
 * denial) and the real engine + task service against the local e2e DB.
 *
 * Run (see documentation/development/benchmark-change-test-environment.md):
 *   DATABASE_URL=postgres://bcm@localhost:5432/bcm \
 *     node scripts/verify-account-manager-account.mjs
 */
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bcm@localhost:5432/bcm";
}

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const TEST_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff"; // HOR-RP
// benchmark-wijziging v1 (published) — must match the doc
const VERSION_ID = "0b6f3c56-1176-41ce-bb22-d0f1c661842e";

function encode(value) { return Buffer.from(value, "utf8").toString("base64url"); }
function sign(payload) { return createHmac("sha256", SECRET).update(payload).digest("base64url"); }

// Forge the same signed identity session the UI/profile switcher produces
// for the account manager (no password database — see doc).
export function identityToken(role, groups = []) {
  const names = { change_manager: "Chris Change", account_manager: "Arjan Accountmanager", admin: "Bert Beheerder", viewer: "Vera Viewer" };
  const now = Date.now();
  const identity = {
    userId: `e2e:${role}`,
    displayName: names[role] ?? role,
    groups: [`bcm:role:${role}`, ...groups],
    tenant: "e2e",
    businessUnit: "e2e",
    sessionId: `e2e-${role}-${now}`,
    issuedAt: now,
    expiresAt: now + 8 * 3600 * 1000,
  };
  const encoded = encode(JSON.stringify(identity));
  return `${encoded}.${sign(encoded)}`;
}

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

async function apiPost(path, identity, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE}=${identity}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text };
}

async function main() {
  const db = postgres(process.env.DATABASE_URL);
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

  // ---- 1. Login: the account manager session token must be accepted as an
  // authenticated identity (same signed-cookie mechanism the profile
  // switcher uses in the dev UI). We verify by calling the real session
  // verifier with the forged token.
  const { verifyIdentitySessionToken } = require(new URL("../lib/identity/session.ts", import.meta.url).href, import.meta.url);
  const amToken = identityToken("account_manager", ["bcm:client:HOR"]);
  const verified = verifyIdentitySessionToken(amToken, { secret: SECRET });
  expect("account_manager session verifies (login)", verified?.userId ?? null, "e2e:account_manager");
  expect("account_manager role group present", verified?.groups?.includes("bcm:role:account_manager") ?? false, true);
  expect("account_manager client scope HOR present", verified?.groups?.includes("bcm:client:HOR") ?? false, true);

  // ---- 2. No create permission: POST /api/workflows/benchmark-change with
  // the account_manager session must be denied (missing workflow:start).
  const am = identityToken("account_manager", ["bcm:client:HOR"]);
  const body = {
    clientCode: "HOR",
    primaryAccountId: TEST_PORTFOLIO_ID,
    requestedBenchmarkCode: "BLOOMBERG-EU-AGG",
    requestedBy: "E2E t_f7413517 verification",
    rationale: `t_f7413517 live verification: account manager must NOT create. ${new Date().toISOString()}`,
    effectiveDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  };
  const denied = await apiPost("/api/workflows/benchmark-change", am, body);
  expect("create as account_manager → HTTP 403 (no workflow:start)", denied.status, 403);

  // Locate the approval node + account_manager role binding for this version
  const nodeDef = await db`
    SELECT n.id FROM workflow_node n
    JOIN workflow_version v ON v.id = n.workflow_version_id
    WHERE n.workflow_version_id = ${VERSION_ID} AND n.block_type='approval' LIMIT 1
  `;
  if (nodeDef.length === 0) throw new Error("no approval node in workflow version");
  const approvalNodeId = nodeDef[0].id;

  const binding = await db`
    SELECT id FROM workflow_role_binding
    WHERE workflow_version_id=${VERSION_ID} AND workflow_role='account_manager' LIMIT 1
  `;
  if (binding.length === 0) throw new Error("no account_manager role binding for version");

  // ---- 3. Approve/reject: create a real approval task bound to the
  // account_manager role (workflow:approve), then drive the REAL
  // WorkflowTaskService with the account_manager identity. It must be able
  // to claim, approve AND reject. Each decision path gets its OWN fresh
  // instance: the approval node writes an instance-scoped decision variable
  // (approval_account_manager_decision), so two decisions on one instance
  // collide with "al door een andere runtime-output geschreven".
  async function createApprovalFixture() {
    const fixtureInstanceId = randomUUID();
    const fixtureNow = new Date().toISOString();
    await db`
      INSERT INTO workflow_instance (
        id, workflow_version_id, tenant, business_unit, client_ids, status,
        idempotency_key, correlation_id, input, started_by_user_id, started_at,
        created_at, updated_at
      ) VALUES (
        ${fixtureInstanceId}, ${VERSION_ID}, 'e2e', 'e2e', ARRAY['HOR']::text[], 'running',
        ${`verify-am-${fixtureInstanceId}`}, ${`corr-${fixtureInstanceId}`}, '{}'::jsonb,
        'e2e:change_manager', ${fixtureNow}, ${fixtureNow}, ${fixtureNow}
      )
    `;

    const fixtureNodeInstanceId = randomUUID();
    await db`
      INSERT INTO workflow_node_instance (
        id, workflow_instance_id, workflow_version_id, workflow_node_id,
        status, attempt, max_attempts, idempotency_key, correlation_id,
        causation_id, input, output, available_at, started_at, created_at, updated_at
      ) VALUES (
        ${fixtureNodeInstanceId}, ${fixtureInstanceId}, ${VERSION_ID}, ${approvalNodeId},
        'running', 1, 3, ${`node-${fixtureNodeInstanceId}`}, ${`corr-${fixtureNodeInstanceId}`},
        ${`cause-${fixtureNodeInstanceId}`}, '{}'::jsonb, '{}'::jsonb,
        ${fixtureNow}, ${fixtureNow}, ${fixtureNow}, ${fixtureNow}
      )
    `;

    const fixtureTaskId = randomUUID();
    await db`
      INSERT INTO workflow_task (
        id, workflow_instance_id, workflow_version_id, workflow_node_instance_id,
        workflow_role_binding_id, status, title, instructions, assignee_group,
        idempotency_key, correlation_id, causation_id, created_at, updated_at
      ) VALUES (
        ${fixtureTaskId}, ${fixtureInstanceId}, ${VERSION_ID}, ${fixtureNodeInstanceId},
        ${binding[0].id}, 'open', 'Goedkeuring door Account Manager',
        'Bevestig dat de aanvraag akkoord is volgens het mandaat van Account Manager.',
        'bcm:role:account_manager', ${`task-${fixtureTaskId}`}, ${`corr-${fixtureTaskId}`},
        ${`cause-${fixtureTaskId}`}, ${fixtureNow}, ${fixtureNow}
      )
    `;
    return { instanceId: fixtureInstanceId, nodeInstanceId: fixtureNodeInstanceId, taskId: fixtureTaskId, now: fixtureNow };
  }

  const store = new storeMod.PostgresWorkflowRuntimeStore(db);
  const service = new taskMod.WorkflowTaskService(store);
  const amCtx = identityContext("account_manager", ["bcm:client:HOR"]);

  // ---- 3a. Approve path ----
  const approveFixture = await createApprovalFixture();
  console.log(`approval task (approve path) ${approveFixture.taskId} on instance ${approveFixture.instanceId}`);

  const amClaim = await service.claim(amCtx, { taskId: approveFixture.taskId, occurredAt: approveFixture.now });
  expect("account_manager claim (approve path) → allowed", amClaim.ok ? "allowed" : amClaim.code, "allowed");
  const amApprove = await service.decideApproval(amCtx, {
    taskId: approveFixture.taskId, commandId: randomUUID(), correlationId: randomUUID(), occurredAt: approveFixture.now,
    decision: "approved", comment: "Akkoord door live verify (t_f7413517).",
  });
  expect("account_manager approve → allowed", amApprove.ok ? "allowed" : amApprove.code, "allowed");

  // ---- 3b. Reject path (fresh instance so the decision variable does not
  // collide with the approve path) ----
  const rejectFixture = await createApprovalFixture();
  console.log(`approval task (reject path) ${rejectFixture.taskId} on instance ${rejectFixture.instanceId}`);

  const rejClaim = await service.claim(amCtx, { taskId: rejectFixture.taskId, occurredAt: rejectFixture.now });
  expect("account_manager claim (reject path) → allowed", rejClaim.ok ? "allowed" : rejClaim.code, "allowed");
  const amReject = await service.decideApproval(amCtx, {
    taskId: rejectFixture.taskId, commandId: randomUUID(), correlationId: randomUUID(), occurredAt: rejectFixture.now,
    decision: "rejected", comment: "Afgekeurd door live verify (t_f7413517).",
  });
  expect("account_manager reject → allowed", amReject.ok ? "allowed" : amReject.code, "allowed");

  // ---- 3c. Control: change_manager (workflow:start, no workflow:approve)
  // must STILL be denied on the account manager's approval task ----
  const cmCtx = identityContext("change_manager", ["bcm:client:HOR"]);
  const cmClaim = await service.claim(cmCtx, { taskId: approveFixture.taskId, occurredAt: approveFixture.now });
  expect("change_manager claim (control, denied) → permission_denied", cmClaim.ok ? "allowed" : cmClaim.code, "permission_denied");

  // ---- 4. No admin access ----
  // The account_manager profile in lib/rbac-config.ts has no admin:access;
  // navigation to /admin is blocked by navigationPermissions.
  const { roleHasPermission, getProfile } = require(new URL("../lib/rbac.ts", import.meta.url).href, import.meta.url);
  expect("account_manager profile has workflow:approve", roleHasPermission("account_manager", "workflow:approve"), true);
  expect("account_manager profile has changes:approve", roleHasPermission("account_manager", "changes:approve"), true);
  expect("account_manager profile lacks workflow:start", roleHasPermission("account_manager", "workflow:start"), false);
  expect("account_manager profile lacks changes:create", roleHasPermission("account_manager", "changes:create"), false);
  expect("account_manager profile lacks admin:access", roleHasPermission("account_manager", "admin:access"), false);
  expect("account_manager profile fullName", getProfile("account_manager").fullName, "Arjan Accountmanager");

  // ---- Cleanup: remove synthetic rows (events are append-only audit) ----
  try {
    const nodeIds = [approveFixture.nodeInstanceId, rejectFixture.nodeInstanceId];
    await db`DELETE FROM workflow_variable WHERE source_node_instance_id = ANY(${nodeIds})`;
    await db`DELETE FROM workflow_task WHERE id = ANY(${[approveFixture.taskId, rejectFixture.taskId]})`;
    await db`DELETE FROM workflow_node_instance WHERE id = ANY(${nodeIds})`;
    console.log("[cleanup] synthetic node instances + tasks removed");
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
