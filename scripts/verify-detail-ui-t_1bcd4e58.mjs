/**
 * Kanban t_1bcd4e58 — verify the change request detail UI shows the target
 * benchmark value + pending state. Prints the visible page text for evidence.
 */
import { createHmac } from "node:crypto";
import { chromium } from "playwright";

const BASE = process.env.BCM_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";
const COOKIE = "bcm_identity_session";
const CHANGE_REQUEST_ID = process.env.CHANGE_REQUEST_ID ?? "1a8fbb78-cf62-4ebb-9d45-dea6762531a5";

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const p = await ctx.newPage();
await p.context().addCookies([
  { name: COOKIE, value: identityToken("change_manager", ["bcm:client:HOR"]), url: BASE },
]);
await p.goto(`${BASE}/changes/${CHANGE_REQUEST_ID}`, { waitUntil: "networkidle" });
await p.waitForTimeout(500);
const body = await p.locator("body").innerText();
console.log(body);
await browser.close();
