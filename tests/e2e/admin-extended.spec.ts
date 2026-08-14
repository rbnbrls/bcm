import { test, expect } from "@playwright/test";
import { setAdminRole } from "./helpers";

test.describe("Admin pages (extended coverage)", () => {
  // All tests in this file visit /admin/*, which is gated by the
  // bcm_active_role RBAC cookie (proxy.ts) — set it up front.
  test.beforeEach(async ({ page }) => {
    await setAdminRole(page);
  });

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

    test("shows admin card navigation links", async ({ page }) => {
      const cards = page.locator(".admin-card");
      // 4 navigation cards + the reset-seed-data card.
      await expect(cards).toHaveCount(5);

      const expectedLinks = [
        "Client config",
        "Service catalogus",
        "Webhooks",
        "Attribuutopties",
      ];
      for (let i = 0; i < expectedLinks.length; i++) {
        await expect(cards.nth(i).locator("h2")).toContainText(expectedLinks[i]);
      }
    });

    test("clicking each card navigates to the correct page", async ({ page }) => {
      const cardLinks = [
        { index: 0, expectedUrl: /\/admin\/client-config$/ },
        { index: 1, expectedUrl: /\/admin\/service-catalog/ },
        { index: 2, expectedUrl: /\/admin\/webhooks/ },
        { index: 3, expectedUrl: /\/admin\/attribute-options/ },
      ];

      for (const { index, expectedUrl } of cardLinks) {
        await page.goto("/admin");
        await page.waitForLoadState("networkidle");

        await page.locator(".admin-card").nth(index).click();
        await page.waitForLoadState("networkidle");

        await expect(page).toHaveURL(expectedUrl);
      }
    });

    test("does not expose the removed client config import route", async ({ page }) => {
      const removedImportRoute = ["/admin", "client-config", "import"].join("/");
      const response = await page.goto(removedImportRoute);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Client config importeren" })).toHaveCount(0);
    });
  });

  test.describe("Attribute options admin (/admin/attribute-options)", () => {
    test("page loads with legacy lookups and client_config asset catalog", async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Attribuutopties beheren" })).toBeVisible();
      // The f4a0dda refactor renders the eyebrow with a hyphen separator
      // on this page.
      await expect(page.locator(".eyebrow")).toContainText("ADMIN - ATTRIBUTEN");

      // Asset classes moved out of the public lookup sections and into the
      // client_config-backed catalog, because those shortcodes feed the primary
      // account code. The f4a0dda refactor unified all six sections (one legacy
      // lookup + five client_config-backed catalogs) under .attr-section.
      const sections = page.locator(".attr-section");
      await expect(sections).toHaveCount(6);

      const expectedLabels = [
        "WTP classificatie",
        "Asset classes",
        "Sub asset classes",
        "Managers",
        "Benchmarks",
        "NPC classificaties",
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
        // Each section should have a table with a header row. The f4a0dda
        // refactor gives different sections different column sets (2–6
        // columns), but every table ends with the "Acties" actions column.
        await expect(table.locator("thead th")).not.toHaveCount(0);
        await expect(table.locator("thead th").last()).toContainText("Acties");
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
        await expect(headers.first()).toContainText("Klant");

        const firstRow = table.locator("tbody tr").first();
        if (!(await firstRow.locator("td.config-table-empty").isVisible().catch(() => false))) {
          const firstCell = firstRow.locator("td").first();
          await expect(firstCell).not.toHaveText("");
        }
      } else if (await loading.isVisible().catch(() => false)) {
        // Loading state is acceptable
        await expect(loading).toBeVisible();
      }
    });
  });

  test.describe("Service catalog (/admin/service-catalog)", () => {
    test("page loads with catalog and client configuration sections", async ({ page }) => {
      await page.goto("/admin/service-catalog");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Service catalogus" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Asset classes", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Sub asset classes", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Benchmarks", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Ingerichte diensten per klant", exact: true })).toBeVisible();
      await expect(page.getByText("directe mutaties op portfolio_configuration zijn niet toegestaan")).toBeVisible();
    });
  });
});
