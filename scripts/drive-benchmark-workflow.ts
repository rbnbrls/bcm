/**
 * Benchmark change workflow — environment driver (test environment only).
 *
 * Drives a benchmark-wijziging instance through the full runtime chain
 * against the LOCAL dev database (postgres://bcm@localhost:5432/bcm) and
 * dev server (http://localhost:3000). Use after `npm run dev` with the
 * feature flags from documentation/development/benchmark-change-test-environment.md.
 *
 * Modes:
 *   npx tsx scripts/drive-benchmark-workflow.ts approve   — happy path
 *   npx tsx scripts/drive-benchmark-workflow.ts reject    — rejection path
 *   npx tsx scripts/drive-benchmark-workflow.ts authz     — unauthorized matrix
 *
 * The script forges the same signed identity sessions as tests/e2e
 * (BCM_SESSION_SECRET=bcm-playwright-identity-session-secret) and drives
 * the engine through its public API (claimNext / execute / executeLookup /
 * executeChangeRequest / createApprovalTask / completeApprovalTask via the
 * WorkflowTaskService). It reports the benchmark before/after.
 */
import { createHmac, randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { WorkflowRuntimeEngine, type WorkflowRuntimeNodeRecord } from "@/lib/workflow-studio/runtime-engine";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";
import { WorkflowTaskService } from "@/lib/workflow-studio/runtime-task";
import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowRuntimeActor } from "@/lib/workflow-studio/runtime-state-machine";

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const TEST_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff"; // HOR-RP Rendementsportefeuille
const SOLL_BENCHMARK = "BLOOMBERG-EU-AGG"; // switch from MSCI-WORLD-NR

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function identityToken(role: string, groups: string[] = []): string {
  const names: Record<string, string> = {
    change_manager: "Chris Change",
    account_manager: "Arjan Accountmanager",
    admin: "Bert Beheerder",
    viewer: "Vera Viewer",
  };
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

function identityContext(role: string, groups: string[] = []): IdentityContext {
  return {
    userId: `e2e:${role}`,
    displayName: role,
    groups: [`bcm:role:${role}`, ...groups],
    tenant: "e2e",
    businessUnit: "e2e",
    sessionId: `e2e-${role}-${Date.now()}`,
  };
}

async function apiPost(path: string, identity: string, body: unknown): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE}=${identity}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text };
}

