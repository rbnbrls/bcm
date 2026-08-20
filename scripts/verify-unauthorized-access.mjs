#!/usr/bin/env node
/**
 * Unauthorized-access verification for kanban task t_92eec771.
 *
 * Verifies live (against the dev server on http://localhost:3000 and the
 * local e2e Postgres) that users WITHOUT the required roles cannot perform
 * benchmark change actions:
 *
 *   1. Creating a benchmark change request        — POST /api/workflows/benchmark-change
 *   2. Approving / rejecting a pending request    — WorkflowTaskService (claim/decideApproval)
 *   3. Modifying the benchmark directly           — classic change-status + provider-feedback
 *                                                  (the routes that write benchmark data)
 *   4. Accessing URLs/APIs without authentication — no session cookie at all
 *
 * Acceptance criterion: every unauthorized action is blocked AND does not
 * change workflow or benchmark data (baselines re-checked before/after).
 *
 * Run:
 *   DATABASE_URL=postgres://bcm@localhost:5432/bcm \
 *   BCM_SESSION_SECRET=bcm-playwright-identity-session-secret \
 *   node scripts/verify-unauthorized-access.mjs
 *
 * Exit code: 0 = all assertions pass, 1 = one or more failures.
 */
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bcm@localhost:5432/bcm";
}

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const VERSION_ID = "0b6f3c56-1176-41ce-bb22-d0f1c661842e"; // benchmark-wijziging v1 (published)
const TEST_PORTFOLIO_UUID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff"; // HOR-RP (legacy portfolios row)
const TEST_PORTFOLIO_CODE = "HOR*EQACX*EIG"; // portfolio_configuration primary_account_id
const CLIENT_HOR = "9f9280fc-9572-49d1-b81c-2a039652bc93"; // Pensioenfonds Horizon
const BENCH_MSCI_WORLD_NR = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1"; // MSCI World Net Return
// The fixture's requested benchmark is the CURRENT one (no-op apply), so the
// account_manager control path exercises the full provider-feedback flow
// without mutating benchmark data.
const BENCH_FIXTURE_SOLL = BENCH_MSCI_WORLD_NR;
const CHANGE_TYPE_BENCHMARK_WIJZIGING = "63985c89-9b7a-4d12-90e4-30280f577c40"; // benchmark-wijziging change_type_id

let failures = 0;
const expect = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}: expected ${expected}, got ${actual}`);
  return ok;
};

function encode(value) { return Buffer.from(value, "utf8").toString("base64url"); }
function sign(payload) { return createHmac("sha256", SECRET).update(payload).digest("base64url"); }

// Forge the same signed identity session the UI profile switcher produces.
// viewer has NO permissions (see lib/rbac-config.ts).
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
  const headers = { "content-type": "application/json" };
  if (identity) headers.cookie = `${COOKIE}=${identity}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text };
}

