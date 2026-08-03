// @vitest-environment jsdom
/**
 * Page-level render tests for the new-change flow
 * (app/changes/new/page.tsx) with the lifecycle change types.
 *
 * Verifies that opening /changes/new?type=<slug> routes to the intended
 * form for each of the four lifecycle change types, and that the legacy
 * portfolio_addition slug keeps rendering the create wizard (backward
 * compatibility):
 *
 *   | slug                              | rendered form             |
 *   |-----------------------------------|---------------------------|
 *   | client_onboarding                 | ClientOnboardingWizard    |
 *   | portfolio_configuration_create    | PortfolioAdditionForm     |
 *   | portfolio_configuration_update    | GenericChangeForm         |
 *   | portfolio_configuration_retire    | GenericChangeForm         |
 *   | portfolio_addition (legacy)       | PortfolioAdditionForm     |
 *   | (no type)                         | GenericChangeForm         |
 *
 * The page falls back to the default catalog + demo reference data when no
 * database is configured, so the full server component tree renders without
 * mocks.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import NewChangeRequestPage from "@/app/changes/new/page";

async function renderPage(type?: string) {
  const element = await NewChangeRequestPage({
    searchParams: Promise.resolve(type ? { type } : {}),
  });
  const view = render(element);
  return view;
}

describe("new-change flow renders the intended form per lifecycle type", () => {
  it("client_onboarding renders the ClientOnboardingWizard", async () => {
    await renderPage("client_onboarding");
    // Wizard step 1 — Klantgegevens with the client code field
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeTruthy();
    expect(screen.getByLabelText(/Klantcode/)).toBeTruthy();
    expect(screen.getByLabelText(/Klantnaam/)).toBeTruthy();
    // Not the create wizard / generic form
    expect(screen.queryByText("Externe referentie")).toBeNull();
  });

  it("portfolio_configuration_create renders the PortfolioAdditionForm create wizard", async () => {
    await renderPage("portfolio_configuration_create");
    // Create wizard step 1 — Portfolio definiëren with the client selector
    expect(screen.getByRole("heading", { name: "Portfolio definiëren" })).toBeTruthy();
    expect(screen.getByText("Portfolio code")).toBeTruthy();
    // Explicit client selection from client_config.client (demo fixtures HOR/ZEK)
    const clientSelect = screen.getByRole("combobox", { name: /Klant/ }) as HTMLSelectElement;
    const clientOptions = Array.from(clientSelect.options).map((o) => o.value);
    expect(clientOptions).toContain("HOR");
    expect(clientOptions).toContain("ZEK");
    // The hidden changeTypeSlug carries the lifecycle slug
    const hiddenInput = document.querySelector(
      'input[name="changeTypeSlug"]'
    ) as HTMLInputElement | null;
    expect(hiddenInput?.value).toBe("portfolio_configuration_create");
  });

  it("portfolio_configuration_update renders the GenericChangeForm with update fields", async () => {
    await renderPage("portfolio_configuration_update");
    // Generic form shell
    expect(
      screen.getByRole("heading", { name: "Context van de aanvraag" })
    ).toBeTruthy();
    // Update config fields (from the catalog) render on the generic form
    const fields = screen.getAllByText("Rekening (primary account id)");
    expect(fields.length).toBeGreaterThan(0);
    expect(screen.getByText("Benchmark (SOLL)")).toBeTruthy();
    expect(screen.getByText("NPC-classificatie (SOLL)")).toBeTruthy();
    expect(screen.getByText("Ingangsdatum wijziging")).toBeTruthy();
    // Not the create wizard
    expect(screen.queryByText("Externe referentie")).toBeNull();
  });

  it("portfolio_configuration_retire renders the GenericChangeForm with retire fields", async () => {
    await renderPage("portfolio_configuration_retire");
    expect(
      screen.getByRole("heading", { name: "Context van de aanvraag" })
    ).toBeTruthy();
    expect(screen.getByText("Rekening (primary account id)")).toBeTruthy();
    expect(screen.getByText("Reden beëindiging")).toBeTruthy();
    expect(screen.getByText("Einddatum")).toBeTruthy();
  });

  it("portfolio_addition still renders the create wizard (backward compatibility)", async () => {
    await renderPage("portfolio_addition");
    expect(screen.getByRole("heading", { name: "Portfolio definiëren" })).toBeTruthy();
    expect(screen.getByText("Portfolio code")).toBeTruthy();
    const hiddenInput = document.querySelector(
      'input[name="changeTypeSlug"]'
    ) as HTMLInputElement | null;
    // Legacy slug preserved so stored portfolio_addition requests keep working
    expect(hiddenInput?.value).toBe("portfolio_addition");
  });

  it("no type parameter falls back to the generic form", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "Context van de aanvraag" })
    ).toBeTruthy();
  });

  it("keeps the catalog select populated with all four lifecycle types", async () => {
    await renderPage("portfolio_configuration_update");
    const select = screen.getByRole("combobox", { name: /Change type/ });
    const options = within(select as HTMLElement).getAllByRole("option");
    const optionTexts = options.map((o) => o.textContent ?? "");
    expect(optionTexts.some((t) => t.startsWith("Nieuwe klant"))).toBe(true);
    expect(
      optionTexts.some((t) => t.startsWith("Portefeuilleconfiguratie toevoegen"))
    ).toBe(true);
    expect(
      optionTexts.some((t) => t.startsWith("Portefeuilleconfiguratie wijzigen"))
    ).toBe(true);
    expect(
      optionTexts.some((t) => t.startsWith("Portefeuilleconfiguratie beëindigen"))
    ).toBe(true);
    expect(optionTexts.some((t) => t.startsWith("Nieuwe portfolio toevoegen"))).toBe(
      true
    );
  });
});
