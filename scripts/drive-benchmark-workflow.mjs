/**
 * Benchmark change workflow — environment driver (test environment only).
 *
 * Drives a benchmark-wijziging instance through the full runtime chain
 * against the LOCAL dev database (postgres://bcm@localhost:5432/bcm) and
 * dev server (http://localhost:3000). Use after `npm run dev` with the
 * feature flags from documentation/development/benchmark-change-test-environment.md.
 *
 * Modes:
 *   node scripts/drive-benchmark-workflow.mjs approve   — happy path
 *   node scripts/drive-benchmark-workflow.mjs reject    — rejection path
 *   node scripts/drive-benchmark-workflow.mjs authz     — unauthorized matrix
 *
 * The script forges the same signed identity sessions as tests/e2e
 * (BCM_SESSION_SECRET=bcm-playwright-identity-session-secret) and drives
 * the engine through its public API (claimNext / execute / executeLookup /
 * executeChangeRequest / createApprovalTask / completeApprovalTask via the
 * WorkflowTaskService). It reports the benchmark before/after.
 */
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

// The engine modules imported below (runtime-engine, runtime-postgres-store)
// read `lib/db.ts`, whose `sql` is null unless DATABASE_URL is in the
// process env (Next.js loads .env; plain node scripts do not). Bootstrap it
// here so the in-process engine sees the same local DB the API uses.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bcm@localhost:5432/bcm";
}

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
// The benchmark-change API addresses portfolio_configuration rows by their
// primary_account_id (the stable HOR* code), NOT the legacy portfolios UUID.
// HOR-RP = Rendementsportefeuille (portfolio_code HORRP, benchmark MSCI-WORLD-NR).
const TEST_PORTFOLIO_ID = "HOR*EQACX*EIG";
const LEGACY_PORTFOLIO_UUID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff"; // portfolios row (HOR-RP)
const SOLL_BENCHMARK = "BLOOMBERG-EU-AGG"; // switch from MSCI-WORLD-NR

function encode(value) { return Buffer.from(value, "utf8").toString("base64url"); }
function sign(payload) { return createHmac("sha256", SECRET).update(payload).digest("base64url"); }

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

async function loadEngine() {
  // Import the app's TS modules through tsx (path aliases resolved via tsconfig).
  // tsx v4 dropped the old `tsx/esm/api` default `.import()`; the CJS API
  // (`tsx/cjs/api` `require`) resolves relative + tsconfig-alias imports.
  const { require } = await import("tsx/cjs/api");
  const engineMod = require(new URL("../lib/workflow-studio/runtime-engine.ts", import.meta.url).href, import.meta.url);
  const storeMod = require(new URL("../lib/workflow-studio/runtime-postgres-store.ts", import.meta.url).href, import.meta.url);
  const taskMod = require(new URL("../lib/workflow-studio/runtime-task.ts", import.meta.url).href, import.meta.url);
  return {
    WorkflowRuntimeEngine: engineMod.WorkflowRuntimeEngine,
    PostgresWorkflowRuntimeStore: storeMod.PostgresWorkflowRuntimeStore,
    WorkflowTaskService: taskMod.WorkflowTaskService,
  };
}

