import { test, expect } from "@playwright/test";
import {
  navigateToGenericChange,
  changeTypeOption,
} from "./helpers";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FUTURE_DATE = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .split("T")[0];

/**
 * Fill the minimum required common fields so the form passes client-side
 * validation and the server action processes the request.
 *
 * Uses `.first()` because some change types (e.g. Tariefwijziging) add a
 * second `textarea[name="rationale"]` via their dynamic fields — the first
 * instance is always the main one in the base form.
 */
async function fillRequiredFields(page: import("@playwright/test").Page) {
  await page.locator('input[name="requestedBy"]').fill("E2E Test User");
  await page.locator('textarea[name="rationale"]').first().fill(
    "E2E automatic test for missing change type config.",
  );
  await page.locator('input[name="effectiveDate"]').fill(FUTURE_DATE);
}

/**
 * Corrupt the hidden `changeTypeSlug` input before form submission so the
 * server action receives a slug that does not match any change type config.
 */
async function setNonExistentSlug(
  page: import("@playwright/test").Page,
  bogusSlug: string,
): Promise<boolean> {
  return page.evaluate((slug) => {
    const input = document.querySelector(
      'input[name="changeTypeSlug"]',
    ) as HTMLInputElement | null;
    if (!input) return false;
    // React-controlled hidden inputs reset their value on re-render, but we
    // need to beat that by setting the DOM property right before submit.
    // Assigning directly to .value works for hidden inputs.
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, slug);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, bogusSlug);
}

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe("Missing change type config — error handling", () => {
  test.describe("Non-existent change type slug", () => {
    test("shows user-friendly error instead of a crash", async ({ page }) => {
      await navigateToGenericChange(page);
      // Fill BEFORE selecting a change type so the base form has the fields
      await fillRequiredFields(page);

      // Simulate a missing config by submitting with a bogus slug
      await setNonExistentSlug(page, "non_existent_type_xyz");

      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      // The form should NOT crash or redirect — it should stay on /changes/new
      // with a user-facing error message
      await expect(page).toHaveURL(/\/changes\/new/);

      // Error container must be visible
      await expect(
        page.locator(".form-errors[role='alert']"),
      ).toBeVisible();

      // Error must mention the slug was not found (Dutch: "bestaat niet")
      await expect(
        page.locator(".form-errors ul li"),
      ).toContainText("bestaat niet");
    });

    test("includes the specific slug name in the error message", async ({
      page,
    }) => {
      await navigateToGenericChange(page);
      await fillRequiredFields(page);

      const bogusSlug = "does_not_exist_test";
      await setNonExistentSlug(page, bogusSlug);

      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      // The error should reference the submitted slug value
      await expect(page.locator(".form-errors ul li")).toContainText(
        bogusSlug,
      );
    });

    test("error container has correct structure (heading + list)", async ({
      page,
    }) => {
      await navigateToGenericChange(page);
      await fillRequiredFields(page);

      await setNonExistentSlug(page, "bogus_slug_abc123");

      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      // Has a heading
      await expect(
        page.locator(".form-errors[role='alert'] b"),
      ).toContainText("Controleer de aanvraag");

      // Has a list with at least one item
      const listItems = await page
        .locator(".form-errors[role='alert'] ul li")
        .all();
      expect(listItems.length).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe("Error resilience — default change type", () => {
    // Parameterised test: check that every known change type gracefully handles
    // a missing config error. We DON'T actually select the type from the
    // dropdown — React reconciliation can remount textareas and lose filled
    // values. Instead we rely on the default type (benchmark_switch) and
    // just corrupt the hidden slug to include each type's name, verifying the
    // error display works regardless.
    const KNOWN_SLUGS = [
      "benchmark_switch",
      "new_benchmark",
      "fee_change",
      "mandate_change",
      "custodian_change",
      "rebalance_trigger",
      "customer_onboarding",
      "portfolio_addition",
    ];

    for (const slug of KNOWN_SLUGS) {
      test(`missing config for "${slug}" shows user-friendly error`, async ({
        page,
      }) => {
        await navigateToGenericChange(page);
        await fillRequiredFields(page);

        // Submit with a corrupted slug
        await setNonExistentSlug(page, `${slug}_missing`);

        await page
          .locator("form.change-form button[type='submit']")
          .click();
        await page.waitForLoadState("networkidle");

        // Must not crash — must show error
        await expect(
          page.locator(".form-errors[role='alert']"),
        ).toBeVisible({ timeout: 10000 });

        // Error message is Dutch and about config not found
        await expect(
          page.locator(".form-errors ul li"),
        ).toContainText("bestaat niet");
      });
    }
  });

  test.describe("Graceful fallback — no raw crashes", () => {
    test("submitting empty slug does not crash", async ({ page }) => {
      await navigateToGenericChange(page);
      await fillRequiredFields(page);

      // Set empty slug
      await setNonExistentSlug(page, "");

      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      // Should show error, not crash
      await expect(
        page.locator(".form-errors[role='alert']"),
      ).toBeVisible({ timeout: 10000 });

      // Empty slug triggers a different Dutch message
      await expect(
        page.locator(".form-errors ul li"),
      ).toContainText("niet geselecteerd");
    });

    test("multiple submissions with errors do not break the form", async ({
      page,
    }) => {
      await navigateToGenericChange(page);
      await fillRequiredFields(page);

      // First submission: bogus slug
      await setNonExistentSlug(page, "first_bogus");
      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");
      await expect(
        page.locator(".form-errors[role='alert']"),
      ).toBeVisible();

      // After the first error, React re-renders and restores the controlled
      // hidden input to `selectedType` (the default type). On the second
      // submission the form action receives the valid default slug and may
      // either succeed or produce a different DB-level error, but the form
      // should NOT crash and the error display should still be functional.
      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      // Either the form recovered (no error, possibly redirected) or a
      // different error is shown — in neither case should the page crash
      const urlChanged = !page.url().includes("/changes/new");
      if (urlChanged) {
        await expect(page).toHaveURL(/\/changes\/[0-9a-f-]+/);
        await expect(page.locator(".eyebrow")).toContainText("BCM-");
      } else {
        // Still on the form — verify error display structure still works
        const errorVisible = await page
          .locator(".form-errors[role='alert']")
          .isVisible()
          .catch(() => false);
        if (errorVisible) {
          const items = await page
            .locator(".form-errors ul li")
            .allTextContents();
          expect(items.length).toBeGreaterThanOrEqual(1);
          // Confirm the heading is still rendered properly
          await expect(
            page.locator(".form-errors[role='alert'] b"),
          ).toContainText("Controleer de aanvraag");
        }
      }
    });
  });
});
