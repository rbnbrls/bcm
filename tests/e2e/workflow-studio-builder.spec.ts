import { expect, test } from "@playwright/test";
import { identitySessionCookie } from "./identity-session";

test.describe("Workflow Studio G2 builderflow — DB-backed", { tag: "@db" }, () => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for the Workflow Studio builder-E2E.");

  test("create → configure → simulate → review → publish", async ({ page }) => {
    const identity = identitySessionCookie("change_manager");
    await page.context().addCookies([{ ...identity, url: "http://localhost:3000" }]);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = `E2E benchmarkworkflow ${suffix}`;
    const slug = `e2e-benchmark-${suffix}`.toLowerCase();

    await page.goto("/workflow-studio/new");
    await expect(page.getByRole("heading", { name: "Nieuwe workflow" })).toBeVisible();
    await page.getByLabel("Naam").fill(name);
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Procesbasis").selectOption("builtin:benchmark_switch");
    await page.getByRole("button", { name: "Draft aanmaken" }).click();
    await page.waitForURL(/\/workflow-studio\/[0-9a-f-]{36}\/edit$/);

    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.locator(".workflow-editor-outline")).toContainText("apply_change");

    const metadata = page.locator(".workflow-metadata-form");
    await metadata.locator('textarea[name="catalogDescription"]').fill(`G2-publicatie ${suffix} voor een gecontroleerde benchmarkwissel.`);
    await metadata.getByRole("button", { name: "Metadata opslaan" }).click();
    await expect(metadata.getByRole("status")).toContainText("Metadata opgeslagen");

    await page.locator(".workflow-path-simulator > summary").click();
    const simulator = page.locator(".workflow-path-simulator");
    for (const select of await simulator.locator("fieldset select").all()) {
      const values = await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean));
      if (values[0]) await select.selectOption(values[0]);
    }
    for (const input of await simulator.locator('fieldset input:not([type="checkbox"])').all()) {
      const type = await input.getAttribute("type");
      await input.fill(type === "date" ? "2026-12-01" : type === "number" ? "1" : "e2e_fixture");
    }
    await simulator.getByRole("button", { name: "Simulatie uitvoeren" }).click();
    await expect(simulator.getByText("Pad voltooid")).toBeVisible();
    await expect(simulator.getByRole("heading", { name: "Verwachte intents" })).toBeVisible();

    const review = page.locator(".workflow-review-panel");
    const warningConfirmation = page.locator('.workflow-warning-acknowledgement input[type="checkbox"]');
    if (await warningConfirmation.count()) await warningConfirmation.check();
    await review.getByLabel("Reviewnotitie").fill(`G2-review ${suffix}: configuratie en simulatie akkoord.`);
    await review.getByRole("button", { name: "Ter review aanbieden" }).click();
    await expect(review).toContainText("Revisie ter review aangeboden");
    await review.getByRole("button", { name: "Goedkeuren" }).click();
    await expect(review).toContainText("Revisie goedgekeurd");
    await review.getByRole("button", { name: "Publiceren" }).click();
    await expect(review).toContainText("onveranderbaar gepubliceerd");
    await expect(review.locator("code")).toContainText("SHA-256");

    await page.goto("/change-catalog");
    const publishedTemplate = page.locator(".catalog-list article").filter({ hasText: name });
    await expect(publishedTemplate).toBeVisible();
    await expect(publishedTemplate.locator("code")).toContainText("sha256:");
  });
});
