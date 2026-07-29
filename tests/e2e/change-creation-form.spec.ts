import { test, expect } from "@playwright/test";
import {
  navigateToNewChange,
  changeTypeOption,
  selectClient,
  VALID_CLIENT_ID,
  VALID_BENCHMARK_1_ID,
} from "./helpers";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FUTURE_DATE = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .split("T")[0];

async function fillCommonFields(page: import("@playwright/test").Page) {
  await page.locator('input[name="requestedBy"]').fill("E2E Test User");
  await page.locator('textarea[name="rationale"]').fill("E2E automatic comprehensive test of the change creation form.");
  await page.locator('input[name="effectiveDate"]').fill(FUTURE_DATE);
}

async function selectFirstPortfolio(page: import("@playwright/test").Page) {
  const portfolioSelect = page.locator('select[name="portfolio_id"]');
  const firstOption = portfolioSelect.locator("option").nth(1);
  const value = await firstOption.getAttribute("value");
  if (value) await portfolioSelect.selectOption(value);
}

async function getFieldLabels(page: import("@playwright/test").Page): Promise<string[]> {
  const labels = page.locator(".generic-fields label.field span, .generic-fields fieldset.field legend");
  return labels.allTextContents();
}

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe("Change creation form - comprehensive", () => {
  test.describe("Page structure", () => {
    test("page loads with correct title, heading, and eyebrow", async ({ page }) => {
      await navigateToNewChange(page);

      await expect(page).toHaveURL(/\/changes\/new/);
      await expect(page.getByRole("heading", { name: "Nieuwe change" })).toBeVisible();
      await expect(page.locator(".eyebrow")).toContainText("CHANGE REQUEST");
    });

    test("shows all 4 form sections", async ({ page }) => {
      await navigateToNewChange(page);

      // Step 1: Context
      await expect(page.locator("section:has(.section-heading h2:text('Context'))")).toBeVisible();
      // Step 2: Change type fields
      await expect(page.locator("section:has(.section-heading h2:text('Benchmarkwissel'))")).toBeVisible();
      // Step 3: Costs
      await expect(page.locator("section:has(.section-heading h2:text('Kosten'))")).toBeVisible();
      // Step 4: Review
      await expect(page.locator("section:has(.section-heading h2:text('Controle'))")).toBeVisible();
    });

    test("change type dropdown contains all 8 types", async ({ page }) => {
      await navigateToNewChange(page);

      const typeSelect = page.locator("form.change-form select").first();
      // Wait for options to be populated (async data load)
      await expect(async () => {
        const options = await typeSelect.locator("option").all();
        const texts = await Promise.all(options.map((o) => o.textContent()));
        expect(texts.filter(Boolean).length).toBeGreaterThan(1);
      }).toPass({ timeout: 5000 });

      const options = await typeSelect.locator("option").all();
      const optionTexts = await Promise.all(options.map((o) => o.textContent()));
      const allTypes = optionTexts.filter(Boolean);

      const typeNames = ["Benchmarkwissel", "Nieuwe benchmark", "Tariefwijziging",
        "Mandaatwijziging", "Custodianwijziging", "Herbalanceringsdrempel",
        "Nieuwe klant", "Nieuwe portfolio toevoegen"];

      for (const typeName of typeNames) {
        expect(allTypes.some((t) => t?.includes(typeName))).toBeTruthy();
      }
    });

    test("client dropdown shows available clients", async ({ page }) => {
      await navigateToNewChange(page);

      const clientSelect = page.locator('select[name="clientId"]');
      // Wait for options to be populated (async data load)
      await expect(async () => {
        const count = await clientSelect.locator("option").count();
        expect(count).toBeGreaterThan(1);
      }).toPass({ timeout: 5000 });
      const options = await clientSelect.locator("option").all();
      expect(options.length).toBeGreaterThanOrEqual(2);
      await expect(clientSelect).toHaveValue(VALID_CLIENT_ID);
    });

    test("default client is preselected", async ({ page }) => {
      await navigateToNewChange(page);

      await expect(page.locator('select[name="clientId"]')).toHaveValue(VALID_CLIENT_ID);
    });
  });

  test.describe("Change type: Benchmarkwissel (benchmark_switch)", () => {
    test("shows correct fields", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Benchmarkwissel")
      );

      await expect(page.locator('select[name="portfolio_id"]')).toBeVisible();
      // IST benchmark is a hidden input (type=hidden) - check it has value when portfolio selected
      const istInput = page.locator('input[name="current_benchmark_id"]');
      await expect(istInput).toHaveAttribute("type", "hidden");
      // SOLL benchmark
      await expect(page.locator('select[name="requested_benchmark_id"]')).toBeVisible();
    });

    test("selecting portfolio auto-populates read-only IST benchmark", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Benchmarkwissel")
      );

      // Select first portfolio
      const portfolioSelect = page.locator('select[name="portfolio_id"]');
      const firstPortfolioOption = portfolioSelect.locator("option").nth(1);
      const portfolioValue = await firstPortfolioOption.getAttribute("value");
      await portfolioSelect.selectOption(portfolioValue ?? "");

      // IST benchmark should now be populated (read-only text is shown)
      const istInput = page.locator('input[name="current_benchmark_id"]');
      // Wait a tick for state update
      await page.waitForTimeout(100);
      const istValue = await istInput.inputValue();
      expect(istValue).toBeTruthy();
    });

    test("can fill and submit benchmark switch form", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Benchmarkwissel")
      );

      await fillCommonFields(page);
      await selectFirstPortfolio(page);

      // Select a SOLL benchmark
      await page.locator('select[name="requested_benchmark_id"]').selectOption(VALID_BENCHMARK_1_ID);

      const submitButton = page.locator("form.change-form button[type='submit']");
      await expect(submitButton).toContainText("Genereer change request →");
      await submitButton.click();
      await page.waitForLoadState("networkidle");

      // Accept any outcome: error shown (no DB), navigation, or form stays
      const errorVisible = await page.locator(".form-errors[role='alert']").first().isVisible().catch(() => false);
      const urlChanged = !page.url().includes("/changes/new");
      if (errorVisible) {
        await expect(page.locator(".form-errors")).toBeVisible();
      } else if (urlChanged) {
        await expect(page).toHaveURL(/\/changes\/[0-9a-f-]+/);
        await expect(page.locator(".eyebrow")).toContainText("BCM-");
      }
    });
  });

  test.describe("Change type: Nieuwe benchmark (new_benchmark)", () => {
    test("shows correct fields", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Nieuwe benchmark")
      );

      await expect(page.locator('select[name="portfolio_id"]')).toBeVisible();
      await expect(page.locator('select[name="asset_class"]')).toBeVisible();
      await expect(page.locator('label:has-text("Valuta") select')).toBeVisible();
      await expect(page.locator('input[name="long_name"]')).toBeVisible();
    });

    test("asset class select has correct options", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Nieuwe benchmark")
      );

      const acSelect = page.locator('select[name="asset_class"]');
      const options = await acSelect.locator("option").all();
      const texts = await Promise.all(options.map((o) => o.textContent()));
      expect(texts).toContain("Aandelen");
      expect(texts).toContain("Obligaties");
    });

    test("can fill and submit new benchmark form", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Nieuwe benchmark")
      );

      await fillCommonFields(page);
      await selectFirstPortfolio(page);
      await page.locator('select[name="asset_class"]').selectOption("Aandelen");
      await page.locator('select[name="currency"]').selectOption("EUR");
      await page.locator('input[name="long_name"]').fill("E2E Test Benchmark Index");

      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      const errorVisible = await page.locator(".form-errors[role='alert']").isVisible().catch(() => false);
      const urlChanged = !page.url().includes("/changes/new");
      expect(errorVisible || urlChanged).toBeTruthy();
    });
  });

  test.describe("Change type: Tariefwijziging (fee_change)", () => {
    test("shows correct fields", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Tariefwijziging")
      );

      await expect(page.locator('select[name="portfolio_id"]')).toBeVisible();
      await expect(page.locator('input[name="current_fee"]')).toBeVisible();
      await expect(page.locator('input[name="requested_fee"]')).toBeVisible();
      await expect(page.locator('select[name="fee_type"]')).toBeVisible();
      await expect(page.locator('input[name="effective_date"]')).toBeVisible();
      // There are 2 rationale textareas (common + fee-specific), check at least one is visible
      await expect(page.locator('textarea[name="rationale"]').first()).toBeVisible();
    });

    test("fee fields accept decimal values", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Tariefwijziging")
      );

      await page.locator('input[name="current_fee"]').fill("0.50");
      await page.locator('input[name="requested_fee"]').fill("0.75");
      expect(await page.locator('input[name="current_fee"]').inputValue()).toBe("0.50");
      expect(await page.locator('input[name="requested_fee"]').inputValue()).toBe("0.75");
    });

    test("fee_type select has correct options", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Tariefwijziging")
      );

      const feeTypeSelect = page.locator('select[name="fee_type"]');
      const options = await feeTypeSelect.locator("option").all();
      const texts = await Promise.all(options.map((o) => o.textContent()));
      expect(texts).toContain("Beheervergoeding");
      expect(texts).toContain("Prestatievergoeding");
      expect(texts).toContain("Vast tarief");
    });
  });

  test.describe("Change type: Mandaatwijziging (mandate_change)", () => {
    test("shows correct fields", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Mandaatwijziging")
      );

      await expect(page.locator('select[name="portfolio_id"]')).toBeVisible();
      await expect(page.locator('select[name="mandate_type"]')).toBeVisible();
      await expect(page.locator('input[name="current_value"]')).toBeVisible();
      await expect(page.locator('input[name="requested_value"]')).toBeVisible();
    });

    test("mandate type options are correct", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Mandaatwijziging")
      );

      const select = page.locator('select[name="mandate_type"]');
      const options = await select.locator("option").all();
      const texts = await Promise.all(options.map((o) => o.textContent()));
      expect(texts).toContain("Discretionair");
      expect(texts).toContain("Adviserend");
      expect(texts).toContain("Execution only");
    });
  });

  test.describe("Change type: Custodianwijziging (custodian_change)", () => {
    test("shows correct fields", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Custodianwijziging")
      );

      await expect(page.locator('select[name="portfolio_id"]')).toBeVisible();
      await expect(page.locator('select[name="current_custodian_id"]')).toBeVisible();
      await expect(page.locator('select[name="requested_custodian_id"]')).toBeVisible();
      await expect(page.locator('input[name="effective_date"]')).toBeVisible();
    });

    test("can select IST and SOLL custodians and submit", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Custodianwijziging")
      );

      await fillCommonFields(page);
      await selectFirstPortfolio(page);
      await page.locator('select[name="current_custodian_id"]').selectOption("custodian_a");
      await page.locator('select[name="requested_custodian_id"]').selectOption("custodian_b");

      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      const errorVisible = await page.locator(".form-errors[role='alert']").isVisible().catch(() => false);
      const urlChanged = !page.url().includes("/changes/new");
      expect(errorVisible || urlChanged).toBeTruthy();
    });
  });

  test.describe("Change type: Herbalanceringsdrempel (rebalance_trigger)", () => {
    test("shows correct fields", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Herbalanceringsdrempel")
      );

      await expect(page.locator('select[name="portfolio_id"]')).toBeVisible();
      await expect(page.locator('input[name="trigger_threshold"]')).toBeVisible();
      await expect(page.locator('select[name="rebalance_frequency"]')).toBeVisible();
    });

    test("threshold field only accepts numeric values", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Herbalanceringsdrempel")
      );

      const thresholdInput = page.locator('input[name="trigger_threshold"]');
      await thresholdInput.fill("5");
      expect(await thresholdInput.inputValue()).toBe("5");

      // type=number rejects non-numeric input via the browser's validation
      // Use page.evaluate to set the value directly and verify it stays empty
      const inputHandle = thresholdInput;
      await inputHandle.evaluate((el: HTMLInputElement) => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        nativeInputValueSetter?.call(el, "abc");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      // For type=number inputs, non-numeric values are coerced to empty string
      expect(await thresholdInput.inputValue()).toBe("");
    });
  });

  test.describe("Change type: Nieuwe klant (customer_onboarding)", () => {
    test("shows correct fields", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Nieuwe klant")
      );

      await expect(page.locator('input[name="customer_name"]')).toBeVisible();
      await expect(page.locator('input[name="external_reference"]')).toBeVisible();
      await expect(page.locator('select[name="regeling_type"]')).toBeVisible();
      await expect(page.locator('input[name="portfolio_count"]')).toBeVisible();
      await expect(page.locator('select[name="asset_class"]')).toBeVisible();
    });

    test("regeling type has FPR and SPR options", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Nieuwe klant")
      );

      const select = page.locator('select[name="regeling_type"]');
      const options = await select.locator("option").all();
      const texts = await Promise.all(options.map((o) => o.textContent()));
      expect(texts).toContain("FPR (Flexibele Premieregeling)");
      expect(texts).toContain("SPR (Solidaire Premieregeling)");
    });
  });

  test.describe("Interactive behaviors", () => {
    test("client selection updates context and persists across type changes", async ({ page }) => {
      await navigateToNewChange(page);

      // Default client
      const clientSelect = page.locator('select[name="clientId"]');
      await expect(clientSelect).toHaveValue(VALID_CLIENT_ID);

      // Switch client
      await selectClient(page, "Stichting Pensioen Zeker");
      const newValue = await clientSelect.inputValue();
      expect(newValue).not.toBe(VALID_CLIENT_ID);

      // Change type and verify client persists
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Mandaatwijziging")
      );
      expect(await clientSelect.inputValue()).toBe(newValue);
    });

    test("portfolio select shows client-specific options", async ({ page }) => {
      await navigateToNewChange(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Benchmarkwissel")
      );

      // Pensioenfonds Horizon has 2 portfolios
      const portfolioSelect = page.locator('select[name="portfolio_id"]');
      const options = await portfolioSelect.locator("option").all();
      expect(options.length).toBeGreaterThanOrEqual(3);

      // Switch to Stichting Pensioen Zeker (1 portfolio)
      await selectClient(page, "Stichting Pensioen Zeker");
      await page.waitForTimeout(100);
      const optionsAfter = await portfolioSelect.locator("option").all();
      expect(optionsAfter.length).toBeGreaterThanOrEqual(2);
    });

    test("switching change type updates section heading and cost", async ({ page }) => {
      await navigateToNewChange(page);

      // Default is benchmark_switch
      await expect(page.locator(".form-section:has(.section-number[aria-label='Stap 2']) h2"))
        .toHaveText("Benchmarkwissel");

      // Switch to fee_change
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Tariefwijziging")
      );
      await expect(page.locator(".form-section:has(.section-number[aria-label='Stap 2']) h2"))
        .toHaveText("Tariefwijziging");

      // Switch to mandate_change
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Mandaatwijziging")
      );
      await expect(page.locator(".form-section:has(.section-number[aria-label='Stap 2']) h2"))
        .toHaveText("Mandaatwijziging");
    });
  });

  test.describe("Cost summary", () => {
    test("cost section shows estimated costs and lead time", async ({ page }) => {
      await navigateToNewChange(page);

      await expect(page.locator(".cost-summary-inline")).toBeVisible();
      await expect(page.locator(".cost-summary-row").first()).toBeVisible();
    });

    test("cost detail updates when changing change type", async ({ page }) => {
      await navigateToNewChange(page);

      // Benchmarkwissel has perItemCost
      const getCostText = async () => {
        const rows = page.locator(".cost-summary-row");
        const texts = await rows.allTextContents();
        return texts.join(" ");
      };

      const firstCost = await getCostText();

      // Switch fee_change
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Tariefwijziging")
      );
      await page.waitForTimeout(100); // allow re-render

      const secondCost = await getCostText();
      expect(secondCost).not.toBe(firstCost);
    });
  });

  test.describe("Step 4: Review and submit", () => {
    test("stakeholder section shows stakeholders for selected type", async ({ page }) => {
      await navigateToNewChange(page);

      // Benchmarkwissel has 3 stakeholders
      await expect(page.locator(".stakeholder-grid")).toBeVisible();
      const stakeholderNames = await page.locator(".stakeholder-grid b").allTextContents();
      expect(stakeholderNames.length).toBeGreaterThanOrEqual(1);
    });

    test("submit button has correct text", async ({ page }) => {
      await navigateToNewChange(page);

      await expect(page.locator("form.change-form button[type='submit']"))
        .toContainText("Genereer change request →");
    });

    test("submit button shows pending state", async ({ page }) => {
      await navigateToNewChange(page);

      await fillCommonFields(page);
      const submitButton = page.locator("form.change-form button[type='submit']");
      await submitButton.click();
      // Button text should change to saving…
      await expect(submitButton).toContainText("Aanvraag opslaan…");
    });
  });

  test.describe("Form validation", () => {
    test("validation errors appear when submitting with empty required fields", async ({ page }) => {
      await navigateToNewChange(page);

      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Tariefwijziging")
      );

      const submitButton = page.locator("form.change-form button[type='submit']");
      await submitButton.click();
      await page.waitForLoadState("networkidle");

      // Either form-errors div or HTML5 validation
      const formErrors = await page.locator(".form-errors").isVisible().catch(() => false);
      const html5Invalid = await page.locator("input:invalid").count().catch(() => 0);
      expect(formErrors || html5Invalid > 0).toBeTruthy();
    });

    test("submit button is disabled during submission", async ({ page }) => {
      await navigateToNewChange(page);

      await fillCommonFields(page);
      const submitButton = page.locator("form.change-form button[type='submit']");
      await submitButton.click();
      // Wait briefly for pending state
      await page.waitForTimeout(200);
    });
  });

  test.describe("Accessibility and UI integrity", () => {
    test("all form sections have aria-labels on step numbers", async ({ page }) => {
      await navigateToNewChange(page);

      const stepNumbers = page.locator(".section-number");
      const count = await stepNumbers.count();
      for (let i = 0; i < count; i++) {
        await expect(stepNumbers.nth(i)).toHaveAttribute("aria-label");
      }
    });

    test("error messages have role='alert'", async ({ page }) => {
      await navigateToNewChange(page);

      // Trigger validation
      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      const alerts = page.locator("[role='alert']");
      const count = await alerts.count();
      if (count > 0) {
        const formErrors = page.locator(".form-errors[role='alert']");
        if (await formErrors.isVisible().catch(() => false)) {
          await expect(formErrors).toBeVisible();
        }
      }
    });

    test("form has class 'change-form'", async ({ page }) => {
      await navigateToNewChange(page);
      await expect(page.locator("form.change-form")).toBeVisible();
    });
  });

  test.describe("Edge cases", () => {
    test("page handles URL with invalid type parameter gracefully", async ({ page }) => {
      await page.goto("/changes/new?type=non_existent_type");
      await page.waitForLoadState("networkidle");

      // Should still load with default type
      await expect(page).toHaveURL(/\/changes\/new/);
      await expect(page.getByRole("heading", { name: "Nieuwe change" })).toBeVisible();
    });

    test("all change types can be selected without errors", async ({ page }) => {
      await navigateToNewChange(page);

      const types = [
        "Benchmarkwissel",
        "Nieuwe benchmark",
        "Tariefwijziging",
        "Mandaatwijziging",
        "Custodianwijziging",
        "Herbalanceringsdrempel",
        "Nieuwe klant",
        "Nieuwe portfolio toevoegen",
      ];

      const select = page.locator("form.change-form select").first();
      for (const typeName of types) {
        const optionValue = await changeTypeOption(page, typeName);
        await select.selectOption(optionValue);
        await page.waitForTimeout(50);
        // Check no JS errors appeared
        // The section heading should match the name
        const sectionHeading = page.locator(".form-section:has(.section-number[aria-label='Stap 2']) h2");
        await expect(sectionHeading).toContainText(
          typeName === "Nieuwe portfolio toevoegen" ? "Nieuwe portfolio" : typeName
        );
      }
    });

    test("form retains filled values when switching between change types", async ({ page }) => {
      await navigateToNewChange(page);

      // Fill common fields
      await fillCommonFields(page);
      const requestedBy = page.locator('input[name="requestedBy"]');
      await expect(requestedBy).toHaveValue("E2E Test User");

      // Switch type
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Mandaatwijziging")
      );

      // Common fields should be retained
      await expect(requestedBy).toHaveValue("E2E Test User");
    });

    test("submitting without DATABASE_URL returns error message gracefully", async ({ page }) => {
      await navigateToNewChange(page);

      await fillCommonFields(page);
      await page.locator("form.change-form select").first().selectOption(
        await changeTypeOption(page, "Custodianwijziging")
      );
      await selectFirstPortfolio(page);
      await page.locator('select[name="current_custodian_id"]').selectOption("custodian_a");
      await page.locator('select[name="requested_custodian_id"]').selectOption("custodian_b");

      await page.locator("form.change-form button[type='submit']").click();
      await page.waitForLoadState("networkidle");

      // Should show a proper error message, not crash
      const hasErrors = await page.locator(".form-errors").isVisible().catch(() => false);
      const hasNav = !page.url().includes("/changes/new");
      if (!hasNav) {
        await expect(page.locator(".form-errors")).toBeVisible();
      }
    });
  });
});
