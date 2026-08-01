/**
 * Deploy smoke test for UnrecognizedActionError regression.
 *
 * This test runs against the PRODUCTION build (not dev mode) to catch
 * server-action ID mismatches that only occur in production (dev mode
 * generates IDs without the encryption-key salt).
 *
 * It loads /admin/change-types (the page that uses server actions for
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
import type { Page, ConsoleMessage } from "@playwright/test";

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
  test("load /admin/change-types without UnrecognizedActionError", async ({ page }) => {
    const actionErrors = await collectActionErrors(page);

    // Navigate to the change-types admin page
    await page.goto("/admin/change-types", {
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

    await page.goto("/changes", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    expect(
      actionErrors,
      `Server action errors on /changes:\n${actionErrors.join("\n")}`,
    ).toHaveLength(0);
  });
});