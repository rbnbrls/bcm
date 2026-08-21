/**
 * Kanban t_1bcd4e58 — create a SECOND benchmark change request as the change
 * manager AFTER the client-scope mapping fix, to verify the fix live.
 *
 * The first request (WF-2026-5C17266A) was created before the fix and landed
 * on the wrong client (Algemeen Pensioenfonds Bouw) because the workflow
 * client scope "HOR" didn't match legacy clients.id/external_reference and the
 * resolver fell back to the alphabetically-first client. This script creates a
 * fresh request and asserts the tracking change_requests row now lands on
 * Pensioenfonds Horizon (9f9280fc-9572-49d1-b81c-2a039652bc93).
 */
import { createHmac } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const DB_URL = process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm";

const TEST_PORTFOLIO_ID = "HOR*EQACX*EIG";
const TARGET_BENCHMARK = "BLOOMBERG-EU-AGG";
const HOR_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

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

async function main() {
  const startedAtIso = new Date().toISOString();
  console.log(`STARTED_AT_ISO ${startedAtIso}`);

  const db = postgres(DB_URL);
  await db`SELECT 1`;

  const cm = identityToken("change_manager", ["bcm:client:HOR"]);
  const effectiveDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const rationale = `E2E post-fix creation (t_1bcd4e58): verifieer client-scope mapping na fix. Aangevraagd ${startedAtIso}.`;
  const body = {
    clientCode: "HOR",
    primaryAccountId: TEST_PORTFOLIO_ID,
    requestedBenchmarkCode: TARGET_BENCHMARK,
    requestedBy: "Chris Change (E2E t_1bcd4e58)",
    rationale,
    effectiveDate,
  };

  const created = await fetch(`${BASE}/api/workflows/benchmark-change`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${COOKIE}=${cm}` },
    body: JSON.stringify(body),
  });
  const text = await created.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  console.log(`CREATE_HTTP ${created.status}`);
  if (created.status !== 200) {
    console.log(`CREATE_BODY ${text.slice(0, 500)}`);
    await db.end();
    process.exit(1);
  }
  const instanceId = json.instanceId;
  console.log(`INSTANCE_ID ${instanceId}`);
  console.log(`CREATE_MESSAGE ${json.message}`);

  const changeReq = await db`
    SELECT id, reference, client_id, status, submitted_at
    FROM change_requests WHERE workflow_instance_id = ${instanceId}
  `;
  console.log(`CHANGE_REQUEST ${JSON.stringify(changeReq[0] ?? null)}`);

  const client = changeReq[0]?.client_id
    ? await db`SELECT id, name, external_reference FROM clients WHERE id = ${changeReq[0].client_id}`
    : [];
  console.log(`CLIENT ${JSON.stringify(client[0] ?? null)}`);

  const ok = changeReq[0]?.client_id === HOR_CLIENT_ID;
  console.log(`CLIENT_MAPPED_CORRECTLY ${ok ? "true" : "false"}`);
  await db.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