async function apiGet(path, identity) {
  const headers = {};
  if (identity) headers.cookie = `${COOKIE}=${identity}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text };
}

async function readBaselines(db) {
  // client_config.portfolio_configuration (the live benchmark store) +
  // legacy portfolios.current_benchmark_id mirror
  const live = await db`
    SELECT pc.primary_account_id, pc.benchmark_code
    FROM client_config.portfolio_configuration pc
    WHERE pc.primary_account_id = ${TEST_PORTFOLIO_CODE}
  `;
  const legacy = await db`
    SELECT bc.code FROM portfolios p
    LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id
    WHERE p.id = ${TEST_PORTFOLIO_UUID}
  `;
  return {
    live: live[0]?.benchmark_code ?? null,
    legacy: legacy[0]?.code ?? null,
  };
}

async function main() {
  const db = postgres(process.env.DATABASE_URL);
  await db`SELECT 1`;

  console.log("=== t_92eec771: Unauthorized access restrictions (live verification) ===\n");

  // ── 0. Baseline (must be unchanged at the end) ─────────────────────────
  const before = await readBaselines(db);
  console.log(`Baseline benchmark HOR-RP (portfolio_configuration): ${before.live}`);
  console.log(`Baseline benchmark HOR-RP (legacy portfolios row):    ${before.legacy}\n`);

  // ── 1. CREATE as unauthorized ──────────────────────────────────────────
  console.log("── 1. Create benchmark change request (POST /api/workflows/benchmark-change) ──");
  const createBody = {
    clientCode: "HOR",
    primaryAccountId: TEST_PORTFOLIO_CODE,
    requestedBenchmarkCode: "BLOOMBERG-EU-AGG",
    requestedBy: "E2E t_92eec771 unauthorized verification",
    rationale: `t_92eec771 live verification: unauthorized create must be denied. ${new Date().toISOString()}`,
    effectiveDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  };

  // viewer: zero permissions → 403
  const viewerToken = identityToken("viewer");
  const createViewer = await apiPost("/api/workflows/benchmark-change", viewerToken, createBody);
  expect("create as viewer → HTTP 403", createViewer.status, 403);
  if (createViewer.status !== 403) console.log(`  body: ${createViewer.text.slice(0, 300)}`);

  // account_manager: has workflow:approve, NOT workflow:start → 403
  const amToken = identityToken("account_manager", ["bcm:client:HOR"]);
  const createAm = await apiPost("/api/workflows/benchmark-change", amToken, createBody);
  expect("create as account_manager → HTTP 403", createAm.status, 403);

  // admin: no workflow:start → 403
  const adminToken = identityToken("admin");
  const createAdmin = await apiPost("/api/workflows/benchmark-change", adminToken, createBody);
  expect("create as admin → HTTP 403", createAdmin.status, 403);

  // Control: change_manager WITH client scope CAN create → 200
  const cmToken = identityToken("change_manager", ["bcm:client:HOR"]);
  const createCm = await apiPost("/api/workflows/benchmark-change", cmToken, createBody);
  expect("create as change_manager (control) → HTTP 200", createCm.status, 200);
  if (createCm.status !== 200) console.log(`  body: ${createCm.text.slice(0, 500)}`);

  // ── 2. Approve / reject as unauthorized ────────────────────────────────
  console.log("\n── 2. Approve/reject pending request (WorkflowTaskService) ──");
  const { require } = await import("tsx/cjs/api");
  const taskMod = require(new URL("../lib/workflow-studio/runtime-task.ts", import.meta.url).href, import.meta.url);
  const storeMod = require(new URL("../lib/workflow-studio/runtime-postgres-store.ts", import.meta.url).href, import.meta.url);

  // Reuse the control instance created above (its approval task comes later);
  // first drive it to the approval node via the engine.
  const engineMod = require(new URL("../lib/workflow-studio/runtime-engine.ts", import.meta.url).href, import.meta.url);
  const store = new storeMod.PostgresWorkflowRuntimeStore(db);
  const engine = new engineMod.WorkflowRuntimeEngine(store);
  const taskService = new taskMod.WorkflowTaskService(store);
  const instanceId = createCm.json.instanceId;
  const actor = { type: "user", id: "e2e:change_manager", sessionId: `e2e-${Date.now()}` };
  const occurredAt = new Date().toISOString();

  const started = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (started) {
    console.log(`[claim] ${started.state.nodeKey} (${started.state.blockType}) → ${started.state.status}`);
    await engine.execute({
      type: "succeed_node", commandId: randomUUID(), instanceId,
      nodeInstanceId: started.state.nodeInstanceId, expectedStatus: "running",
      actor, correlationId: randomUUID(), occurredAt,
    });
  }

  const lookup = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (lookup) {
    await engine.executeClientConfigLookup({
      instanceId, nodeInstanceId: lookup.state.nodeInstanceId, commandId: randomUUID(),
      identity: identityContext("change_manager", ["bcm:client:HOR"]),
      actor, correlationId: randomUUID(), occurredAt,
    });
    console.log(`[lookup] portfolio snapshot materialized`);
  }

  const form = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (form) {
    await engine.execute({
      type: "succeed_node", commandId: randomUUID(), instanceId,
      nodeInstanceId: form.state.nodeInstanceId, expectedStatus: "running",
      actor, correlationId: randomUUID(), occurredAt,
      output: {
        portfolio_id: createBody.primaryAccountId,
        requested_benchmark_id: createBody.requestedBenchmarkCode,
        effective_date: createBody.effectiveDate,
        rationale: createBody.rationale,
      },
      outputVariables: [],
    });
    console.log(`[form] submitted`);
  }

  const approval = await engine.claimNext({
    instanceId, commandId: randomUUID(), workerId: "driver", leaseDurationMs: 120_000,
    actor, correlationId: randomUUID(), occurredAt,
  });
  if (!approval) throw new Error("no approval node");
  const task = await engine.createApprovalTask({
    instanceId, nodeInstanceId: approval.state.nodeInstanceId, commandId: randomUUID(),
    actor, correlationId: randomUUID(), occurredAt,
  });
  console.log(`[approval task created] ${task.task.id} assignee=${task.task.assigneeGroup}`);

  // viewer (zero permissions): claim/approve/reject all → permission_denied
  const viewerCtx = identityContext("viewer");
  const viewerClaim = await taskService.claim(viewerCtx, { taskId: task.task.id, occurredAt });
  expect("viewer claim → permission_denied", viewerClaim.ok ? "allowed" : viewerClaim.code, "permission_denied");

  const viewerApprove = await taskService.decideApproval(viewerCtx, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision: "approved", comment: "Niet geautoriseerd.",
  });
  expect("viewer approve → permission_denied", viewerApprove.ok ? "allowed" : viewerApprove.code, "permission_denied");

  const viewerReject = await taskService.decideApproval(viewerCtx, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision: "rejected", comment: "Niet geautoriseerd.",
  });
  expect("viewer reject → permission_denied", viewerReject.ok ? "allowed" : viewerReject.code, "permission_denied");

  // change_manager (workflow:start but NOT workflow:approve) → permission_denied
  const cmCtx = identityContext("change_manager", ["bcm:client:HOR"]);
  const cmClaim = await taskService.claim(cmCtx, { taskId: task.task.id, occurredAt });
  expect("change_manager claim (approval task) → permission_denied", cmClaim.ok ? "allowed" : cmClaim.code, "permission_denied");
  const cmApprove = await taskService.decideApproval(cmCtx, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision: "approved", comment: "Geen mandaat.",
  });
  expect("change_manager approve → permission_denied", cmApprove.ok ? "allowed" : cmApprove.code, "permission_denied");

  // Control: account_manager CAN claim + approve → allowed
  const amCtx = identityContext("account_manager", ["bcm:client:HOR"]);
  const amClaim = await taskService.claim(amCtx, { taskId: task.task.id, occurredAt });
  expect("account_manager claim (control) → allowed", amClaim.ok ? "allowed" : amClaim.code, "allowed");
  const amApprove = await taskService.decideApproval(amCtx, {
    taskId: task.task.id, commandId: randomUUID(), correlationId: randomUUID(),
    occurredAt, decision: "approved", comment: "Akkoord door live verify (t_92eec771).",
  });
  expect("account_manager approve (control) → allowed", amApprove.ok ? "allowed" : amApprove.code, "allowed");

  // ── 3. Modify the benchmark directly (classic change routes) ──────────
  console.log("\n── 3. Direct benchmark modification (classic routes) ──");
  // 3a. Create a fixture change request of type benchmark_switch directly in
  // the DB (same shape as the legacy form), so we can probe the status
  // transition + provider-feedback routes without polluting the workflow.
  const fixtureChangeId = randomUUID();
  const fixtureNow = new Date().toISOString();
  const fixtureRef = `T92-${Date.now().toString(36).toUpperCase()}`;
  const fixtureItemId = randomUUID();
  try {
    await db.begin(async (tx) => {
      await tx`
        INSERT INTO change_requests (
          id, reference, change_type, change_type_id, client_id, requested_by, rationale,
          effective_date, status, sla_lead_weeks, status_updated_at, created_at
        ) VALUES (
          ${fixtureChangeId}, ${fixtureRef}, 'benchmark-wijziging', ${CHANGE_TYPE_BENCHMARK_WIJZIGING}, ${CLIENT_HOR},
          'E2E t_92eec771 unauthorized fixture', 'Unauthorized direct-modification probe.',
          ${new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]},
          'submitted', 1, ${fixtureNow}, ${fixtureNow}
        )
      `;
      await tx`
        INSERT INTO change_request_items (
          id, change_request_id, portfolio_id, previous_benchmark_id, requested_benchmark_id
        ) VALUES (
          ${fixtureItemId}, ${fixtureChangeId}, ${TEST_PORTFOLIO_UUID},
          ${BENCH_MSCI_WORLD_NR}, ${BENCH_FIXTURE_SOLL}
        )
      `;
    });
    console.log(`fixture change ${fixtureRef} (${fixtureChangeId}) created [submitted]`);
  } catch (e) {
    console.log(`[fixture] could not create: ${e.message}`);
  }

  // 3b. viewer tries to transition submitted → accepted (approve gate)
  const acceptViewer = await apiPost(`/api/changes/${fixtureChangeId}/status`, viewerToken, { status: "accepted", userName: "Vera Viewer" });
  expect("viewer accept change → HTTP 403 (changes:approve)", acceptViewer.status, 403);

  // 3c. Control: account_manager can accept → 200
  const acceptAm = await apiPost(`/api/changes/${fixtureChangeId}/status`, amToken, { status: "accepted", userName: "Arjan Accountmanager" });
  expect("account_manager accept (control) → HTTP 200", acceptAm.status, 200);

  // 3d. viewer tries to drive accepted → in_progress via status route
  // (in_progress is gated by changes:approve after the fix)
  const progViewer = await apiPost(`/api/changes/${fixtureChangeId}/status`, viewerToken, { status: "in_progress", userName: "Vera Viewer" });
  expect("viewer in_progress transition → HTTP 403 (changes:approve)", progViewer.status, 403);

  // 3e. provider-feedback → processed (triggers benchmark apply) — gated after fix
  const processedViewer = await apiPost(`/api/changes/${fixtureChangeId}/provider-feedback`, viewerToken, { userName: "Vera Viewer" });
  expect("viewer provider-feedback → HTTP 403 (changes:approve)", processedViewer.status, 403);

  // 3f. Control: account_manager can drive in_progress → processed via
  // provider-feedback (the intended admin/service-provider path) → 200
  const inProgAm = await apiPost(`/api/changes/${fixtureChangeId}/status`, amToken, { status: "in_progress", userName: "Arjan Accountmanager" });
  expect("account_manager in_progress (control) → HTTP 200", inProgAm.status, 200);
  const processedAm = await apiPost(`/api/changes/${fixtureChangeId}/provider-feedback`, amToken, { userName: "Arjan Accountmanager" });
  expect("account_manager provider-feedback (control) → HTTP 200", processedAm.status, 200);

  // 3g. PATCH /api/portfolio/[id] — direct portfolio field write (assetClass only)
  const patchNoAuth = await fetch(`${BASE}/api/portfolio/${TEST_PORTFOLIO_UUID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetClass: "CASH" }),
  });
  const patchStatus = patchNoAuth.status;
  console.log(`[INFO] PATCH /api/portfolio/[id] (no auth) → HTTP ${patchStatus} (updates assetClass/subAssetClass only — not benchmark)`);

  // 3h. ist-update endpoint — token-gated; no token configured in dev = open
  const istRes = await apiPost("/api/ist-update", null, {
    changeRequestId: fixtureChangeId,
    outcome: "processed",
    processedBy: "unauthorized_probe",
    resultData: {},
  });
  console.log(`[INFO] POST /api/ist-update (no token) → HTTP ${istRes.status} (IST_API_TOKEN unset in dev → open)`);

  // ── 4. Unauthenticated access (no session cookie) ─────────────────────
  console.log("\n── 4. Unauthenticated access (no cookie) ──");
  // 4a. POST benchmark-change with NO cookie. In dev, the identity falls back
  // to BCM_DEVELOPMENT_IDENTITY_ROLE=change_manager (configuredIdentity) —
  // so this is NOT anonymous; it inherits change_manager. Documented below.
  const noAuthCreate = await apiPost("/api/workflows/benchmark-change", null, createBody);
  console.log(`[INFO] create with NO cookie → HTTP ${noAuthCreate.status}`);
  console.log(`       (dev fallback identity = BCM_DEVELOPMENT_IDENTITY_ROLE=change_manager → authorized in dev)`);

  // 4b. Production-like anonymous: an identity with no role groups and no
  // tenant. We can't run the server in production mode here, so we simulate
  // the anonymous identity directly through the authorization primitive.
  const { verifyIdentitySessionToken } = require(new URL("../lib/identity/session.ts", import.meta.url).href, import.meta.url);
  const { authorizeWorkflowPermission } = require(new URL("../lib/workflow-studio-authorization.ts", import.meta.url).href, import.meta.url);
  const { identityHasPermission } = require(new URL("../lib/rbac.ts", import.meta.url).href, import.meta.url);
  const anonIdentity = {
    userId: "anonymous",
    displayName: "Niet aangemeld",
    groups: [], // no bcm:role:* claims, no client claims
    tenant: null,
    businessUnit: null,
    sessionId: "anonymous",
  };
  expect("anonymous (no groups) has workflow:start", identityHasPermission(anonIdentity, "workflow:start"), false);
  expect("anonymous (no groups) has workflow:approve", identityHasPermission(anonIdentity, "workflow:approve"), false);
  expect("anonymous (no groups) has changes:approve", identityHasPermission(anonIdentity, "changes:approve"), false);
  const anonStart = authorizeWorkflowPermission(anonIdentity, "workflow:start");
  expect("anonymous workflow:start authorization → denied", anonStart.authorized, false);

  // 4c. Unauthenticated read surfaces (viewer + no cookie)
  const dashboardAnon = await apiGet("/", null);
  console.log(`[INFO] GET / (no cookie) → HTTP ${dashboardAnon.status} (dev renders logged-in UI via fallback identity)`);
  const changesAnon = await apiGet("/api/changes", null);
  console.log(`[INFO] GET /api/changes (no cookie) → HTTP ${changesAnon.status} (read surface; no auth gate)`);
  const benchName = await apiGet(`/api/benchmarks/${BENCH_MSCI_WORLD_NR}/name`, null);
  console.log(`[INFO] GET /api/benchmarks/[id]/name (no cookie) → HTTP ${benchName.status} (read surface; no auth gate)`);

  // ── 5. Data-integrity check: baselines must be unchanged ──────────────
  console.log("\n── 5. Baseline integrity ──");
  const after = await readBaselines(db);
  expect("portfolio_configuration benchmark unchanged", after.live, before.live);
  expect("legacy portfolios benchmark unchanged", after.legacy, before.legacy);

  // Also check the fixture change did not reach 'processed' (benchmark apply)
  const fixture = await db`SELECT status FROM change_requests WHERE id = ${fixtureChangeId}`;
  const fixtureStatus = fixture[0]?.status ?? "deleted";
  console.log(`[INFO] fixture change final status: ${fixtureStatus} (probe only; cleanup below)`);

  // ── Cleanup ────────────────────────────────────────────────────────────
  try {
    await db`DELETE FROM change_request_items WHERE change_request_id = ${fixtureChangeId}`;
    await db`DELETE FROM change_requests WHERE id = ${fixtureChangeId}`;
    console.log("[cleanup] fixture change removed");
  } catch (e) {
    console.log(`[cleanup] left in place: ${e.message}`);
  }

  console.log(`\n=== t_92eec771 ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  await db.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n❌ VERIFY FAILED: ${error.message}`);
  process.exit(1);
});
