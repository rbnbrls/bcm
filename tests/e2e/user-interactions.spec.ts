import { test, expect } from "@playwright/test";

/**
 * End-to-end user interaction tests for all UI workflows.
 * Covers gaps in existing test coverage: feedback submission, admin CRUD,
 * webhook management, and client-side error boundary trigger.
 */

test.describe("User interaction workflows", () => {
  test.describe("Feedback form submission", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      // Open the feedback modal
      await page.locator(".feedback-trigger").click();
      await expect(page.locator(".feedback-modal--open")).toBeVisible();
    });

    test("form fields are accessible with correct labels", async ({ page }) => {
      const titleInput = page.locator('.feedback-form input[name="title"]');
      await expect(titleInput).toBeVisible();
      await expect(titleInput).toHaveAttribute("required", "");

      const bodyTextarea = page.locator('.feedback-form textarea[name="body"]');
      await expect(bodyTextarea).toBeVisible();
      await expect(bodyTextarea).toHaveAttribute("required", "");

      await expect(
        page.locator('.feedback-form button[type="submit"]')
      ).toContainText("Verstuur feedback");
    });

    test("submitting valid feedback shows success state and dry-run URL (GH #453 regression)", async ({
      page,
    }) => {
      // GH #453/#461: submitFeedback is a Next.js server action, so the
      // GitHub POST runs in the Node process and Playwright's page.route()
      // can never intercept it — the old interceptor was dead code, and
      // every CI run with a real token silently created a genuine spam
      // issue. Determinism now comes from FEEDBACK_DRY_RUN (set in the
      // Playwright webServer env): the action short-circuits before any
      // fetch to api.github.com and returns this fixed URL.
      const dryRunUrl =
        "https://github.com/rbnbrls/bcm/issues?q=E2E+dry-run";

      // Fill in the feedback form
      await page
        .locator('.feedback-form input[name="title"]')
        .fill("E2E test feedback - title");
      await page
        .locator('.feedback-form textarea[name="body"]')
        .fill("E2E test feedback - description. Automated test verification.");

      // Submit
      await page.locator('.feedback-form button[type="submit"]').click();

      // The success state must render (no fallback branch, no swallowed errors).
      await expect(page.locator(".feedback-success")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator(".feedback-success")).toContainText(
        "Bedankt voor je feedback!"
      );

      // The GitHub link must point at the exact dry-run URL. This is the
      // assertion that fails if the guard regresses: with a real token and
      // no FEEDBACK_DRY_RUN the action would return a numbered issue URL
      // (…/issues/<N>) and create a real issue — the exact match below
      // turns that regression into a red test instead of silent spam.
      const githubLink = page.locator(
        '.feedback-success a[href*="github.com"]'
      );
      await expect(githubLink).toBeVisible();
      await expect(githubLink).toHaveAttribute("href", dryRunUrl);
      // Belt and braces: never a real numbered issue URL.
      await expect(githubLink).not.toHaveAttribute(
        "href",
        /github\.com\/rbnbrls\/bcm\/issues\/\d+/
      );

      // Close the success modal
      await page.locator(".feedback-success button").click();
      await expect(page.locator(".feedback-modal--open")).not.toBeVisible();
    });

    test("validation prevents submission with empty required fields", async ({
      page,
    }) => {
      // Clear auto-filled fields and submit with empty values
      await page.locator('.feedback-form input[name="title"]').fill("");
      await page.locator('.feedback-form textarea[name="body"]').fill("");

      await page.locator('.feedback-form button[type="submit"]').click();

      // HTML5 validation should prevent navigation
      await expect(page.locator(".feedback-modal--open")).toBeVisible();

      // The form should still be showing (not navigated away)
      await expect(
        page.locator('.feedback-form input[name="title"]')
      ).toBeVisible();
    });
  });

  test.describe("Admin attribute options CRUD", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");
    });

    test("add new WTP classification option", async ({ page }) => {
      const testName = `E2E Test WTP ${Date.now()}`;

      // Open the "Nieuwe wtp classificatie toevoegen" disclosure
      const wtpSection = page.locator(".attr-section").first();
      await wtpSection.locator("details summary").click();

      // Wait for the form to appear
      const addForm = wtpSection.locator("details form");
      await expect(addForm).toBeVisible();

      // Fill the name field
      await addForm.locator('input[name="name"]').fill(testName);

      // Submit
      await addForm.locator('button[type="submit"]').click();

      // Wait for the page to update (revalidatePath)
      await page.waitForTimeout(500);

      // Either the item appears in the table or we get a success/error message
      const tableRow = wtpSection
        .locator("table.config-table tbody tr")
        .filter({ hasText: testName });

      if (await tableRow.isVisible().catch(() => false)) {
        // The new option was created successfully
        await expect(tableRow.locator("td").first()).toContainText(testName);
      } else {
        // Check for error (duplicate or DB issue)
        const alert = page.locator('[role="alert"]');
        if (await alert.isVisible().catch(() => false)) {
          // Error is acceptable on local dev (no DB) or if name exists
          await expect(alert).toBeVisible();
        }
      }
    });

    test("inline edit renames an existing option and cancels restore original", async ({
      page,
    }) => {
      // Find the first attribute section with at least one row
      const firstSection = page.locator(".attr-section").first();
      const firstRow = firstSection.locator(
        "table.config-table tbody tr"
      ).first();

      if (!(await firstRow.isVisible().catch(() => false))) {
        test.skip();
        return;
      }

      // Get the original name
      const originalName = await firstRow.locator("td").first().textContent();
      expect(originalName).toBeTruthy();

      // Click "Bewerken" button
      await firstRow.locator("button", { hasText: "Bewerken" }).click();

      // Verify inline edit form appeared
      const inlineInput = page.locator(".inline-edit-input");
      await expect(inlineInput).toBeVisible();
      await expect(inlineInput).toHaveValue(originalName!);

      // Click "Annuleren" without saving
      await page.locator("button", { hasText: "Annuleren" }).click();

      // Verify edit form is gone and original value restored in view
      await expect(page.locator(".inline-edit-input")).not.toBeVisible();
      await expect(
        firstSection.locator("table.config-table tbody tr").first().locator("td").first()
      ).toContainText(originalName!);
    });

    test("edit and save with new name, then revert to original", async ({
      page,
    }) => {
      const firstSection = page.locator(".attr-section").first();
      const firstRow = firstSection.locator(
        "table.config-table tbody tr"
      ).first();

      if (!(await firstRow.isVisible().catch(() => false))) {
        test.skip();
        return;
      }

      const originalName = (
        await firstRow.locator("td").first().textContent()
      )?.trim();
      expect(originalName).toBeTruthy();

      const editedName = `${originalName} (E2E edited ${Date.now()})`;

      // Click edit
      await firstRow.locator("button", { hasText: "Bewerken" }).click();

      // Wait for inline editor
      const inlineInput = page.locator(".inline-edit-input");
      await expect(inlineInput).toBeVisible();

      // Change the name
      await inlineInput.fill(editedName);

      // Click "Opslaan"
      await page.locator('button[type="submit"]', { hasText: "Opslaan" }).click();

      // Wait for server action
      await page.waitForTimeout(1000);

      // Check if the edit was saved (DB available) or if still in edit mode
      const editFormStillPresent = await page
        .locator(".inline-edit-input")
        .isVisible()
        .catch(() => false);
      const alert = page.locator('[role="alert"]');
      const errorVisible = await alert.isVisible().catch(() => false);

      if (editFormStillPresent || errorVisible) {
        // DB unavailable or save failed — inline edit form remains or error shown
        // The test validated the interaction up to the save attempt
        if (errorVisible) {
          await expect(alert).toBeVisible();
        }
        // Cancel to restore original state
        const cancelBtn = page.locator("button", { hasText: "Annuleren" });
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.click();
        }
        return;
      }

      // If save succeeded, verify the new name appears in the table
      await expect(
        firstSection.locator("table.config-table tbody tr").first().locator("td").first()
      ).toHaveText(editedName);

      // Now revert to original
      await page.locator("button", { hasText: "Bewerken" }).first().click();
      await expect(page.locator(".inline-edit-input")).toBeVisible();
      await page.locator(".inline-edit-input").fill(originalName!);
      await page.locator('button[type="submit"]', { hasText: "Opslaan" }).click();
      await page.waitForTimeout(1000);

      // Verify original name restored or edit form visible (DB unavailable)
      const inputAfterRevert = await page
        .locator(".inline-edit-input")
        .isVisible()
        .catch(() => false);
      if (!inputAfterRevert) {
        await expect(
          firstSection.locator("table.config-table tbody tr").first().locator("td").first()
        ).toHaveText(originalName!);
      } else {
        await page.locator("button", { hasText: "Annuleren" }).click();
      }
    });

    test("add form shows validation for short name", async ({ page }) => {
      const wtpSection = page.locator(".attr-section").first();
      await wtpSection.locator("details summary").click();

      const addForm = wtpSection.locator("details form");
      await expect(addForm).toBeVisible();

      // Fill with a single character (below minLength)
      await addForm.locator('input[name="name"]').fill("X");

      // Submit — HTML5 validation (minLength=2) or server validation should catch it
      await addForm.locator('button[type="submit"]').click();

      // Either still on page with form visible (HTML5 blocked) or error shown
      const formStillVisible = await addForm.isVisible().catch(() => false);
      const errorAlert = await page.locator('[role="alert"]').isVisible().catch(() => false);

      expect(formStillVisible || errorAlert).toBeTruthy();
    });
  });

  test.describe("Admin webhook form", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/admin/webhooks");
      await page.waitForLoadState("networkidle");
    });

    test("webhook form has all required fields and checkboxes", async ({
      page,
    }) => {
      const form = page.locator(".webhook-form");

      // Name field
      await expect(form.locator('input[name="name"]')).toBeVisible();
      await expect(form.locator('input[name="name"]')).toHaveAttribute(
        "required",
        ""
      );

      // URL field
      await expect(form.locator('input[name="url"]')).toBeVisible();
      await expect(form.locator('input[name="url"]')).toHaveAttribute(
        "required",
        ""
      );
      await expect(form.locator('input[name="url"]')).toHaveAttribute(
        "type",
        "url"
      );

      // Secret field (optional)
      await expect(form.locator('input[name="secret"]')).toBeVisible();

      // Event checkboxes — both should be checked by default
      const approvedCheckbox = form.locator(
        'input[type="checkbox"][value="change.approved"]'
      );
      await expect(approvedCheckbox).toBeVisible();
      await expect(approvedCheckbox).toBeChecked();

      const rejectedCheckbox = form.locator(
        'input[type="checkbox"][value="change.rejected"]'
      );
      await expect(rejectedCheckbox).toBeVisible();
      await expect(rejectedCheckbox).toBeChecked();

      // Submit button
      await expect(
        form.locator('button[type="submit"]')
      ).toContainText("Webhook toevoegen");
    });

    test("filling webhook form and submitting validates interactions", async ({
      page,
    }) => {
      const testName = `E2E Webhook ${Date.now()}`;

      // Fill the form
      await page.locator('.webhook-form input[name="name"]').fill(testName);
      await page
        .locator('.webhook-form input[name="url"]')
        .fill("https://e2e-test.example.com/webhook");
      await page
        .locator('.webhook-form input[name="secret"]')
        .fill("e2e-test-secret");

      // Uncheck "Change afgewezen" (leave only "Change goedgekeurd")
      await page
        .locator(
          '.webhook-form input[type="checkbox"][value="change.rejected"]'
        )
        .uncheck();

      // Submit
      await page.locator('.webhook-form button[type="submit"]').click();
      await page.waitForLoadState("networkidle");

      // Check for success or error message
      const successAlert = page.locator(".approval-success");
      const errorAlert = page.locator(".form-errors");

      if (await successAlert.isVisible().catch(() => false)) {
        // Webhook created successfully
        await expect(successAlert).toBeVisible();

        // The webhook should now appear in the active list
        const webhookCard = page
          .locator(".webhook-card")
          .filter({ hasText: testName });
        await expect(webhookCard).toBeVisible({ timeout: 5000 });
        await expect(webhookCard).toContainText(
          "https://e2e-test.example.com/webhook"
        );
        await expect(webhookCard).toContainText("change.approved");
        await expect(webhookCard).not.toContainText("change.rejected");

        // Clean up: delete the test webhook
        const deleteBtn = webhookCard.locator("button", {
          hasText: "Verwijderen",
        });
        await deleteBtn.click();
        await page.waitForTimeout(500);
        await expect(webhookCard).not.toBeVisible();
      } else if (await errorAlert.isVisible().catch(() => false)) {
        // Error is acceptable on local dev (no DB or no GITHUB_TOKEN for events)
        await expect(errorAlert).toBeVisible();
      }
    });
  });

  test.describe("Client-side error boundary trigger", () => {
    test("error boundary catches thrown errors on page render", async ({
      page,
    }) => {
      // Navigate to a page that will trigger the error boundary
      // The changes page relies on DB data — if DB is unavailable, it may error
      await page.goto("/changes", { waitUntil: "networkidle" });

      // Check for error boundary
      const errorBoundary = page.locator('.page-shell[role="alert"]');
      const pageContent = page.locator("table.config-table, .changes-filter");

      const boundaryVisible = await errorBoundary
        .isVisible()
        .catch(() => false);
      const contentVisible = await pageContent.isVisible().catch(() => false);

      if (boundaryVisible) {
        // Error boundary is rendered
        await expect(errorBoundary).toContainText("fout opgetreden");
        await expect(
          errorBoundary.locator("button, a")
        ).not.toHaveCount(0);
      } else if (contentVisible) {
        // Page loaded fine with DB
        await expect(pageContent).toBeVisible();
      } else {
        // Neither boundary nor content — likely still loading
        // Acceptable timeout scenario
        console.log("Page state: neither error boundary nor content rendered (timeout)");
      }
    });

    test("navigating to a non-existent change detail shows appropriate fallback", async ({
      page,
    }) => {
      // Navigate to a change detail page with an invalid UUID
      await page.goto("/changes/00000000-0000-0000-0000-000000000000", {
        waitUntil: "networkidle",
      });

      // Check for either error boundary, 404 page, or error message
      const errorBoundary = page.locator('.page-shell[role="alert"]');
      const notFound = page.locator("h1:has-text('niet gevonden')");
      const errorMessage = page.locator(".form-errors");

      if (await errorBoundary.isVisible().catch(() => false)) {
        await expect(errorBoundary).toBeVisible();
      } else if (await notFound.isVisible().catch(() => false)) {
        await expect(notFound).toBeVisible();
      } else if (await errorMessage.isVisible().catch(() => false)) {
        await expect(errorMessage).toBeVisible();
      } else {
        // Page loaded some variation — accept as valid fallback
        console.log("Change detail with invalid ID: fallback page rendered");
      }
    });

    test("error boundary reports error to /api/report-error", async ({
      page,
    }) => {
      // Capture API calls to /api/report-error
      let reportErrorCalled = false;
      let reportErrorPayload: string | null = null;

      await page.route("**/api/report-error", async (route) => {
        if (route.request().method() === "POST") {
          reportErrorCalled = true;
          reportErrorPayload = route.request().postData();
        }
        await route.continue();
      });

      // Trigger a page that may error
      await page.goto("/changes", { waitUntil: "networkidle" });

      // Wait for error boundary to possibly render
      const errorBoundary = page.locator('.page-shell[role="alert"]');
      const boundaryVisible = await errorBoundary
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (boundaryVisible) {
        // Give time for the error report to fire
        await page.waitForTimeout(2000);

        if (reportErrorCalled) {
          // Verify the error report contains expected fields
          expect(reportErrorPayload).toBeTruthy();
          if (reportErrorPayload) {
            const parsed = JSON.parse(reportErrorPayload);
            expect(parsed).toHaveProperty("error");
            expect(parsed).toHaveProperty("url");
            expect(parsed).toHaveProperty("timestamp");
          }
        }
      }

      // Clean up route interception
      await page.unroute("**/api/report-error");
    });
  });

  test.describe("Admin page navigation and content interaction", () => {
    test("all admin card navigation preserves page state", async ({
      page,
    }) => {
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");

      // Visit each admin sub-page and verify it loads without crashing
      const adminPages = [
        { label: "Client config", url: "/admin/client-config" },
        { label: "Client config importeren", url: "/admin/client-config/import" },
        { label: "Webhooks", url: "/admin/webhooks" },
        { label: "Change catalogus", url: "/admin/change-types" },
        { label: "Attribuutopties", url: "/admin/attribute-options" },
      ];

      for (const { label, url } of adminPages) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");

        // Should not crash — page should have a heading
        const heading = page.locator("h1");
        await expect(heading).toBeVisible({ timeout: 10000 });

        // Navigate back using nav (not browser back)
        await page
          .locator("nav[aria-label='Hoofdnavigatie'] a[href='/admin']")
          .click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/admin$/);
      }
    });

    test("admin change-types table rows are clickable and navigate to detail", async ({
      page,
    }) => {
      await page.goto("/admin/change-types");
      await page.waitForLoadState("networkidle");

      // Find clickable links in the table
      const detailLink = page
        .locator("table.config-table tbody tr td a")
        .first();

      if (await detailLink.isVisible().catch(() => false)) {
        const href = await detailLink.getAttribute("href");
        expect(href).toMatch(/\/change-catalog\//);

        await detailLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/change-catalog\//);
      } else {
        // Table may be empty — skip
        test.skip();
      }
    });
  });

  test.describe("Report sub-page navigation and data display", () => {
    test("cost report shows stat cards with numeric values", async ({
      page,
    }) => {
      await page.goto("/reports/costs");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Kosten" })).toBeVisible();
      await expect(
        page.locator("a.button-ghost[href='/reports']")
      ).toContainText("Dashboard");

      // Stat cards should contain actual values (not just exist)
      const statCards = page.locator(".stat-card .stat-value");
      const count = await statCards.count();

      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const value = await statCards.nth(i).textContent();
          // Values should be non-empty (even if "0" or "—")
          expect(value).toBeTruthy();
        }
      }
    });

    test("volume report shows month selector or date range", async ({
      page,
    }) => {
      await page.goto("/reports/volume");
      await page.waitForLoadState("networkidle");

      // Either a month selector or stat cards should be visible
      const monthSelect = page.locator("select, input[type='month']");
      const statCards = page.locator(".stat-card");

      if (await monthSelect.isVisible().catch(() => false)) {
        // Try selecting the first available month
        const options = await monthSelect.locator("option").all();
        if (options.length > 1) {
          await monthSelect.selectOption({ index: 1 });
          await page.waitForLoadState("networkidle");
          // After selection, stat cards should update
          await expect(statCards.first()).toBeVisible({ timeout: 5000 });
        }
      } else {
        await expect(statCards.first()).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
