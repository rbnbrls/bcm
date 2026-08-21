/**
 * Kanban t_1bcd4e58 — evidence screenshots.
 *
 * Captures the benchmark change creation screen (change manager), the created
 * request detail (target value + pending state), the request list for client
 * HOR, and the workflow instance detail. Forges e2e identity cookies like the
 * driver scripts (local-only secret, rejected in production).
 */
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const OUT_DIR = process.env.SHOT_DIR ?? "/home/hermes/code/bcm/documentation/development/evidence/t_1bcd4e58";

const CHANGE_REQUEST_ID = process.env.CHANGE_REQUEST_ID ?? "1a8fbb78-cf62-4ebb-9d45-dea6762531a5";
const INSTANCE_ID = process.env.INSTANCE_ID ?? "6acf1914-efa7-42b6-a5c1-7a80f0b6a160";

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

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();

async function shot(path, role, groups, waitForText, name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const p = await ctx.newPage();
  await p.context().addCookies([
    { name: COOKIE, value: identityToken(role, groups), url: BASE },
  ]);
  const resp = await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const status = resp?.status() ?? 0;
  if (waitForText) {
    try { await p.waitForSelector(`text=${waitForText}`, { timeout: 8000 }); } catch {}
  }
  await p.waitForTimeout(600);
  const file = `${OUT_DIR}/${name}.png`;
  await p.screenshot({ path: file, fullPage: true });
  const h1 = await p.locator("h1").first().textContent().catch(() => "");
  const bodyText = (await p.locator("body").innerText().catch(() => "")).slice(0, 350).replace(/\n+/g, " | ");
  console.log(`SHOT ${path} [${role}] HTTP ${status} h1="${h1}" -> ${name}.png`);
  console.log(`  body: ${bodyText}`);
  await ctx.close();
}

// 1. Creation screen (start form) as change manager — shows the form fields.
await shot("/change-catalog/benchmark-wijziging/start", "change_manager", ["bcm:client:HOR"], "Portefeuille", "01_create_screen_start_form");

// 2. Created request detail — reference, target benchmark value, status (Ingediend = pending), next action panel.
await shot(`/changes/${CHANGE_REQUEST_ID}`, "change_manager", ["bcm:client:HOR"], "Benchmarkwissel", "02_request_detail_pending");

// 3. Request list for client HOR (external reference PF-HOR-001) — the new WF-2026-1A8FBB78 request with status pill.
await shot("/changes/history/PF-HOR-001", "change_manager", ["bcm:client:HOR"], "WF-2026-1A8FBB78", "03_request_list_pending");

// 4. Workflow instance detail — instance status running (awaiting approval).
await shot(`/workflow-runtime/${INSTANCE_ID}`, "change_manager", ["bcm:client:HOR"], "Workflowinstance", "04_instance_detail_running");

// 5. Tasks queue as account manager — the pending approval task (visible to the approver).
await shot("/tasks", "account_manager", ["bcm:client:HOR"], "Goedkeuring door Account Manager", "05_tasks_queue_approval_task");

await browser.close();
console.log("DONE");
