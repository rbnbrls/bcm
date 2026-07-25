import { type Page, expect } from "@playwright/test";

// ── Demo fixture data constants ──────────────────────────────────────────────

export const DEMO_CLIENT_NAME = "Pensioenfonds Horizon";
export const DEMO_PORTFOLIO_NAME = "Rendementsportefeuille";

export const VALID_BENCHMARK_1_ID = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1"; // MSCI-World-NR
export const VALID_BENCHMARK_2_ID = "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d"; // MSCI-ACWI-NR
export const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

// ── Navigation helpers ───────────────────────────────────────────────────────

export async function navigateToBenchmarkSwitch(page: Page) {
  await page.goto("/");
  await page.click('a[href="/changes/new"]');
  await page.waitForURL("**/changes/new");
}

export async function navigateToCatalog(page: Page) {
  await page.goto("/");
  await page.click('a[href="/benchmarks"]');
  await page.waitForURL("**/benchmarks");
}

export async function navigateToNewBenchmarkRequest(page: Page) {
  await page.goto("/");
  await page.click('a[href="/benchmark-aanvraag"]');
  await page.waitForURL("**/benchmark-aanvraag");
}

// ── Form interaction helpers ─────────────────────────────────────────────────

/**
 * Select a client from the first `<select>` element by matching option text.
 */
export async function selectClient(page: Page, clientName: string) {
  const select = page.locator("select").first();
  await select.selectOption({ label: clientName });
}

/**
 * Check the portfolio checkbox whose card contains the given name in a `<b>` tag.
 */
export async function selectPortfolio(page: Page, portfolioName: string) {
  const card = page.locator(".portfolio-card").filter({ hasText: portfolioName });
  await card.locator('input[type="checkbox"]').check();
}

/**
 * Select a SOLL benchmark for a given portfolio by its benchmark ID.
 * The SOLL select is the second select inside `.benchmark.soll` within the portfolio card.
 */
export async function setSOLLBenchmark(
  page: Page,
  portfolioName: string,
  benchmarkId: string,
) {
  const card = page.locator(".portfolio-card").filter({ hasText: portfolioName });
  const sollSelect = card.locator(".benchmark.soll select");
  await sollSelect.selectOption(benchmarkId);
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
    if ((await input.count()) > 0) {
      await input.fill(value);
    } else if ((await textarea.count()) > 0) {
      await textarea.fill(value);
    }
  }
}

/**
 * Click the submit button and wait for navigation or a success indicator.
 */
export async function submitForm(page: Page) {
  await page.click('button[type="submit"]');
  // Wait for either navigation to a detail page or appearance of a success element
  await Promise.race([
    page.waitForURL("**/changes/**"),
    page.waitForSelector(".change-request-detail, [role='alert'], .request-header", {
      timeout: 15000,
    }).catch(() => {}),
  ]);
}