async function runAuthzMatrix(db, engine, taskService, body) {
  console.log("\n=== Unauthorized matrix ===");
  let failures = 0;
  const expect = (label, actual, expected) => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`[${ok ? "PASS" : "FAIL"}] ${label}: expected ${expected}, got ${actual}`);
    return ok;
  };

  // 1. HTTP create denials (no workflow:start → 403 before validation/scope)
  const viewer = identityToken("viewer");
  const am = identityToken("account_manager", ["bcm:client:HOR"]);
  const admin = identityToken("admin");

  for (const [role, token] of [["viewer", viewer], ["account_manager", am], ["admin", admin]]) {
    const res = await apiPost("/api/workflows/benchmark-change", token, body);
    expect(`create as ${role} → HTTP 403`, res.status, 403);
    if (res.status !== 403) console.log(`  body: ${res.text.slice(0, 300)}`);
  }

  // 2. Control: change_manager with client scope CAN create
  const cm = identityToken("change_manager", ["bcm:client:HOR"]);
  const created = await apiPost("/api/workflows/benchmark-change", cm, body);
  if (!expect("create as change_manager → HTTP 200 (control)", created.status, 200)) {
    console.log(`  body: ${created.text.slice(0, 500)}`);
    await db.end();
    process.exit(1);
  }
  const instanceId = created.json.instanceId;
  console.log(`instanceId=${instanceId}`);

  // 3. Drive the instance to the approval node and create the approval task
  const actor = { type: "user", id: "e2e:change_manager", sessionId: `e2e-${Date.now()}` };
  const occurredAt = new Date().toISOString();

  const started = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!started) throw new Error("no runnable node after start");
  console.log(`[claim] ${started.state.nodeKey} (${started.state.blockType}) → ${started.state.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: started.state.nodeInstanceId, expectedStatus: "running",
    actor, correlationId: randomUUID(), occurredAt,
  });

  const lookup = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!lookup) throw new Error("no lookup node");
  console.log(`[claim] ${lookup.state.nodeKey} (${lookup.state.blockType}) → ${lookup.state.status}`);
  await engine.executeClientConfigLookup({
    instanceId, nodeInstanceId: lookup.state.nodeInstanceId, commandId: randomUUID(),
    identity: identityContext("change_manager", ["bcm:client:HOR"]),
    actor, correlationId: randomUUID(), occurredAt,
  });

  const form = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!form) throw new Error("no form node");
  console.log(`[claim] ${form.state.nodeKey} (${form.state.blockType}) → ${form.state.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: form.state.nodeInstanceId, expectedStatus: "running",
    actor, correlationId: randomUUID(), occurredAt,
    output: {
      portfolio_id: body.primaryAccountId,
      requested_benchmark_id: body.requestedBenchmarkCode,
      effective_date: body.effectiveDate,
      rationale: body.rationale,
    },
    // Variables are already bound as start variables by the API route.
    outputVariables: [],
  });

  const approval = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!approval) throw new Error("no approval node");
  console.log(`[claim] ${approval.state.nodeKey} (${approval.state.blockType}) → ${approval.state.status}`);
  const task = await engine.createApprovalTask({
    instanceId, nodeInstanceId: approval.state.nodeInstanceId, commandId: randomUUID(),
    actor, correlationId: randomUUID(), occurredAt,
  });
  console.log(`[approval task created] ${task.task.id} assignee=${task.task.assigneeGroup}`);

  // 4. Task-level denials: viewer cannot claim/approve/reject
  const viewerCtx = identityContext("viewer");
  const claimViewer = await taskService.claim(viewerCtx, { taskId: task.task.id, occurredAt });
  expect("viewer claim → permission_denied", claimViewer.ok ? "allowed" : claimViewer.code, "permission_denied");

  const approveViewer = await taskService.decideApproval(viewerCtx, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision: "approved", comment: "Niet geautoriseerd.",
  });
  expect("viewer approve → permission_denied", approveViewer.ok ? "allowed" : approveViewer.code, "permission_denied");

  const rejectViewer = await taskService.decideApproval(viewerCtx, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision: "rejected", comment: "Niet geautoriseerd.",
  });
  expect("viewer reject → permission_denied", rejectViewer.ok ? "allowed" : rejectViewer.code, "permission_denied");

  // 5. change_manager (has workflow:start, NOT workflow:approve) cannot approve/reject
  const cmCtx = identityContext("change_manager", ["bcm:client:HOR"]);
  const claimCm = await taskService.claim(cmCtx, { taskId: task.task.id, occurredAt });
  expect("change_manager claim (approval task) → permission_denied", claimCm.ok ? "allowed" : claimCm.code, "permission_denied");
  const approveCm = await taskService.decideApproval(cmCtx, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision: "approved", comment: "Geen mandaat.",
  });
  expect("change_manager approve → permission_denied", approveCm.ok ? "allowed" : approveCm.code, "permission_denied");

  console.log(`\n=== Unauthorized matrix ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  if (failures > 0) process.exitCode = 1;
}

async function main() {
  const mode = process.argv[2] ?? "approve";
  const db = postgres(process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm");
  await db`SELECT 1`;

  const before = await db`
    SELECT pc.benchmark_code FROM client_config.portfolio_configuration pc WHERE pc.primary_account_id = ${TEST_PORTFOLIO_ID}
  `;
  const beforeCode = before[0]?.benchmark_code ?? null;
  console.log(`\n=== Benchmark change driver [${mode}] ===`);
  console.log(`Portfolio config HOR-RP (${TEST_PORTFOLIO_ID}) benchmark BEFORE: ${beforeCode}`);

  const mods = await loadEngine();
  const store = new mods.PostgresWorkflowRuntimeStore(db);
  const engine = new mods.WorkflowRuntimeEngine(store);
  const taskService = new mods.WorkflowTaskService(store);

  const cm = identityToken("change_manager", ["bcm:client:HOR"]);
  const am = identityToken("account_manager", ["bcm:client:HOR"]);

  const body = {
    clientCode: "HOR",
    primaryAccountId: TEST_PORTFOLIO_ID,
    requestedBenchmarkCode: SOLL_BENCHMARK,
    requestedBy: "E2E Test Driver",
    rationale: `Driver rationale ${mode} ${new Date().toISOString()}.`,
    effectiveDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  };

  if (mode === "authz") {
    await runAuthzMatrix(db, engine, taskService, body);
    await db.end();
    process.exit(process.exitCode ?? 0);
  }

  const created = await apiPost("/api/workflows/benchmark-change", cm, body);
  console.log(`\n[create as change_manager] HTTP ${created.status}`);
  if (created.status !== 200) {
    console.log(created.text.slice(0, 500));
    await db.end();
    process.exit(1);
  }
  const instanceId = created.json.instanceId;
  console.log(`instanceId=${instanceId}`);

  // --- Drive: manual_start (ready) → claimNext → succeed → lookup ---
  const actor = { type: "user", id: "e2e:change_manager", sessionId: `e2e-${Date.now()}` };
  const occurredAt = new Date().toISOString();
  const started = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!started) throw new Error("no runnable node after start");
  console.log(`[claim] ${started.state.nodeKey} (${started.state.blockType}) → ${started.state.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: started.state.nodeInstanceId, expectedStatus: "running",
    actor, correlationId: randomUUID(), occurredAt,
  });

  const lookup = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!lookup) throw new Error("no lookup node");
  console.log(`[claim] ${lookup.state.nodeKey} (${lookup.state.blockType}) → ${lookup.state.status}`);
  await engine.executeClientConfigLookup({
    instanceId, nodeInstanceId: lookup.state.nodeInstanceId, commandId: randomUUID(),
    identity: identityContext("change_manager", ["bcm:client:HOR"]),
    actor, correlationId: randomUUID(), occurredAt,
  });
  console.log(`[lookup] portfolio snapshot materialized`);

  // --- form node (human) → claimNext → complete with form data ---
  const form = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!form) throw new Error("no form node");
  console.log(`[claim] ${form.state.nodeKey} (${form.state.blockType}) → ${form.state.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: form.state.nodeInstanceId, expectedStatus: "running",
    actor, correlationId: randomUUID(), occurredAt,
    output: {
      portfolio_id: TEST_PORTFOLIO_ID,
      requested_benchmark_id: SOLL_BENCHMARK,
      effective_date: body.effectiveDate,
      rationale: body.rationale,
    },
    // All four variables are already bound as start variables by the
    // benchmark-change API route (needed for the lookup filter), so the form
    // node must not re-write them (unique constraint on instance+name).
    outputVariables: [],
  });
  console.log(`[form] submitted`);

  // --- approval node (human) → claimNext → createApprovalTask → claim → decide ---
  const approval = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!approval) throw new Error("no approval node");
  console.log(`[claim] ${approval.state.nodeKey} (${approval.state.blockType}) → ${approval.state.status}`);
  const task = await engine.createApprovalTask({
    instanceId, nodeInstanceId: approval.state.nodeInstanceId, commandId: randomUUID(),
    actor, correlationId: randomUUID(), occurredAt,
  });
  console.log(`[approval task created] ${task.task.id} assignee=${task.task.assigneeGroup}`);

  const amIdentity = identityContext("account_manager", ["bcm:client:HOR"]);
  const claimed = await taskService.claim(amIdentity, { taskId: task.task.id, occurredAt });
  if (!claimed.ok) throw new Error(`claim failed: ${claimed.message}`);
  console.log(`[claim task as account_manager] ok`);

  const decision = mode === "reject" ? "rejected" : "approved";
  const decided = await taskService.decideApproval(amIdentity, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision,
    comment: mode === "reject" ? "Afgekeurd door driver test." : "Goedgekeurd door driver test.",
  });
  if (!decided.ok) throw new Error(`decide failed: ${decided.message}`);
  console.log(`[decide ${decision}] ok`);

  // --- change_request node (automated) → claimNext → executeChangeRequest → succeed ---
  const changeNode = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (mode === "approve") {
    if (!changeNode) throw new Error("no change_request node after approval");
    console.log(`[claim] ${changeNode.state.nodeKey} (${changeNode.state.blockType}) → ${changeNode.state.status}`);
    const changeResult = await engine.executeChangeRequest({
      instanceId, nodeInstanceId: changeNode.state.nodeInstanceId, commandId: randomUUID(),
      identity: amIdentity, actor, correlationId: randomUUID(), occurredAt,
    });
    console.log(`[change_request] intent status: ${changeResult.intents?.[0]?.status ?? "see events"}`);
    await engine.execute({
      type: "succeed_node", commandId: randomUUID(), instanceId,
      nodeInstanceId: changeNode.state.nodeInstanceId, expectedStatus: "running",
      actor, correlationId: randomUUID(), occurredAt,
    });
    console.log(`[change_request] applied`);
  } else {
    // rejected: no outgoing 'rejected' edge — instance stays at approval outcome.
    console.log(`[rejected] no apply edge — workflow ends at approval (rejected)`);
  }

  // --- end node (approve path) ---
  if (mode === "approve") {
    const endNode = await engine.claimNext({
      instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
      actor, correlationId: randomUUID(), occurredAt,
    });
    if (endNode) {
      console.log(`[claim] ${endNode.state.nodeKey} (${endNode.state.blockType}) → ${endNode.state.status}`);
      const final = await engine.execute({
        type: "succeed_node", commandId: randomUUID(), instanceId,
        nodeInstanceId: endNode.state.nodeInstanceId, expectedStatus: "running",
        actor, correlationId: randomUUID(), occurredAt,
      });
      console.log(`[end] instance status: ${final.instance.status}`);
    }
  }

  // --- Verify benchmark state (client_config target + legacy portfolios mirror) ---
  const after = await db`
    SELECT pc.benchmark_code FROM client_config.portfolio_configuration pc WHERE pc.primary_account_id = ${TEST_PORTFOLIO_ID}
  `;
  const afterCode = after[0]?.benchmark_code ?? null;
  console.log(`\nPortfolio config HOR-RP benchmark AFTER: ${afterCode}`);

  const legacy = await db`
    SELECT bc.code FROM portfolios p LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id WHERE p.id = ${LEGACY_PORTFOLIO_UUID}
  `;
  console.log(`Legacy portfolios row (${LEGACY_PORTFOLIO_UUID}) benchmark: ${legacy[0]?.code ?? null}`);

  const instance = await db`SELECT status, result FROM workflow_instance WHERE id = ${instanceId}`;
  console.log(`Instance status: ${instance[0]?.status}`);

  await db.end();
  console.log(`\n=== Driver ${mode} done ===`);
}

main().catch((error) => {
  console.error(`\n❌ DRIVER FAILED: ${error.message}`);
  process.exit(1);
});
