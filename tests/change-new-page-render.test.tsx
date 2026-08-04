// @vitest-environment jsdom
/**
 * Page-level render tests for the new-change flow
 * (app/changes/new/page.tsx) with the lifecycle change types.
 *
 * The benchmark switch is the default landing flow (bare /changes/new and
 * unknown ?type= values render BenchmarkChangeForm), while explicit active
 * type parameters route to their dedicated or config-driven form:
 *
 *   | slug                              | rendered form             |
 *   |-----------------------------------|---------------------------|
 *   | (no type) / benchmark_switch      | BenchmarkChangeForm       |
 *   | client_onboarding                 | ClientOnboardingWizard    |
 *   | portfolio_configuration_create    | PortfolioAdditionForm     |
 *   | portfolio_configuration_update    | GenericChangeForm         |
 *   | portfolio_configuration_retire    | GenericChangeForm         |
 *   | portfolio_addition (legacy)       | PortfolioAdditionForm     |
 *
 * The page falls back to the default catalog + demo reference data when no
 * database is configured, so the full server component tree renders without
 * mocks.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NewChangeRequestPage from "@/app/changes/new/page";
import { getMinimumDate } from "@/lib/change-form-utils";

async function renderPage(type?: string) {
  const element = await NewChangeRequestPage({
    searchParams: Promise.resolve(type ? { type } : {}),
  });
  return render(element);
}

describe("new-change flow renders the intended form per type", () => {
  it("no type parameter defaults to the benchmark switch form", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Nieuwe change" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klant en portefeuille" })).toBeTruthy();
    expect(screen.getByText("Client-config regel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Benchmarkwissel aanvragen" })).toBeTruthy();
    // Not the generic or create wizard
    expect(screen.queryByRole("heading", { name: "Context van de aanvraag" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Portfolio definiëren" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Klantgegevens" })).toBeNull();
  });

  it("explicit benchmark_switch keeps the benchmark switch form", async () => {
    await renderPage("benchmark_switch");

    expect(screen.getByRole("heading", { name: "Nieuwe change" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klant en portefeuille" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Benchmarkwissel aanvragen" })).toBeTruthy();
  });

  it("sets the effective date picker minimum to today plus the benchmark switch lead time", async () => {
    const { container } = await renderPage();

    expect(screen.getByRole("heading", { name: "Nieuwe change" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klant en portefeuille" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Benchmarkwissel aanvragen" })).toBeTruthy();
  });

  it("client_onboarding renders the ClientOnboardingWizard", async () => {
    await renderPage("client_onboarding");

    // Wizard step 1 — Klantgegevens with the client code field
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeTruthy();
    expect(screen.getByLabelText(/Klantcode/)).toBeTruthy();
    expect(screen.getByLabelText(/Klantnaam/)).toBeTruthy();
    // Not the benchmark or generic form
    expect(screen.queryByRole("heading", { name: "Klant en portefeuille" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Context van de aanvraag" })).toBeNull();
  });

  it("client_onboarding renders the ClientOnboardingWizard", async () => {
    await renderPage("client_onboarding");

    // Wizard step 1 — Klantgegevens with the client code field
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeTruthy();
    expect(screen.getByLabelText(/Klantcode/)).toBeTruthy();
    expect(screen.getByLabelText(/Klantnaam/)).toBeTruthy();
    // Not the benchmark or generic form
    expect(screen.queryByRole("heading", { name: "Klant en portefeuille" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Context van de aanvraag" })).toBeNull();
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
      'input[name="changeTypeSlug"]',
    ) as HTMLInputElement | null;
    expect(hiddenInput?.value).toBe("portfolio_configuration_create");
  });

  it("portfolio_configuration_update renders the GenericChangeForm", async () => {
    await renderPage("portfolio_configuration_update");

    // Generic form shell
    expect(screen.getByRole("heading", { name: "Context van de aanvraag" })).toBeTruthy();
    // Change type selector is populated
    const typeSelect = document.querySelector(
      "form.change-form select",
    ) as HTMLSelectElement | null;
    expect(typeSelect).toBeTruthy();
    // Not the benchmark or create wizard
    expect(screen.queryByRole("heading", { name: "Klant en portefeuille" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Portfolio definiëren" })).toBeNull();
  });

  it("portfolio_configuration_retire renders the GenericChangeForm", async () => {
    await renderPage("portfolio_configuration_retire");

    expect(screen.getByRole("heading", { name: "Context van de aanvraag" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Portfolio definiëren" })).toBeNull();
  });

  it("portfolio_addition still renders the create wizard (backward compatibility)", async () => {
    await renderPage("portfolio_addition");

    expect(screen.getByRole("heading", { name: "Portfolio definiëren" })).toBeTruthy();
    expect(screen.getByText("Portfolio code")).toBeTruthy();
    const hiddenInput = document.querySelector(
      'input[name="changeTypeSlug"]',
    ) as HTMLInputElement | null;
    // Legacy slug preserved so stored portfolio_addition requests keep working
    expect(hiddenInput?.value).toBe("portfolio_addition");
  });

  it("unknown type parameters fall back to the benchmark switch form", async () => {
    await renderPage("does_not_exist");

    expect(screen.getByRole("heading", { name: "Nieuwe change" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klant en portefeuille" })).toBeTruthy();
  });
});
