/**
 * Deploy smoke test for UnrecognizedActionError regression.
 *
 * This test runs against the PRODUCTION build (not dev mode) to catch
 * server-action ID mismatches that only occur in production (dev mode
 * generates IDs without the encryption-key salt). The target is taken
 * from TARGET_URL (set by scripts/smoke-test-server-actions.sh), falling
 * back to the local dev server.
 *
 * /admin/* is gated by the identity-session RBAC (proxy.ts,
 * lib/identity/request.ts): the page only renders when the request carries a
 * `bcm_identity_session` cookie signed with the production
 * BCM_SESSION_SECRET and holding the admin group. The smoke test therefore
 * sets that cookie before navigating (via tests/e2e/identity-session.ts; the
 * Basic Auth httpCredentials mechanism that this spec used before f4a0dda no
 * longer gates /admin/*). When run against a production target, the secret
 * must be provided as BCM_SESSION_SECRET (deploy.yml injects it from the
 * Actions secret) — the committed e2e fallback is rejected in production.
 *
 * It loads /admin/client-config (the page that uses server actions for
 * both the edit form and the active toggle), then:
 *   1. Monitors the browser console for UnrecognizedActionError
 *   2. Interacts with a server-action-backed form (Opslaan/save)
 *   3. Verifies no server-action errors occurred during the session
 *
 * Usage:
 *   # Build first
 *   NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32) npm run build
 *   # Start server in background, run test, kill server
 *   node scripts/startup.mjs &
 *   npx playwright test --grep "server-action smoke"
 *   kill %1
 *
 * Or run the smoke script directly:
 *   ./scripts/smoke-test-server-actions.sh
 */

import { test, expect } from "@playwright/test";
import { identitySessionCookie } from "./identity-session";
import type { Page, ConsoleMessage } from "@playwright/test";

/** Target deployment; defaults to the local dev server (playwright webServer). */
const TARGET_URL = process.env.TARGET_URL ?? "http://localhost:3000";

/**
 * Collects console errors during a page session, filtering for
 * UnrecognizedActionError specifically.
 */
async function collectActionErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        text.includes("UnrecognizedActionError") ||
        text.includes("Unrecognized Server Action") ||
        text.includes("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY")
      ) {
        errors.push(`[${msg.type()}] ${text}`);
      }
    }
  });
  page.on("pageerror", (err: Error) => {
    const text = err.message;
    if (
      text.includes("UnrecognizedActionError") ||
      text.includes("action not found") ||
      text.includes("server action")
    ) {
      errors.push(`[pageerror] ${text}`);
    }
  });
  return errors;
}

test.describe("server-action smoke", () => {
  test.beforeEach(async ({ page }) => {
    // /admin/* requires a signed identity with the admin group.
    await page.context().addCookies([
      { ...identitySessionCookie("admin"), url: TARGET_URL },
    ]);
  });

  test("load /admin/client-config without UnrecognizedActionError", async ({ page }) => {
    const actionErrors = await collectActionErrors(page);

    // Navigate to the client-config admin page
    await page.goto(`${TARGET_URL}/admin/client-config`, {
      waitUntil: "networkidle",
    });

    // Verify the page actually rendered
    await expect(page.locator(".eyebrow")).toContainText(
      "ADMIN · CHANGE CATALOGUS",
    );

    // Wait a moment for any lazy-loaded chunks to arrive
    await page.waitForTimeout(1000);

    // Collect any page errors triggered by initial render
    expect(
      actionErrors,
      `UnrecognizedActionError on page load:\n${actionErrors.join("\n")}`,
    ).toHaveLength(0);

    // If there is a table with editable rows, attempt an edit interaction
    // to exercise the server action submission path.
    const row = page.locator("table.config-table tbody tr").first();
    if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Click the "Opslaan" (save) button on the first row to trigger
      // the updateChangeTypeAdmin server action
      const saveButton = row.getByRole("button", { name: "Opslaan" });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        // Wait for the server action response / page update
        await page.waitForTimeout(2000);
      }
    }

    // Final assertion: no server-action errors during the session
    expect(
      actionErrors,
      `UnrecognizedActionError after interaction:\n${actionErrors.join("\n")}`,
    ).toHaveLength(0);
  });

  test("load /changes (server-action-heavy page) without errors", async ({ page }) => {
    const actionErrors = await collectActionErrors(page);

    await page.goto(`${TARGET_URL}/changes`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    expect(
      actionErrors,
      `Server action errors on /changes:\n${actionErrors.join("\n")}`,
    ).toHaveLength(0);
  });
});
