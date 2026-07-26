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
  test("accordion headers and action links are keyboard-focusable", async ({ page: p }) => {
    await p.goto("/");
    await p.waitForLoadState("networkidle");
    // Start from body and tab until we reach the first accordion header
    await p.locator("body").focus();
    // Tab multiple times to reach the first accordion header
    const firstHeader = p.locator(".main-category-header").first();
    for (let i = 0; i < 10; i++) {
      await p.keyboard.press("Tab");
      const isFocused = await firstHeader.evaluate(
        (el) => el === document.activeElement
      );
      if (isFocused) break;
    }
    await expect(firstHeader).toBeFocused();
  });
});