async function runAuthzMatrix(
  db: NonNullable<typeof sql>,
  engine: WorkflowRuntimeEngine,
  taskService: WorkflowTaskService,
  body: Record<string, string>,
): Promise<void> {
  console.log("\n=== Unauthorized matrix ===");
  let failures = 0;
  const expect = (label: string, actual: unknown, expected: unknown): boolean => {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`[${ok ? "PASS" : "FAIL"}] ${label}: expected ${expected}, got ${actual}`);
    return ok;
  };
  const nodeState = (claimed: { state: unknown }): WorkflowRuntimeNodeRecord => {
    const state = claimed.state;
    if (!state || typeof state !== "object" || (state as { kind?: string }).kind !== "node") {
      throw new Error(`expected node state, got ${(state as { kind?: string } | null)?.kind ?? "none"}`);
    }
    return state as WorkflowRuntimeNodeRecord;
  };

  // 1. HTTP create denials (no workflow:start → 403 before validation/scope)
  const viewer = identityToken("viewer");
  const am = identityToken("account_manager", ["bcm:client:HOR"]);
  const admin = identityToken("admin");

  for (const [role, token] of [["viewer", viewer], ["account_manager", am], ["admin", admin]] as const) {
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
  const instanceId: string = created.json.instanceId;
  console.log(`instanceId=${instanceId}`);

  // 3. Drive the instance to the approval node and create the approval task
  const actor: WorkflowRuntimeActor = { type: "user", id: "e2e:change_manager", sessionId: `e2e-${Date.now()}` };
  const occurredAt = new Date().toISOString();

  const started = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!started) throw new Error("no runnable node after start");
  const startNode = nodeState(started);
  console.log(`[claim] ${startNode.nodeKey} (${startNode.blockType}) → ${startNode.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: startNode.nodeInstanceId, expectedStatus: "running",
    actor, correlationId: randomUUID(), occurredAt,
  } as any);

  const lookup = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!lookup) throw new Error("no lookup node");
  const lookupNode = nodeState(lookup);
  console.log(`[claim] ${lookupNode.nodeKey} (${lookupNode.blockType}) → ${lookupNode.status}`);
  await engine.executeClientConfigLookup({
    instanceId, nodeInstanceId: lookupNode.nodeInstanceId, commandId: randomUUID(),
    identity: identityContext("change_manager", ["bcm:client:HOR"]),
    actor, correlationId: randomUUID(), occurredAt,
  });

  const form = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!form) throw new Error("no form node");
  const formNode = nodeState(form);
  console.log(`[claim] ${formNode.nodeKey} (${formNode.blockType}) → ${formNode.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: formNode.nodeInstanceId, expectedStatus: "running",
    actor, correlationId: randomUUID(), occurredAt,
    output: {
      portfolio_id: body.primaryAccountId,
      requested_benchmark_id: body.requestedBenchmarkCode,
      effective_date: body.effectiveDate,
      rationale: body.rationale,
    },
    outputVariables: [
      { name: "portfolio_id", dataType: "string", value: body.primaryAccountId, classification: "internal" },
      { name: "requested_benchmark_id", dataType: "string", value: body.requestedBenchmarkCode, classification: "internal" },
      { name: "effective_date", dataType: "date", value: body.effectiveDate, classification: "internal" },
      { name: "rationale", dataType: "string", value: body.rationale, classification: "internal" },
    ],
  } as any);

  const approval = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!approval) throw new Error("no approval node");
  const approvalNode = nodeState(approval);
  console.log(`[claim] ${approvalNode.nodeKey} (${approvalNode.blockType}) → ${approvalNode.status}`);
  const task = await engine.createApprovalTask({
    instanceId, nodeInstanceId: approvalNode.nodeInstanceId, commandId: randomUUID(),
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

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "approve";
  if (!sql) {
    console.error("DATABASE_URL not configured — cannot connect.");
    process.exit(1);
  }
  const db = sql;

  const nodeState = (claimed: { state: unknown }): WorkflowRuntimeNodeRecord => {
    const state = claimed.state;
    if (!state || typeof state !== "object" || (state as { kind?: string }).kind !== "node") {
      throw new Error(`expected node state, got ${(state as { kind?: string } | null)?.kind ?? "none"}`);
    }
    return state as WorkflowRuntimeNodeRecord;
  };

  const before = await db`
    SELECT bc.code FROM portfolios p LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id WHERE p.id = ${TEST_PORTFOLIO_ID}
  `;
  const beforeCode = before[0]?.code ?? null;
  console.log(`\n=== Benchmark change driver [${mode}] ===`);
  console.log(`Portfolio HOR-RP (${TEST_PORTFOLIO_ID}) benchmark BEFORE: ${beforeCode}`);

  const store = new PostgresWorkflowRuntimeStore(db as any);
  const engine = new WorkflowRuntimeEngine(store);
  const taskService = new WorkflowTaskService(store);

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
  const instanceId: string = created.json.instanceId;
  console.log(`instanceId=${instanceId}`);

  const actor: WorkflowRuntimeActor = { type: "user", id: "e2e:change_manager", sessionId: `e2e-${Date.now()}` };
  const occurredAt = new Date().toISOString();

  // 1. manual_start (ready) → claimNext → succeed → lookup activated
  const started = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!started) throw new Error("no runnable node after start");
  const startNode = nodeState(started);
  console.log(`[claim] ${startNode.nodeKey} (${startNode.blockType}) → ${startNode.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: startNode.nodeInstanceId, expectedStatus: "running",
    actor, correlationId: randomUUID(), occurredAt,
  } as any);

  // 2. client_config_lookup → claimNext → executeClientConfigLookup
  const lookup = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!lookup) throw new Error("no lookup node");
  const lookupNode = nodeState(lookup);
  console.log(`[claim] ${lookupNode.nodeKey} (${lookupNode.blockType}) → ${lookupNode.status}`);
  await engine.executeClientConfigLookup({
    instanceId, nodeInstanceId: lookupNode.nodeInstanceId, commandId: randomUUID(),
    identity: identityContext("change_manager", ["bcm:client:HOR"]),
    actor, correlationId: randomUUID(), occurredAt,
  });
  console.log(`[lookup] portfolio snapshot materialized`);

  // 3. form (human) → claimNext → succeed with form data
  const form = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!form) throw new Error("no form node");
  const formNode = nodeState(form);
  console.log(`[claim] ${formNode.nodeKey} (${formNode.blockType}) → ${formNode.status}`);
  await engine.execute({
    type: "succeed_node", commandId: randomUUID(), instanceId,
    nodeInstanceId: formNode.nodeInstanceId, expectedStatus: "running",
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
  } as any);
  console.log(`[form] submitted`);

  // 4. approval (human) → claimNext → createApprovalTask → claim → decide
  const approval = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!approval) throw new Error("no approval node");
  const approvalNode = nodeState(approval);
  console.log(`[claim] ${approvalNode.nodeKey} (${approvalNode.blockType}) → ${approvalNode.status}`);
  const task = await engine.createApprovalTask({
    instanceId, nodeInstanceId: approvalNode.nodeInstanceId, commandId: randomUUID(),
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

  // 5. change_request (automated) on approval path
  const changeNode = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (mode === "approve") {
    if (!changeNode) throw new Error("no change_request node after approval");
    const changeNodeState = nodeState(changeNode);
    console.log(`[claim] ${changeNodeState.nodeKey} (${changeNodeState.blockType}) → ${changeNodeState.status}`);
    const changeResult = await engine.executeChangeRequest({
      instanceId, nodeInstanceId: changeNodeState.nodeInstanceId, commandId: randomUUID(),
      identity: amIdentity, actor, correlationId: randomUUID(), occurredAt,
    });
    console.log(`[change_request] events: ${changeResult.events.map((e) => e.eventType).join(", ")}`);
    await engine.execute({
      type: "succeed_node", commandId: randomUUID(), instanceId,
      nodeInstanceId: changeNodeState.nodeInstanceId, expectedStatus: "running",
      actor, correlationId: randomUUID(), occurredAt,
    } as any);
    console.log(`[change_request] applied`);

    // 6. end
    const endNode = await engine.claimNext({
      instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
      actor, correlationId: randomUUID(), occurredAt,
    });
    if (endNode) {
      const endNodeState = nodeState(endNode);
      console.log(`[claim] ${endNodeState.nodeKey} (${endNodeState.blockType}) → ${endNodeState.status}`);
      const final = await engine.execute({
        type: "succeed_node", commandId: randomUUID(), instanceId,
        nodeInstanceId: endNodeState.nodeInstanceId, expectedStatus: "running",
        actor, correlationId: randomUUID(), occurredAt,
      } as any);
      console.log(`[end] instance status: ${final.instance.status}`);
    }
  } else {
    console.log(`[rejected] no outgoing 'rejected' edge — workflow ends at approval (rejected)`);
  }

  const after = await db`
    SELECT bc.code FROM portfolios p LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id WHERE p.id = ${TEST_PORTFOLIO_ID}
  `;
  const afterCode = after[0]?.code ?? null;
  console.log(`\nPortfolio HOR-RP benchmark AFTER: ${afterCode}`);

  const instance = await db`SELECT status, result FROM workflow_instance WHERE id = ${instanceId}`;
  console.log(`Instance status: ${instance[0]?.status}`);

  await db.end();
  console.log(`\n=== Driver ${mode} done ===`);
}

main().catch((error) => {
  console.error(`\n❌ DRIVER FAILED: ${error.message}`);
  process.exit(1);
});
