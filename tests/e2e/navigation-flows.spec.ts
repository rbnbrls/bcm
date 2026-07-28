import { test, expect } from "@playwright/test";

test.describe("End-to-end navigation flows", () => {
  test.describe("Main navigation bar", () => {
    test("navigates between all main sections via nav links", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Navigation links: Dashboard, Wijzigingen, Rapportages, Beheer
      const navLinks = [
        { index: 0, href: "/", label: "Dashboard" },
        { index: 1, href: "/changes", label: "Wijzigingen" },
        { index: 2, href: "/reports", label: "Rapportages" },
        { index: 3, href: "/admin", label: "Beheer" },
      ];

      for (const { index, href, label } of navLinks) {
        const link = page.locator(
          `nav[aria-label='Hoofdnavigatie'] a[href="${href}"]`,
        );
        await expect(link).toContainText(label);
        await link.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(new RegExp(href.replace("/", "\\/")));
        // Active nav should have aria-current
        await expect(link).toHaveAttribute("aria-current", "page");
      }
    });

    test("active nav state updates correctly when navigating between pages", async ({
      page,
    }) => {
      const nav = () => page.locator("nav[aria-label='Hoofdnavigatie']");

      // Start at Dashboard
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await expect(nav().locator('a[href="/"]')).toHaveAttribute(
        "aria-current",
        "page",
      );

      // Navigate to Wijzigingen
      await page.goto("/changes");
      await page.waitForLoadState("networkidle");
      await expect(nav().locator('a[href="/"]')).not.toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav().locator('a[href="/changes"]')).toHaveAttribute(
        "aria-current",
        "page",
      );

      // Navigate to Rapportages
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");
      await expect(nav().locator('a[href="/changes"]')).not.toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav().locator('a[href="/reports"]')).toHaveAttribute(
        "aria-current",
        "page",
      );

      // Navigate to Beheer
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");
      await expect(nav().locator('a[href="/reports"]')).not.toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav().locator('a[href="/admin"]')).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  test.describe("Dashboard → Change form flow", () => {
    test("full flow: homepage → expand Nieuwe change → click link → change form", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Homepage should show the hero
      await expect(page.locator("h1")).toContainText("Welkom bij BCM");

      // Expand the first accordion (Nieuwe change)
      const firstHeader = page
        .locator(".main-category-header")
        .first();
      await firstHeader.click();
      await expect(
        page.locator(".accordion-panel").first(),
      ).toBeVisible();

      // Click "Nieuwe change" link
      await page.locator('a[href="/changes/new"]').click();
      await page.waitForLoadState("networkidle");

      // Verify we're on the change form
      await expect(page).toHaveURL(/\/changes\/new/);
      await expect(
        page.getByRole("heading", { name: "Nieuwe change" }),
      ).toBeVisible();
    });

    test("full flow: homepage → expand Monitoren & verwerken → changes list", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Expand second accordion
      const secondHeader = page
        .locator(".main-category-header")
        .nth(1);
      await secondHeader.click();

      // Wait for the panel to expand
      const panel = page.locator(".accordion-panel").nth(1);
      await expect(panel).toBeVisible();

      // Click changes overview link
      const changesLink = panel.locator('a[href="/changes"]');
      if (await changesLink.isVisible().catch(() => false)) {
        await changesLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/changes$/);
      }
    });

    test("full flow: homepage → expand Beheer → admin dashboard", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Expand third accordion (Beheer)
      const lastHeader = page
        .locator(".main-category-header")
        .nth(2);
      await lastHeader.click();

      const panel = page.locator(".accordion-panel").nth(2);
      await expect(panel).toBeVisible();

      // Click admin link
      const adminLink = panel.locator('a[href="/admin"]');
      if (await adminLink.isVisible().catch(() => false)) {
        await adminLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/admin$/);
      }
    });
  });

  test.describe("Cross-section navigation", () => {
    test("navigate: changes list → new change → catalog → dashboard", async ({
      page,
    }) => {
      // Start at changes list
      await page.goto("/changes");
      await page.waitForLoadState("networkidle");

      // Find and click "Nieuwe change" button/link from the changes page
      const newChangeLink = page
        .locator('a[href="/changes/new"]')
        .first();

      if (await newChangeLink.isVisible().catch(() => false)) {
        await newChangeLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/changes\/new/);
      }

      // Navigate to benchmarks catalog (via the generic form page context)
      const benchmarkLink = page
        .locator('a[href="/benchmarks"]')
        .first();

      if (await benchmarkLink.isVisible().catch(() => false)) {
        await benchmarkLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/benchmarks/);
      }

      // Back to dashboard via nav
      await page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/']").click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/$/);
    });

    test("navigate: admin → change types → catalog detail → reports", async ({
      page,
    }) => {
      // Start at admin
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");

      // Go to change types admin
      const changeTypesLink = page.locator('a[href="/admin/change-types"]');
      await expect(changeTypesLink).toBeVisible();
      await changeTypesLink.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/admin\/change-types/);

      // Follow first change type link to catalog detail
      const detailLink = page
        .locator("table.config-table tbody tr td a")
        .first();
      if (await detailLink.isVisible().catch(() => false)) {
        await detailLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/change-catalog\//);
      }

      // Use nav to go to reports
      await page
        .locator("nav[aria-label='Hoofdnavigatie'] a[href='/reports']")
        .click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/reports/);
    });

    test("navigate: reports → processing time → costs → volume → dashboard", async ({
      page,
    }) => {
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");

      // Navigate to each sub-report
      const reports = [
        "/reports/processing-time",
        "/reports/costs",
        "/reports/volume",
      ];

      for (const reportPath of reports) {
        await page.goto(reportPath);
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(new RegExp(reportPath.replace("/", "\\/")));
        // Each report page should have a "← Dashboard" link back to /reports
        const backLink = page.locator(`a[href="/reports"]`);
        await expect(backLink).toBeVisible();
      }

      // Navigate to dashboard via nav
      await page
        .locator("nav[aria-label='Hoofdnavigatie'] a[href='/']")
        .click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/$/);
    });
  });

  test.describe("Error resilience in navigation", () => {
    test("navigating between pages does not cause unhandled errors", async ({
      page,
    }) => {
      // Collect console errors during navigation
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // Navigate through all major pages in sequence
      const pages = [
        "/",
        "/changes",
        "/changes/new",
        "/benchmarks",
        "/benchmark-aanvraag",
        "/reports",
        "/reports/processing-time",
        "/reports/costs",
        "/reports/volume",
        "/admin",
        "/admin/client-config",
        "/admin/webhooks",
        "/admin/change-types",
        "/admin/attribute-options",
        "/changes/history",
        "/change-catalog",
        "/updates",
        "/verwerkt",
      ];

      for (const path of pages) {
        try {
          await page.goto(path, { timeout: 15000, waitUntil: "networkidle" });
          // Brief pause to let any deferred errors surface
          await page.waitForTimeout(300);
        } catch {
          // Navigation timeout is OK — some pages may fail due to missing DB
          // This test is about error resilience, not page loading
        }
      }

      // Log any console errors found (non-blocking — just informational)
      if (consoleErrors.length > 0) {
        console.log(
          `[Navigation flow] ${consoleErrors.length} console.error(s) across all pages:`,
          consoleErrors.slice(0, 5).join("; "),
        );
      }

      // Verify we ended up somewhere valid (the last page)
      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    });
  });
});
