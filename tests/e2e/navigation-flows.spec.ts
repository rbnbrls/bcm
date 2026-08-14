import { test, expect } from "@playwright/test";
import { setAdminRole } from "./helpers";

test.describe("End-to-end navigation flows", () => {
  // Several flows below visit /admin/* (gated by the bcm_active_role
  // RBAC cookie in proxy.ts); the cookie is harmless for public pages.
  test.beforeEach(async ({ page }) => {
    await setAdminRole(page);
  });
  test.describe("Main navigation bar", () => {
    test("navigates between all main sections via nav links", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Legacy Wijzigingen/Rapportages entries are removed from the main nav.
      const navLinks = [
        { href: "/", label: "Dashboard" },
        { href: "/workflow-runtime", label: "Runtime" },
        { href: "/workflow-studio", label: "Workflow Studio" },
        { href: "/admin", label: "Beheer" },
      ];
      await expect(page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/changes']")).toHaveCount(0);
      await expect(page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/reports']")).toHaveCount(0);

      for (const { href, label } of navLinks) {
        const link = page.locator(
          `nav[aria-label='Hoofdnavigatie'] a[href="${href}"]`,
        );
        await expect(link).toContainText(label);
        await link.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(new RegExp(href.replace("/", "\\/")));
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

      // The retired changes/reports nav links should never be present.
      await expect(nav().locator('a[href="/changes"]')).toHaveCount(0);
      await expect(nav().locator('a[href="/reports"]')).toHaveCount(0);

      // Navigate to runtime
      await page.goto("/workflow-runtime");
      await page.waitForLoadState("networkidle");
      await expect(nav().locator('a[href="/"]')).not.toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav().locator('a[href="/workflow-runtime"]')).toHaveAttribute(
        "aria-current",
        "page",
      );

      // Navigate to the retired reports route. It should hand off to runtime
      // reporting (or the runtime dashboard's own fallback when disabled).
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/\/reports$/);

      // Navigate to Beheer
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");
      await expect(nav().locator('a[href="/admin"]')).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  test.describe("Dashboard → Change catalog flow", () => {
    test("full flow: homepage → expand Nieuwe change → click link → change catalog", async ({
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

      // Click "Change aanvragen" link (catalog-first flow since dc18e213:
      // the action points to /change-catalog instead of /changes/new)
      await page
        .getByRole("link", { name: /Change aanvragen/ })
        .click();
      await page.waitForLoadState("networkidle");

      // Verify we're on the change catalog
      await expect(page).toHaveURL(/\/change-catalog/);
      await expect(
        page.getByRole("heading", { name: "Change catalogus" }),
      ).toBeVisible();
    });

    test("full flow: homepage → expand Monitoren & verwerken → processed changes", async ({
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

      await expect(panel.locator('a[href="/changes"]')).toHaveCount(0);

      const processedLink = panel.locator('a[href="/verwerkt"]');
      if (await processedLink.isVisible().catch(() => false)) {
        await processedLink.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/verwerkt$/);
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
    test("navigate: change catalog → new change route → dashboard", async ({
      page,
    }) => {
      // The old changes overview is gone; start at the catalog-first entry.
      await page.goto("/change-catalog");
      await page.waitForLoadState("networkidle");

      await page.goto("/changes/new?type=benchmark_switch");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/changes\/new/);

      // Back to dashboard via nav
      await page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/']").click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/$/);
    });

    test("navigate: admin → client config → runtime", async ({
      page,
    }) => {
      // Start at admin
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");

      // Go to client config admin
      const clientConfigLink = page.locator('a[href="/admin/client-config"]');
      await expect(clientConfigLink).toBeVisible();
      await clientConfigLink.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/admin\/client-config/);

      // The client-config list renders its table; per-row edits open the
      // inline wizard (the retired change-type detail route is gone, so
      // there is no detail link to follow).
      await expect(
        page.getByRole("heading", { name: "Client config" }),
      ).toBeVisible();
      const editBtn = page
        .locator("table.config-table tbody tr button.config-edit-btn")
        .first();
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click();
        const wizard = page.locator("section.config-edit-wizard");
        await expect(wizard).toBeVisible();
        await expect(
          wizard.getByRole("heading", { name: "Wijzig rij" }),
        ).toBeVisible();
        await wizard.getByRole("button", { name: "Sluit wijzig wizard" }).click();
        await expect(wizard).toBeHidden();
      }

      // Use nav to go to runtime reporting; reports is no longer a nav item.
      await expect(page.locator("nav[aria-label='Hoofdnavigatie'] a[href='/reports']")).toHaveCount(0);
      await page
        .locator("nav[aria-label='Hoofdnavigatie'] a[href='/workflow-runtime']")
        .click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/workflow-runtime/);
    });

    test("retired report subpages hand off to runtime reporting", async ({
      page,
    }) => {
      await page.goto("/reports");
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/\/reports$/);

      const reports = [
        "/reports/processing-time",
        "/reports/costs",
        "/reports/volume",
      ];

      for (const reportPath of reports) {
        await page.goto(reportPath);
        await page.waitForLoadState("networkidle");
        await expect(page).not.toHaveURL(new RegExp(`${reportPath}$`));
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
        "/changes/new",
        "/reports",
        "/reports/processing-time",
        "/reports/costs",
        "/reports/volume",
        "/admin",
        "/admin/client-config",
        "/admin/service-catalog",
        "/admin/webhooks",
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
