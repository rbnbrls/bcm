/**
 * Kanban t_1bcd4e58 — create a benchmark change request as the change manager.
 *
 * Forges the e2e change_manager session (BCM_SESSION_SECRET local-only secret,
 * rejected in production) and POSTs to /api/workflows/benchmark-change for the
 * prepared test portfolio HOR-RP (HOR*EQACX*EIG), requesting a switch from
 * MSCI-WORLD-NR to BLOOMBERG-EU-AGG. Then verifies, directly in the local e2e
 * DB, that:
 *   - a change_requests row exists (status 'submitted' == Pending),
 *   - the workflow instance is running (awaiting approval),
 *   - the requested benchmark value is stored (fields.sollValue),
 * and prints a machine-readable summary for evidence recording.
 */
import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const DB_URL = process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm";

// HOR-RP = Pensioenfonds Horizon Rendementsportefeuille.
const TEST_PORTFOLIO_ID = "HOR*EQACX*EIG"; // client_config.portfolio_configuration.primary_account_id
const LEGACY_PORTFOLIO_UUID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff";
const CURRENT_BENCHMARK = "MSCI-WORLD-NR";
const TARGET_BENCHMARK = process.env.TARGET_BENCHMARK ?? "BLOOMBERG-EU-AGG";

function encode(value) { return Buffer.from(value, "utf8").toString("base64url"); }
function sign(payload) { return createHmac("sha256", SECRET).update(payload).digest("base64url"); }

function identityToken(role, groups = []) {
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
  const startedAtIso = new Date().toISOString();
  const startedAtLocal = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
  console.log(`STARTED_AT_ISO ${startedAtIso}`);
  console.log(`STARTED_AT_LOCAL ${startedAtLocal}`);

  const db = postgres(DB_URL);
  await db`SELECT 1`;

  // Baseline check: current benchmark must still be MSCI-WORLD-NR.
  const before = await db`
    SELECT benchmark_code FROM client_config.portfolio_configuration
    WHERE primary_account_id = ${TEST_PORTFOLIO_ID}
  `;
  const beforeCode = before[0]?.benchmark_code ?? null;
  console.log(`BASELINE_BENCHMARK ${beforeCode}`);
  if (beforeCode !== CURRENT_BENCHMARK) {
    console.error(`ABORT baseline is ${beforeCode}, expected ${CURRENT_BENCHMARK} — a previous test may not have restored it.`);
    await db.end();
    process.exit(2);
  }

  // Catalog sanity: target benchmark exists.
  const target = await db`
    SELECT id, code, name FROM benchmark_catalog WHERE code = ${TARGET_BENCHMARK}
  `;
  console.log(`TARGET_CATALOG ${JSON.stringify(target[0] ?? null)}`);
  if (target.length === 0) {
    console.error(`ABORT target benchmark ${TARGET_BENCHMARK} not in benchmark_catalog`);
    await db.end();
    process.exit(2);
  }

  // --- 1. Create the request as change manager (client scope HOR) ---
  const cm = identityToken("change_manager", ["bcm:client:HOR"]);
  const effectiveDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const rationale = `E2E happy-path creation (t_1bcd4e58): benchmark HOR-RP wijzigen van MSCI World Net Return naar Bloomberg Euro Aggregate. Aangevraagd ${startedAtIso}.`;
  const body = {
    clientCode: "HOR",
    primaryAccountId: TEST_PORTFOLIO_ID,
    requestedBenchmarkCode: TARGET_BENCHMARK,
    requestedBy: "Chris Change (E2E t_1bcd4e58)",
    rationale,
    effectiveDate,
  };

  const submittedAtIso = new Date().toISOString();
  const created = await apiPost("/api/workflows/benchmark-change", cm, body);
  const respondedAtIso = new Date().toISOString();
  console.log(`CREATE_HTTP ${created.status}`);
  console.log(`CREATE_SUBMITTED_AT_ISO ${submittedAtIso}`);
  console.log(`CREATE_RESPONDED_AT_ISO ${respondedAtIso}`);
  if (created.status !== 200) {
    console.log(`CREATE_BODY ${created.text.slice(0, 800)}`);
    await db.end();
    process.exit(1);
  }
  const instanceId = created.json.instanceId;
  console.log(`INSTANCE_ID ${instanceId}`);
  console.log(`CREATE_MESSAGE ${created.json.message}`);

  // --- 2. Verify DB state ---
  const instance = await db`
    SELECT id, status, workflow_version_id, started_by_user_id, started_at
    FROM workflow_instance WHERE id = ${instanceId}
  `;
  console.log(`INSTANCE_ROW ${JSON.stringify(instance[0] ?? null)}`);

  const changeReq = await db`
    SELECT id, reference, change_type, status, requested_by, rationale, effective_date,
           fields, workflow_instance_id, submitted_at, created_at
    FROM change_requests WHERE workflow_instance_id = ${instanceId}
  `;
  console.log(`CHANGE_REQUEST ${JSON.stringify(changeReq[0] ?? null, null, 1)}`);

  const variables = await db`
    SELECT name, data_type, value, classification FROM workflow_variable
    WHERE workflow_instance_id = ${instanceId}
    ORDER BY name
  `;
  console.log(`INSTANCE_VARIABLES ${JSON.stringify(variables)}`);

  const audit = await db`
    SELECT id, change_request_id, action, actor, previous_status, new_status, created_at
    FROM audit_log WHERE change_request_id = ${changeReq[0]?.id}
    ORDER BY created_at
  `;
  console.log(`AUDIT_LOG ${JSON.stringify(audit)}`);

  await db.end();

  // --- 3. Summary for evidence ---
  const cr = changeReq[0];
  const fields = typeof cr?.fields === "string" ? JSON.parse(cr.fields) : cr?.fields ?? [];
  const targetStored = Array.isArray(fields)
    && fields.some((f) => f.fieldKey === "requested_benchmark_id" && f.sollValue === TARGET_BENCHMARK);
  const ok =
    created.status === 200 &&
    instance[0]?.status === "running" &&
    cr?.status === "submitted" &&
    targetStored;
  console.log(`VERIFY_OK ${ok ? "true" : "false"}`);
  console.log(`REQUEST_REFERENCE ${cr?.reference ?? "N/A"}`);
  console.log(`REQUEST_STATUS ${cr?.status ?? "N/A"}`);
  console.log(`REQUEST_TARGET ${TARGET_BENCHMARK}`);
  console.log(`TARGET_STORED ${targetStored}`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n❌ CREATE FAILED: ${error.message}`);
  process.exit(1);
});
