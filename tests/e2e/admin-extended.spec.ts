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

    test("shows 5 admin card navigation links", async ({ page }) => {
      const cards = page.locator(".admin-card");
      await expect(cards).toHaveCount(5);

      const expectedLinks = [
        "Client config",
        "Client config importeren",
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
        { index: 2, expectedUrl: /\/admin\/webhooks/ },
        { index: 3, expectedUrl: /\/admin\/change-types/ },
        { index: 4, expectedUrl: /\/admin\/attribute-options/ },
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
    test("page loads with legacy lookups and client_config asset catalog", async ({ page }) => {
      await page.goto("/admin/attribute-options");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Attribuutopties beheren" })).toBeVisible();
      await expect(page.locator(".eyebrow")).toContainText("ADMIN · ATTRIBUTEN");

      // Asset classes moved out of the public lookup sections and into the
      // client_config-backed catalog, because those shortcodes feed the primary
      // account code.
      const sections = page.locator(".attr-section");
      await expect(sections).toHaveCount(3);

      const expectedLabels = [
        "WTP classificatie",
        "Manager",
        "Benchmark",
      ];
      for (let i = 0; i < expectedLabels.length; i++) {
        await expect(sections.nth(i).locator("h2")).toContainText(expectedLabels[i]);
      }
      await expect(page.getByRole("heading", { name: "Asset class catalogus" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Sub asset classes" })).toBeVisible();
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
        await link.click({ force: true });
        await page.waitForURL(/\/change-catalog\//);
      }
    });

    test("edit form keeps all fields, toggle and save button bound to the same change type", async ({ page }) => {
      await page.goto("/admin/change-types");
      await page.waitForLoadState("networkidle");

      const row = page.locator("table.config-table tbody tr").first();
      if (!(await row.isVisible().catch(() => false))) {
        test.skip();
      }

      const name = (await row.locator("td").first().locator("b").innerText()).trim();
      const baseCost = row.getByLabel(`Basiskosten voor ${name}`);
      const perItemCost = row.getByLabel(`Kosten per item voor ${name}`);
      const currency = row.getByLabel(`Valuta voor ${name}`);
      const costText = row.getByLabel(`Kostentekst voor ${name}`);
      const leadDays = row.getByLabel(`Doorlooptijd voor ${name}`);
      const sortOrder = row.getByLabel(`Volgorde voor ${name}`);
      const activeToggle = row.getByLabel(`${name} actief in frontend`);
      const saveButton = row.getByRole("button", { name: "Opslaan" });

      await expect(baseCost).toBeVisible();
      await expect(perItemCost).toBeVisible();
      await expect(currency).toBeVisible();
      await expect(costText).toBeVisible();
      await expect(leadDays).toBeVisible();
      await expect(sortOrder).toBeVisible();
      await expect(activeToggle).toBeVisible();
      await expect(saveButton).toBeEnabled();

      for (const input of [baseCost, perItemCost, currency, costText, leadDays, sortOrder]) {
        const value = await input.inputValue();
        await input.fill(value);
      }

      const formValues = await saveButton.evaluate((button) => {
        const form = (button as HTMLButtonElement).form;
        if (!form) return null;
        const data = new FormData(form, button as HTMLButtonElement);
        return {
          id: data.get("id"),
          active: data.getAll("active"),
          baseCost: data.get("baseCost"),
          perItemCost: data.get("perItemCost"),
          costCurrency: data.get("costCurrency"),
          costDescription: data.get("costDescription"),
          defaultLeadDays: data.get("defaultLeadDays"),
          sortOrder: data.get("sortOrder"),
        };
      });
      const toggleFormValues = await activeToggle.evaluate((toggle) => {
        const form = (toggle as HTMLInputElement).form;
        if (!form) return null;
        const data = new FormData(form);
        return {
          id: data.get("id"),
          active: data.get("active"),
        };
      });

      expect(formValues).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        baseCost: await baseCost.inputValue(),
        perItemCost: await perItemCost.inputValue(),
        costCurrency: await currency.inputValue(),
        costDescription: await costText.inputValue(),
        defaultLeadDays: await leadDays.inputValue(),
        sortOrder: await sortOrder.inputValue(),
      });
      expect(formValues?.active).toEqual([await activeToggle.isChecked() ? "true" : "false"]);
      expect(toggleFormValues).toEqual({
        id: formValues?.id,
        active: await activeToggle.isChecked() ? "true" : "false",
      });
    });

    test("saving edited cost text does not submit validation errors from another field", async ({ page }) => {
      await page.goto("/admin/change-types");
      await page.waitForLoadState("networkidle");

      const row = page.locator("table.config-table tbody tr").first();
      if (!(await row.isVisible().catch(() => false))) {
        test.skip();
      }

      const name = (await row.locator("td").first().locator("b").innerText()).trim();
      const costText = row.getByLabel(`Kostentekst voor ${name}`);
      await costText.fill(await costText.inputValue());
      await row.getByRole("button", { name: "Opslaan" }).click();

      await expect(row.getByText("Change type ontbreekt.")).toHaveCount(0);
      await expect(row.getByText(/Invalid option: expected one of "true"\|"false"/)).toHaveCount(0);
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
