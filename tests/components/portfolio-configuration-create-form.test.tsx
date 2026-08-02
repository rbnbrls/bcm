// @vitest-environment jsdom
/**
 * Component tests for PortfolioConfigurationCreateForm.
 *
 * Verifies the acceptance criteria for the portfolio_configuration_create UI:
 *  - the form renders with all required fields (client, portfolio code, names,
 *    benchmark, asset class, sub asset class, manager, NPC classification,
 *    effective date, requester, rationale);
 *  - client selection is explicit (dropdown over client_config.client, NOT
 *    derived from the portfolio code prefix);
 *  - portfolio metadata is selectable (datalist of the selected client's
 *    active portfolios) and enterable;
 *  - the selected client code is submitted via the hidden `clientCode` field.
 *
 * Also guards the legacy path: PortfolioAdditionForm without requireClient
 * renders no client selector (backward compatibility).
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortfolioConfigurationCreateForm } from "@/components/portfolio-configuration-create-form";
import { PortfolioAdditionForm } from "@/components/portfolio-addition-form";
import {
  demoClientConfigClients,
  demoClientConfigPortfolios,
  demoClientConfigBenchmarks,
  demoClientConfigAssetClasses,
  demoClientConfigSubAssetClasses,
  demoClientConfigManagers,
  demoClientConfigNpcClassifications,
} from "@/lib/fixtures";

function renderCreateForm() {
  return render(
    <PortfolioConfigurationCreateForm
      clients={demoClientConfigClients}
      portfolios={demoClientConfigPortfolios}
      benchmarks={demoClientConfigBenchmarks}
      assetClasses={demoClientConfigAssetClasses}
      subAssetClasses={demoClientConfigSubAssetClasses}
      managers={demoClientConfigManagers}
      npcClassifications={demoClientConfigNpcClassifications}
    />
  );
}

describe("PortfolioConfigurationCreateForm", () => {
  it("renders all required fields on step 1", () => {
    renderCreateForm();

    // Explicit client selection dropdown
    const clientSelect = screen.getByLabelText(/Klant/) as HTMLSelectElement;
    expect(clientSelect).toBeTruthy();
    expect(clientSelect.required).toBe(true);

    // Portfolio metadata fields
    expect(screen.getByLabelText(/Portfolio code/)).toBeTruthy();
    expect(screen.getByLabelText(/Lange naam/)).toBeTruthy();
    expect(screen.getByLabelText(/Korte naam/)).toBeTruthy();
    expect(screen.getByLabelText(/Benchmark/)).toBeTruthy();

    // The wizard pins the change type slug
    const slugInput = document.querySelector(
      'input[name="changeTypeSlug"]'
    ) as HTMLInputElement | null;
    expect(slugInput?.value).toBe("portfolio_configuration_create");
  });

  it("populates the client dropdown from client_config.client reference data", () => {
    renderCreateForm();
    const clientSelect = screen.getByLabelText(/Klant/) as HTMLSelectElement;
    const options = Array.from(clientSelect.options).map((o) => o.textContent ?? "");
    expect(options.some((t) => t.includes("HOR") && t.includes("Pensioenfonds Horizon"))).toBe(true);
    expect(options.some((t) => t.includes("ZEK") && t.includes("Stichting Pensioen Zeker"))).toBe(true);
  });

  it("requires an explicit client before the user can continue", () => {
    renderCreateForm();
    const nextButton = screen.getByRole("button", { name: /Volgende/ });
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);

    // Selecting a client prefills the portfolio code with the client code
    fireEvent.change(screen.getByLabelText(/Klant/), { target: { value: "HOR" } });
    expect((screen.getByLabelText(/Portfolio code/) as HTMLInputElement).value).toBe("HOR");
    expect((nextButton as HTMLButtonElement).disabled).toBe(true); // other fields still empty

    // The hidden clientCode field is submitted once a client is selected
    const clientCodeInput = document.querySelector(
      'input[name="clientCode"]'
    ) as HTMLInputElement | null;
    expect(clientCodeInput?.value).toBe("HOR");
  });

  it("suggests the selected client's active, schema-valid portfolios and resets on client switch", () => {
    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/Klant/), { target: { value: "HOR" } });
    const datalist = document.querySelector(
      "datalist#portfolio-suggestions"
    ) as HTMLDataListElement | null;
    expect(datalist).toBeTruthy();
    // Only codes that pass the portfolio-code schema ([A-Z0-9]{2,15}) are
    // suggested — the dashed demo fixtures (HOR-RP, HOR-MP) are filtered out.
    const horSuggestions = Array.from(datalist?.options ?? []).map((o) => o.value);
    expect(horSuggestions).toContain("HORRP");
    expect(horSuggestions).not.toContain("HOR-RP");
    expect(horSuggestions).not.toContain("HOR-MP");
    expect(horSuggestions).not.toContain("ZEK-RET");

    // Switching client resets the portfolio code to the new client's prefix
    fireEvent.change(screen.getByLabelText(/Klant/), { target: { value: "ZEK" } });
    expect((screen.getByLabelText(/Portfolio code/) as HTMLInputElement).value).toBe("ZEK");
    // ZEK's only demo portfolio is dashed (ZEK-RET) → no valid suggestions remain
    const zekSuggestions = Array.from(datalist?.options ?? []).map((o) => o.value);
    expect(zekSuggestions).not.toContain("ZEK-RET");
    expect(zekSuggestions).toHaveLength(0);
  });

  it("collects every required field through the wizard steps", () => {
    renderCreateForm();

    // Step 1 — client, portfolio, names, benchmark
    fireEvent.change(screen.getByLabelText(/Klant/), { target: { value: "HOR" } });
    fireEvent.change(screen.getByLabelText(/Portfolio code/), { target: { value: "HOR-RP" } });
    fireEvent.change(screen.getByLabelText(/Lange naam/), { target: { value: "E2E Create Test Portfolio" } });
    fireEvent.change(screen.getByLabelText(/Korte naam/), { target: { value: "E2E-CREATE" } });
    fireEvent.change(screen.getByLabelText(/Benchmark/), { target: { value: "MSCI-WORLD-NR" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/ }));

    // Step 2 — asset class, sub asset class, manager
    fireEvent.change(screen.getByLabelText(/Asset class/), { target: { value: "EQUITIES" } });
    fireEvent.change(screen.getByLabelText(/Sub asset class/), { target: { value: "AC WORLD" } });
    fireEvent.change(screen.getByLabelText(/Manager/), { target: { value: "OWN" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/ }));

    // Step 3 — NPC classification
    fireEvent.change(screen.getByLabelText(/NPC classificatie/), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/ }));

    // Step 4 — requester, rationale, effective date (date picker) and submit
    fireEvent.change(screen.getByLabelText(/Aangevraagd door/), { target: { value: "E2E Test User" } });
    fireEvent.change(screen.getByLabelText(/Reden/), { target: { value: "E2E create flow — automated verification." } });
    const effectiveDate = screen.getByLabelText(/Ingangsdatum/) as HTMLInputElement;
    expect(effectiveDate.type).toBe("date");
    fireEvent.change(effectiveDate, { target: { value: "2026-12-01" } });

    // The summary shows the explicitly selected client
    expect(screen.getByText(/HOR — Pensioenfonds Horizon/)).toBeTruthy();

    // All hidden fields are populated for submission
    const hidden = (name: string) =>
      (document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;
    expect(hidden("clientCode")).toBe("HOR");
    expect(hidden("portfolioCode")).toBe("HOR-RP");
    expect(hidden("longName")).toBe("E2E Create Test Portfolio");
    expect(hidden("shortName")).toBe("E2E-CREATE");
    expect(hidden("benchmarkCode")).toBe("MSCI-WORLD-NR");
    expect(hidden("assetClass")).toBe("EQUITIES");
    expect(hidden("subAssetClass")).toBe("AC WORLD");
    expect(hidden("managerCode")).toBe("OWN");
    expect(hidden("npcClassificationId")).toBe("1");
    expect(hidden("requestedBy")).toBe("E2E Test User");
    expect(hidden("rationale")).toBe("E2E create flow — automated verification.");
    expect(hidden("effectiveDate")).toBe("2026-12-01");
    expect(hidden("changeTypeSlug")).toBe("portfolio_configuration_create");

    // Submit button rendered with the expected label
    expect(screen.getByRole("button", { name: "Change aanmaken" })).toBeTruthy();
  });
});

describe("PortfolioAdditionForm legacy backward compatibility", () => {
  it("renders no client selector when requireClient is false", () => {
    render(
      <PortfolioAdditionForm
        benchmarks={demoClientConfigBenchmarks}
        assetClasses={demoClientConfigAssetClasses}
        subAssetClasses={demoClientConfigSubAssetClasses}
        managers={demoClientConfigManagers}
        npcClassifications={demoClientConfigNpcClassifications}
      />
    );
    expect(screen.queryByRole("combobox", { name: /Klant/ })).toBeNull();
    expect(screen.getByLabelText(/Portfolio code/)).toBeTruthy();
    // No hidden clientCode field on the legacy path
    expect(document.querySelector('input[name="clientCode"]')).toBeNull();
  });
});
