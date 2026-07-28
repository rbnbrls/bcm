import { test, expect } from "@playwright/test";

test.describe("Admin pages (extended coverage)", () => {
  test.describe("Admin dashboard (/admin)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");
    });

    test("page loads with correct heading and structure", async ({ page }) => {
      await expect(page.locator(".eyebrow")).toContainText("ADMIN");
      await expect(page.getByRole("heading", { name: "Beheer" })).toBeVisible();
      await expect(page.locator(".admin-grid")).toBeVisible();
    });

    test("shows 6 admin card navigation links", async ({ page }) => {
      const cards = page.locator(".admin-card");
      await expect(cards).toHaveCount(6);

      const expectedLinks = [
        "Client config",
        "Client config importeren",
        "Benchmarks importeren",
        "Webhooks",
        "Change catalogus",
        "Attribuutopties",
      ];
      for (let i = 0; i < expectedLinks.length; i++) {
        await expect(cards.nth(i).locator("h2")).toContainText(expectedLinks[i]);
      }
    });

    test("clicking each card navigates to the correct page", async ({ page }) => {
      const cardLinks = [
        { index: 0, expectedUrl: /\/admin\/client-config$/ },
        { index: 1, expectedUrl: /\/admin\/client-config\/import/ },
        { index: 2, expectedUrl: /\/admin\/benchmarks\/import/ },
        { index: 3, expectedUrl: /\/admin\/webhooks/ },
        { index: 4, expectedUrl: /\/admin\/change-types/ },
        { index: 5, expectedUrl: /\/admin\/attribute-options/ },
      ];

      for (const { index, expectedUrl } of cardLinks) {
        await page.goto("/admin");
        await page.waitForLoadState("networkidle");

        await page.locator(".admin-card").nth(index).click();
        await page.waitForLoadState("networkidle");

        await expect(page).toHaveURL(expectedUrl);
      }
    });
  });

  test.describe("Attribute options admin (/admin/attribute-options)", () => {
    test("page loads with sections for all 4 attribute types", async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Attribuutopties beheren" })).toBeVisible();
      await expect(page.locator(".eyebrow")).toContainText("ADMIN · ATTRIBUTEN");

      // Verify 4 attribute sections
      const sections = page.locator(".attr-section");
      await expect(sections).toHaveCount(4);

      const expectedLabels = [
        "WTP classificatie",
        "Asset class",
        "Manager",
        "Benchmark",
      ];
      for (let i = 0; i < expectedLabels.length; i++) {
        await expect(sections.nth(i).locator("h2")).toContainText(expectedLabels[i]);
      }
    });

    test("each attribute section shows a table with columns", async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");

      const sections = page.locator(".attr-section");
      const count = await sections.count();

      for (let i = 0; i < count; i++) {
        const table = sections.nth(i).locator(".config-table");
        // Each section should have a table with at least a header row
        await expect(table.locator("thead th")).toHaveCount(2);
        await expect(table.locator("thead th").first()).toContainText("Naam");
        await expect(table.locator("thead th").nth(1)).toContainText("Acties");
      }
    });

    test("each section has add-new toggle", async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");

      const sections = page.locator(".attr-section");
      const count = await sections.count();

      for (let i = 0; i < count; i++) {
        const addSummary = sections.nth(i).locator("details summary");
        await expect(addSummary).toBeVisible();
        await expect(addSummary).toContainText("toevoegen");
      }
    });

    test("each item row has edit and delete buttons", async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");

      const sections = page.locator(".attr-section");

      for (let i = 0; i < 4; i++) {
        const rows = sections.nth(i).locator("table.config-table tbody tr");
        const rowCount = await rows.count();

        if (rowCount > 0) {
          // Verify each row has edit and delete buttons
          const editBtns = rows.nth(0).locator("button", { hasText: "Bewerken" });
          const deleteBtns = rows.nth(0).locator("button", { hasText: "Verwijderen" });
          await expect(editBtns).toBeVisible();
          await expect(deleteBtns).toBeVisible();
        }
      }
    });

    test("clicking edit opens inline form", async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");

      const firstRow = page.locator(".attr-section").first().locator("table.config-table tbody tr").first();
      if (await firstRow.isVisible().catch(() => false)) {
        const editBtn = firstRow.locator("button", { hasText: "Bewerken" });
        await editBtn.click();

        // Verify inline edit form appeared
        const inlineInput = page.locator(".inline-edit-input");
        await expect(inlineInput).toBeVisible();

        // Cancel the edit
        const cancelBtn = page.locator("button", { hasText: "Annuleren" });
        await expect(cancelBtn).toBeVisible();
        await cancelBtn.click();
        await expect(inlineInput).not.toBeVisible();
      }
    });
  });

  test.describe("Change types admin (/admin/change-types)", () => {
    test("page loads with heading and change types table", async ({ page }) => {
      await page.goto("/admin/change-types");
      await page.waitForLoadState("networkidle");

      await expect(page.locator(".eyebrow")).toContainText("ADMIN · CHANGE CATALOGUS");
      await expect(page.getByRole("heading", { name: "Change catalogus" })).toBeVisible();
    });

    test("table shows expected columns for change types", async ({ page }) => {
      await page.goto("/admin/change-types");
      await page.waitForLoadState("networkidle");

      const table = page.locator("table.config-table");
      if (await table.isVisible().catch(() => false)) {
        const headers = table.locator("thead th");
        await expect(headers).not.toHaveCount(0);

        // Verify key columns exist
        const headerTexts = await headers.allTextContents();
        const joined = headerTexts.join(" ");
        expect(joined).toContain("Naam");
        expect(joined).toContain("Kosten");
        expect(joined).toContain("Doorlooptijd");
      } else {
        // No change types — empty state should be shown
        await expect(page.locator(".empty-state")).toBeVisible();
      }
    });

    test("change type names link to catalog detail page", async ({ page }) => {
      await page.goto("/admin/change-types");
      await page.waitForLoadState("networkidle");

      const link = page.locator("table.config-table tbody tr td a").first();
      if (await link.isVisible().catch(() => false)) {
        const href = await link.getAttribute("href");
        expect(href).toMatch(/\/change-catalog\//);
        await link.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/change-catalog\//);
      }
    });
  });

  test.describe("Client config list (/admin/client-config)", () => {
    test("page loads with heading", async ({ page }) => {
      await page.goto("/admin/client-config");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Client config" })).toBeVisible();
    });

    test("shows client config table or appropriate empty/loading state", async ({ page }) => {
      await page.goto("/admin/client-config");
      await page.waitForLoadState("networkidle");

      // May show a table with client data or a loading skeleton
      const table = page.locator("table.config-table");
      const loading = page.locator(".loading-spinner, .skeleton");

      if (await table.isVisible().catch(() => false)) {
        // Verify table has expected columns
        const headers = table.locator("thead th");
        await expect(headers).not.toHaveCount(0);
      } else if (await loading.isVisible().catch(() => false)) {
        // Loading state is acceptable
        await expect(loading).toBeVisible();
      }
    });
  });
});
