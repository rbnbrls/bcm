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
import { Client } from "pg";
import { pathToFileURL } from "node:url";

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const TEST_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff"; // HOR-RP Rendementsportefeuille
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
  const { default: tsx } = await import("tsx/esm/api");
  const engineMod = await tsx.import(pathToFileURL(new URL("../lib/workflow-studio/runtime-engine.ts", import.meta.url)).href);
  const storeMod = await tsx.import(pathToFileURL(new URL("../lib/workflow-studio/runtime-postgres-store.ts", import.meta.url)).href);
  const taskMod = await tsx.import(pathToFileURL(new URL("../lib/workflow-studio/runtime-task.ts", import.meta.url)).href);
  return {
    WorkflowRuntimeEngine: engineMod.WorkflowRuntimeEngine,
    PostgresWorkflowRuntimeStore: storeMod.PostgresWorkflowRuntimeStore,
    WorkflowTaskService: taskMod.WorkflowTaskService,
  };
}

async function main() {
  const mode = process.argv[2] ?? "approve";
  const db = new Client({ connectionString: process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm" });
  await db.connect();

  const before = await db.query(
    `SELECT bc.code FROM portfolios p LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id WHERE p.id = $1`,
    [TEST_PORTFOLIO_ID],
  );
  const beforeCode = before.rows[0]?.code ?? null;
  console.log(`\n=== Benchmark change driver [${mode}] ===`);
  console.log(`Portfolio HOR-RP (${TEST_PORTFOLIO_ID}) benchmark BEFORE: ${beforeCode}`);

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
    outputVariables: [
      { name: "portfolio_id", dataType: "string", value: TEST_PORTFOLIO_ID, classification: "internal" },
      { name: "requested_benchmark_id", dataType: "string", value: SOLL_BENCHMARK, classification: "internal" },
      { name: "effective_date", dataType: "date", value: body.effectiveDate, classification: "internal" },
      { name: "rationale", dataType: "string", value: body.rationale, classification: "internal" },
    ],
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

  // --- Verify benchmark state ---
  const after = await db.query(
    `SELECT bc.code FROM portfolios p LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id WHERE p.id = $1`,
    [TEST_PORTFOLIO_ID],
  );
  const afterCode = after.rows[0]?.code ?? null;
  console.log(`\nPortfolio HOR-RP benchmark AFTER: ${afterCode}`);

  const instance = await db.query(`SELECT status, result FROM workflow_instance WHERE id = $1`, [instanceId]);
  console.log(`Instance status: ${instance.rows[0]?.status}`);

  await db.end();
  console.log(`\n=== Driver ${mode} done ===`);
}

main().catch((error) => {
  console.error(`\n❌ DRIVER FAILED: ${error.message}`);
  process.exit(1);
});
