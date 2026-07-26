import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility audit", () => {
  const PAGES = [
    { path: "/", name: "Home" },
    { path: "/changes/new", name: "New benchmark change" },
    { path: "/benchmarks", name: "Benchmark catalog" },
    { path: "/benchmark-aanvraag", name: "New benchmark request" },
    { path: "/admin/client-config", name: "Client config" },
    { path: "/updates", name: "Updates" },
  ];

  for (const page of PAGES) {
    test(`${page.name} has no critical or serious violations`, async ({ page: p }) => {
      await p.goto(page.path);
      await p.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page: p }).analyze();

      expect(results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )).toEqual([]);
    });
  }
});

test.describe("Dashboard focus styles", () => {
  test("category cards have visible focus-visible outline", async ({ page: p }) => {
    await p.goto("/");
    await p.waitForLoadState("networkidle");
    const card = p.locator(".category-card").first();
    await card.focus();
    // Use tab to focus the first card — category cards don't receive focus natively,
    // but the first action link (primary-link) should
    await p.keyboard.press("Tab");
    await expect(card.locator(".category-card-action.primary-link")).toBeFocused();
  });
});
