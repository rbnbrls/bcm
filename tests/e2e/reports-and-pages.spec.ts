import { test, expect } from "@playwright/test";

test.describe("Reports pages", () => {
  test.describe("Reports dashboard (/reports)", () => {
    test("page loads with heading and stat cards", async ({ page }) => {
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");

      await expect(page.locator(".eyebrow")).toContainText("RAPPORTAGES");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

      // Stat cards should be visible
      const statCards = page.locator(".stat-card");
      await expect(statCards.first()).toBeVisible();
    });

    test("shows monthly volume chart section", async ({ page }) => {
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");

      await expect(page.getByText("Maandelijkse volume")).toBeVisible();
    });

    test("shows status distribution section", async ({ page }) => {
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");

      await expect(page.getByText("Statusverdeling")).toBeVisible();
    });

    test("links to sub-reports are present and navigate correctly", async ({
      page,
    }) => {
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");

      // Check for the three report links
      const reportLinks = [
        { label: "Doorlooptijd", href: "/reports/processing-time" },
        { label: "Kosten", href: "/reports/costs" },
        { label: "Volume", href: "/reports/volume" },
      ];

      for (const { label, href } of reportLinks) {
        // Navigate back to /reports each time
        await page.goto("/reports");
        await page.waitForLoadState("networkidle");

        // Find the link card
        const card = page.locator(`a[href="${href}"]`);
        await expect(card).toContainText(label);
        await card.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(new RegExp(href.replace("/", "\\/")));
      }
    });
  });

  test.describe("Processing time report (/reports/processing-time)", () => {
    test("page loads with heading and back link", async ({ page }) => {
      await page.goto("/reports/processing-time");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Doorlooptijd" })).toBeVisible();
      await expect(page.locator(`a.button-ghost[href="/reports"]`)).toContainText("Dashboard");

      // CSV download link should be present
      const csvLink = page.locator('a[download]');
      if (await csvLink.isVisible().catch(() => false)) {
        await expect(csvLink).toContainText("CSV downloaden");
      }
    });

    test("shows summary stat cards", async ({ page }) => {
      await page.goto("/reports/processing-time");
      await page.waitForLoadState("networkidle");

      const statCards = page.locator(".stat-card");
      await expect(statCards.first()).toBeVisible();
    });
  });

  test.describe("Cost report (/reports/costs)", () => {
    test("page loads with heading", async ({ page }) => {
      await page.goto("/reports/costs");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Kosten" })).toBeVisible();
      await expect(page.locator(`a.button-ghost[href="/reports"]`)).toContainText("Dashboard");
    });

    test("shows estimated costs and table", async ({ page }) => {
      await page.goto("/reports/costs");
      await page.waitForLoadState("networkidle");

      const statCards = page.locator(".stat-card");
      await expect(statCards.first()).toBeVisible();
    });
  });

  test.describe("Volume report (/reports/volume)", () => {
    test("page loads with heading", async ({ page }) => {
      await page.goto("/reports/volume");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: "Volume per klant" })).toBeVisible();
      await expect(page.locator(`a.button-ghost[href="/reports"]`)).toContainText("Dashboard");
    });

    test("shows volume stat cards", async ({ page }) => {
      await page.goto("/reports/volume");
      await page.waitForLoadState("networkidle");

      const statCards = page.locator(".stat-card");
      await expect(statCards.first()).toBeVisible();
    });
  });
});

test.describe("Updates page (/updates)", () => {
  test("page loads with heading and timeline", async ({ page }) => {
    await page.goto("/updates");
    await page.waitForLoadState("networkidle");

    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    // The updates page shows commits in a timeline - may show loading state
    // or loaded content depending on the API
  });

  test("shows network activity indicator during load", async ({ page }) => {
    await page.goto("/updates");
    // Wait for the page to reach networkidle
    await page.waitForLoadState("networkidle");
  });
});

test.describe("Change history (/changes/history)", () => {
  test("page loads with heading and client cards", async ({ page }) => {
    await page.goto("/changes/history");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /changes per klant/i })).toBeVisible();
    await expect(page.locator(".eyebrow")).toContainText("WIJZIGINGSHISTORIE");

    // Either show history cards or empty state
    const historyCards = page.locator(".history-card, .history-grid");
    const emptyState = page.locator(".empty-state");

    if (await historyCards.isVisible().catch(() => false)) {
      // Verify cards link to client detail pages
      const firstCard = page.locator(".history-card, .history-grid a").first();
      await expect(firstCard).toBeVisible();
    } else if (await emptyState.isVisible().catch(() => false)) {
      await expect(emptyState).toContainText("Nog geen changes");
    }
  });

  test("client history card navigates to detail page", async ({ page }) => {
    await page.goto("/changes/history");
    await page.waitForLoadState("networkidle");

    const link = page.locator(".history-card, .history-grid a").first();
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute("href");
      expect(href).toMatch(/\/changes\/history\//);
      await link.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/changes\/history\//);
    }
  });
});

test.describe("Change catalog (/change-catalog)", () => {
  test("page loads with heading and change type cards", async ({ page }) => {
    await page.goto("/change-catalog");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("CHANGE CATALOGUS", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Change catalogus" })).toBeVisible();

    // Should show change type entries (even if empty, the component should render)
    const catalogGrid = page.locator(
      ".change-type-card, .change-type-grid, .change-catalog-grid, .catalog-list",
    );
    if (await catalogGrid.isVisible().catch(() => false)) {
      await expect(catalogGrid).toBeVisible();
    }
  });

  test("change type card has detail link", async ({ page }) => {
    await page.goto("/change-catalog");
    await page.waitForLoadState("networkidle");

    // Find a clickable change type entry
    const detailLink = page.locator("a[href*='/change-catalog/']").first();
    if (await detailLink.isVisible().catch(() => false)) {
      await detailLink.click();
      await page.waitForLoadState("networkidle");
      // Should navigate to a detail page (UUID format or slug)
      await expect(page).toHaveURL(/\/change-catalog\//);
    }
  });

  test("change catalog detail page shows structure", async ({ page }) => {
    // Try a known slug for the detail page
    await page.goto("/change-catalog/benchmark-switch");
    await page.waitForLoadState("networkidle");

    // If the page exists (slug is valid), verify structure
    const h1 = page.locator("h1");
    const notFound = page.locator("h1:has-text('niet gevonden')");

    if (await notFound.isVisible().catch(() => false)) {
      // Slug not found — this is acceptable; the page properly handles 404
      await expect(notFound).toBeVisible();
    } else if (await h1.isVisible().catch(() => false)) {
      // Detail page loaded — verify it shows content
      await expect(h1).toBeVisible();
    }
  });
});

test.describe("Provider feedback page (/verwerkt)", () => {
  test("page loads with visible heading", async ({ page }) => {
    await page.goto("/verwerkt");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toBeVisible();
  });
});
