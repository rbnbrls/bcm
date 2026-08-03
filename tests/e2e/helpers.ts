import { type Page, expect } from "@playwright/test";

// ── Demo fixture data constants ──────────────────────────────────────────────

export const DEMO_CLIENT_NAME = "Pensioenfonds Horizon";
export const VALID_BENCHMARK_1_ID = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1"; // MSCI-World-NR
export const VALID_BENCHMARK_2_ID = "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d"; // MSCI-ACWI-NR
export const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

// ── Accordion helpers ─────────────────────────────────────────────────────────

/**
 * Expand an accordion category on the dashboard by its title text.
 * The accordion panels start collapsed; the header must be clicked first
 * to make the action links interactive.
 */
export async function expandCategory(page: Page, titleText: string) {
  const header = page.locator(".main-category-header").filter({ hasText: titleText });
  await header.click();
  // Wait for the panel to become visible (animation + hidden removal)
  const panelId = await header.getAttribute("aria-controls");
  await expect(page.locator(`#${panelId}`)).toBeVisible();
}

// ── Navigation helpers ───────────────────────────────────────────────────────

export async function navigateToNewChange(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Expand the "Nieuwe change" accordion section so its action links are visible
  await expandCategory(page, "Nieuwe change");

  // Click the link to navigate to the new change form
  await page.click('a[href="/changes/new"]');
  await page.waitForURL("**/changes/new");
}

export async function navigateToBenchmarkSwitch(page: Page) {
  await page.goto("/");
  await expandCategory(page, "Nieuwe change");
  await page.click('a[href="/changes/new"]');
  await page.waitForURL("**/changes/new");
}

export async function navigateToCatalog(page: Page) {
  await page.goto("/");
  await expandCategory(page, "Nieuwe change");
  await page.click('a[href="/benchmarks"]');
  await page.waitForURL("**/benchmarks");
}

export async function navigateToNewBenchmarkRequest(page: Page) {
  await page.goto("/");
  await expandCategory(page, "Nieuwe change");
  await page.click('a[href="/benchmark-aanvraag"]');
  await page.waitForURL("**/benchmark-aanvraag");
}

// ── Form interaction helpers ─────────────────────────────────────────────────

/**
 * Find the change type option value by matching its label text.
 * Options in the DOM have format "{name} — {description}".
 */
export async function changeTypeOption(page: Page, changeTypeName: string): Promise<string> {
  const select = page.locator("form.change-form select").first();
  const option = select.locator("option").filter({ hasText: changeTypeName }).first();
  return (await option.getAttribute("value")) ?? "";
}

/**
 * Select a client from the clientId select by matching option text.
 * Options in the DOM have format "{name} · {externalReference}" (e.g. "Pensioenfonds Horizon · PF-HOR-001").
 * This helper finds the option whose text contains the given string.
 */
export async function selectClient(page: Page, clientName: string) {
  const select = page.locator('select[name="clientId"]');
  const option = select.locator(`option`).filter({ hasText: clientName }).first();
  const value = await option.getAttribute("value");
  await select.selectOption(value ?? "");
}

/**
 * Fill form fields by `name` attribute.
 * Supports `input[name="..."]` and `textarea[name="..."]`.
 */
export async function fillFormFields(
  page: Page,
  fields: Record<string, string>,
) {
  for (const [name, value] of Object.entries(fields)) {
    const input = page.locator(`input[name="${name}"]`);
    const textarea = page.locator(`textarea[name="${name}"]`);
    const select = page.locator(`select[name="${name}"]`);
    if ((await input.count()) > 0) {
      await input.fill(value);
    } else if ((await textarea.count()) > 0) {
      await textarea.fill(value);
    } else if ((await select.count()) > 0) {
      await select.selectOption(value);
    }
  }
}

/**
 * Click the submit button of the change form and wait for navigation or a success indicator.
 * Uses `.change-form button[type="submit"]` to avoid conflict with other form buttons on the page.
 */
export async function submitForm(page: Page) {
  await page.click("form.change-form button[type='submit']");
  await page.waitForLoadState("networkidle");
  try {
    await page.waitForURL("**/changes/**", { timeout: 10000 });
  } catch {
    await page.waitForLoadState("networkidle");
  }
}

// ── Hydration-safe wizard fills ──────────────────────────────────────────────

/**
 * Fill the wizard's portfolio-code field ("Bijv. ADP") and keep re-applying
 * until the value survives React hydration.
 *
 * On cold dev-server loads (first e2e run in CI), the first fill of a
 * controlled field can land before React hydration completes; hydration then
 * resets the field to its server-rendered value, silently discarding the
 * edit. The wizard gates "Volgende →" on `portfolioCode`, so a lost fill
 * leaves the button disabled and the test times out clicking it (CI #508
 * flake: portfolio-addition.spec.ts and portfolio-config-lifecycle.spec.ts).
 *
 * The form mirrors every field into a hidden `<input name="portfolioCode">`,
 * which only updates once React owns the form — asserting the mirror is a
 * deterministic "hydration done and value stuck" signal. Re-applying after
 * hydration sticks, so the loop self-heals; in the warm case it exits after
 * the first fill.
 */
export async function fillWizardPortfolioCode(page: Page, value: string) {
  const input = page.locator('input[placeholder="Bijv. ADP"]');
  await expect(async () => {
    await input.fill(value);
    await expect(page.locator('input[name="portfolioCode"]')).toHaveValue(value);
  }).toPass({ timeout: 15_000 });
}
