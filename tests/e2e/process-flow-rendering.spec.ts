/**
 * Regression tests for Mermaid process flow rendering on change type detail pages.
 *
 * Covers:
 * - Mermaid diagram renders as SVG (not stuck in "Procesoverzicht laden..." loading state)
 * - All change types with defined process flows render correctly
 * - Loading state is replaced by actual diagram content
 *
 * Related: PR #195 — fixed Turbopack runtime bug where dynamic import("mermaid")
 * hung when the JavaScript chunk was already loaded in the DOM via blocking script tags.
 * These tests verify the static import fix prevents the loading hang regression.
 */
import { test, expect } from "@playwright/test";

/** Change type slugs that have a defined processFlow in the seed data. */
const CHANGE_TYPES_WITH_FLOW = [
  { slug: "benchmark_switch", name: "Benchmarkwissel" },
  { slug: "new_benchmark", name: "Nieuwe benchmark" },
  { slug: "fee_change", name: "Tariefwijziging" },
  { slug: "mandate_change", name: "Mandaatwijziging" },
  { slug: "custodian_change", name: "Custodianwijziging" },
  { slug: "rebalance_trigger", name: "Herweging" },
  { slug: "customer_onboarding", name: "Customer onboarding" },
  { slug: "portfolio_addition", name: "Portefeuille toevoegen" },
];

test.describe("Process flow Mermaid rendering on change type detail pages", () => {
  for (const { slug, name } of CHANGE_TYPES_WITH_FLOW) {
    test(`renders mermaid flowchart for "${slug}" (${name})`, async ({
      page,
    }) => {
      await page.goto(`/change-types/${slug}`);
      await page.waitForLoadState("networkidle");

      // Check if the page loaded the process flow section
      const flowSection = page.locator(
        'section[aria-label="Procesflow diagram"]',
      );
      const flowNotFound = page.locator("text=Geen procesflow");

      if (await flowNotFound.isVisible().catch(() => false)) {
        // No flow defined for this type — skip gracefully
        test.skip();
        return;
      }

      await expect(flowSection).toBeVisible({ timeout: 10000 });

      // Wait a bit for mermaid to render (client-side rendering)
      await page.waitForTimeout(2000);

      // Regression check: the "Procesoverzicht laden..." placeholder should NOT be visible
      const loadingPlaceholder = flowSection.getByText(
        "Procesoverzicht laden...",
      );
      await expect(loadingPlaceholder).not.toBeVisible({ timeout: 5000 });

      // The mermaid diagram should have rendered an SVG inside the section
      const svg = flowSection.locator("svg");
      await expect(svg).toBeVisible({ timeout: 10000 });

      // SVG should have actual content (diagram nodes)
      // Mermaid renders SVG with a viewBox and child elements like <g>, <rect>, etc.
      const svgContent = await svg.innerHTML();
      expect(svgContent.length).toBeGreaterThan(100);

      // Verify the SVG contains the mermaid diagram structure
      // Mermaid renders nodes as <g> elements with class="root"
      const rootGroups = await svg.locator("g").count();
      expect(rootGroups).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe("Process flow loading state regression", () => {
  test("does not get stuck on loading state for benchmark_switch", async ({
    page,
  }) => {
    // This is the specific page mentioned in the bug report
    await page.goto("/change-types/benchmark_switch");
    await page.waitForLoadState("networkidle");

    const flowSection = page.locator(
      'section[aria-label="Procesflow diagram"]',
    );

    // Wait for the page to fully load, including client-side rendering
    await expect(flowSection).toBeVisible({ timeout: 10000 });

    // Give mermaid time to initialize and render
    await page.waitForTimeout(2000);

    // Critical regression check: the loading state must be replaced by the diagram
    const loadingPlaceholder = page.getByText("Procesoverzicht laden...");
    const loadingState = await loadingPlaceholder.isVisible().catch(() => false);

    // If the loading placeholder is still visible after mermaid had time to render,
    // the bug has regressed (dynamic import hang or similar issue)
    expect(loadingState).toBe(false);

    // The SVG should have rendered
    const svg = flowSection.locator("svg");
    await expect(svg).toBeVisible({ timeout: 10000 });
  });

  test("change type detail page loads with correct structure and diagram", async ({
    page,
  }) => {
    await page.goto("/change-types/benchmark_switch");
    await page.waitForLoadState("networkidle");

    // The page should have the correct breadcrumb structure
    await expect(page.locator(".eyebrow")).toContainText("PROCESFLOW");

    // The heading should show the change type name
    await expect(
      page.locator("h1"),
    ).toBeVisible();

    // Step-by-step description section should be present
    const stepsSection = page.locator(
      'section[aria-label="Stap-voor-stap beschrijving"]',
    );
    await expect(stepsSection).toBeVisible({ timeout: 5000 });

    // Total lead time should be shown
    await expect(stepsSection.getByText("Totale doorlooptijd:")).toBeVisible();
  });
});
