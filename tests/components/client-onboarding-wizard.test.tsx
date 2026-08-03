// @vitest-environment jsdom
/**
 * Component tests for the ClientOnboardingWizard shell (t_60c3573f,
 * extended t_4fbdd465) — the multi-step container that composes the three
 * independent step forms (ClientInfoStepForm + PortfolioConfigStep +
 * ParentAccountMetadataStep) and owns all wizard-level state.
 *
 * Verifies:
 *  - Renders a 3-step indicator and starts on step 1 (Klantgegevens)
 *  - "Volgende →" is gated by the current step's validation
 *  - "← Vorige" never validates and preserves all staged values
 *  - All data collected on all steps survives back-and-forth navigation
 *  - On the final step the complete staged payload is passed to the
 *    submission callback (or logged when no backend is wired)
 *  - Staged data is not cleared before/after submission
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  ClientOnboardingWizard,
  type ClientOnboardingData,
} from "@/components/client-onboarding-wizard";
import { demoClientConfigAssetClasses } from "@/lib/fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

function getStep1Fields() {
  return {
    code: screen.getByPlaceholderText("Bijv. HOR"),
    name: screen.getByPlaceholderText("Bijv. Pensioenfonds Horizon"),
  };
}

function getStep2Fields() {
  return {
    name: screen.getByPlaceholderText("Bijv. Rendementsportefeuille"),
    code: screen.getByPlaceholderText("Bijv. HOR-RP"),
    assetClass: screen.getByRole("combobox"),
    allocation: screen.getByPlaceholderText("Bijv. 50"),
  };
}

function getStep3Fields() {
  return {
    parentAccountCode: screen.getByPlaceholderText("Bijv. ADP_MAIN"),
    msaParentAccountCode: screen.getByPlaceholderText("Bijv. ADP_MSA_01"),
  };
}

function getNextButton() {
  return screen.getByRole("button", { name: /Volgende →/ });
}

function getBackButton() {
  return screen.getByRole("button", { name: /← Vorige/ });
}

function getSubmitButton() {
  return screen.getByRole("button", { name: /Genereer change request →/ });
}

function getStepDots() {
  return document.querySelectorAll(".step-dot");
}

/** Fill step 1 with valid data and advance to step 2. */
function fillStep1AndGoNext(code = "HOR", name = "Pensioenfonds Horizon") {
  const fields = getStep1Fields();
  fireEvent.change(fields.code, { target: { value: code } });
  fireEvent.change(fields.name, { target: { value: name } });
  fireEvent.click(getNextButton());
}

/** Fill step 2 (portfolio + first config row) with valid data. */
function fillStep2(overrides: Partial<Record<"name" | "code" | "assetClass" | "allocation", string>> = {}) {
  const fields = getStep2Fields();
  fireEvent.change(fields.name, { target: { value: overrides.name ?? "Rendementsportefeuille" } });
  fireEvent.change(fields.code, { target: { value: overrides.code ?? "HORRP" } });
  fireEvent.change(fields.assetClass, { target: { value: overrides.assetClass ?? "EQ" } });
  fireEvent.change(fields.allocation, { target: { value: overrides.allocation ?? "50" } });
}

/** Fill step 3 (portfolio metadata) with valid (or overridden) values. */
function fillStep3(overrides: Partial<Record<"parentAccountCode" | "msaParentAccountCode", string>> = {}) {
  const fields = getStep3Fields();
  fireEvent.change(fields.parentAccountCode, { target: { value: overrides.parentAccountCode ?? "HOOFD_HOR" } });
  fireEvent.change(fields.msaParentAccountCode, { target: { value: overrides.msaParentAccountCode ?? "MSA_HOR_01" } });
}

/** Advance from step 1 to step 3 with all steps valid. */
function fillAllStepsAndReachStep3() {
  fillStep1AndGoNext();
  fillStep2();
  fireEvent.click(getNextButton());
}

const expectedPayload: ClientOnboardingData = {
  clientCode: "HOR",
  clientName: "Pensioenfonds Horizon",
  portfolioName: "Rendementsportefeuille",
  portfolioCode: "HORRP",
  assetClass: "EQ",
  allocationPercentage: "50",
  parentAccountCode: "HOOFD_HOR",
  msaParentAccountCode: "MSA_HOR_01",
};

describe("ClientOnboardingWizard — rendering", () => {
  it("renders the 3-step indicator and starts on step 1 (Klantgegevens)", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    expect(getStepDots()).toHaveLength(3);
    expect(document.querySelector(".step-dot.active")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Klantcode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Klantnaam/)).toBeInTheDocument();
    // Steps 2 and 3 are not rendered yet
    expect(screen.queryByRole("heading", { name: /Portfolio & eerste configuratieregel/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Portfolio metadata/ })).toBeNull();
  });

  it("step 1 has no Back button; step 2/3 show Back + submit on the last step", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    expect(screen.queryByRole("button", { name: /← Vorige/ })).toBeNull();
  });
});

describe("ClientOnboardingWizard — validation gates Next", () => {
  it("disables 'Volgende →' until step 1 is valid", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    expect(getNextButton()).toBeDisabled();

    // Invalid client code (too long) keeps it disabled
    fireEvent.change(getStep1Fields().code, { target: { value: "TOOLONG" } });
    fireEvent.change(getStep1Fields().name, { target: { value: "Pensioenfonds Horizon" } });
    expect(getNextButton()).toBeDisabled();

    // Valid code enables it
    fireEvent.change(getStep1Fields().code, { target: { value: "HOR" } });
    expect(getNextButton()).toBeEnabled();
  });

  it("disables 'Volgende →' on step 2 until the portfolio step is valid", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext();

    expect(getNextButton()).toBeDisabled();

    fillStep2({ allocation: "" });
    expect(getNextButton()).toBeDisabled();

    fillStep2({ allocation: "150" });
    expect(getNextButton()).toBeDisabled();

    fillStep2({ allocation: "50" });
    expect(getNextButton()).toBeEnabled();
  });

  it("disables 'Genereer change request →' on step 3 until the metadata step is valid", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillAllStepsAndReachStep3();

    // The metadata step is fully optional → valid with empty values
    expect(getSubmitButton()).toBeEnabled();

    // Invalid parent-account code format disables submit
    fireEvent.change(getStep3Fields().parentAccountCode, { target: { value: "invalid code!" } });
    expect(getSubmitButton()).toBeDisabled();

    // Correcting it re-enables submit
    fireEvent.change(getStep3Fields().parentAccountCode, { target: { value: "HOOFD_HOR" } });
    expect(getSubmitButton()).toBeEnabled();
  });
});

describe("ClientOnboardingWizard — navigation and staged state", () => {
  it("navigates step 1 → step 2 → step 3 via 'Volgende →'", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext();

    expect(screen.getByRole("heading", { name: /Portfolio & eerste configuratieregel/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Portefeuillenaam/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Asset class/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Allocatiepercentage/)).toBeInTheDocument();
    // Step 2 shows the asset class options
    const select = getStep2Fields().assetClass as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toContain("EQ");

    // Advance to step 3
    fillStep2();
    fireEvent.click(getNextButton());
    expect(screen.getByRole("heading", { name: /Portfolio metadata/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Ouderaccount code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/MSA ouderaccount code/)).toBeInTheDocument();
  });

  it("preserves step 1 values when going back from step 3", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext("NAV", "Back Nav Test Fonds");
    fillStep2();
    fireEvent.click(getNextButton());
    fireEvent.click(getBackButton());

    // Back once → step 2; back again → step 1 with values intact
    expect(screen.getByRole("heading", { name: /Portfolio & eerste configuratieregel/ })).toBeInTheDocument();
    fireEvent.click(getBackButton());
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeInTheDocument();
    expect(getStep1Fields().code).toHaveValue("NAV");
    expect(getStep1Fields().name).toHaveValue("Back Nav Test Fonds");
  });

  it("preserves all values navigating back and forth multiple times", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    // Step 1 → step 2 → step 3
    fillAllStepsAndReachStep3();
    fillStep3();

    // Step 3 → step 2 → step 1 (values must survive)
    fireEvent.click(getBackButton());
    fireEvent.click(getBackButton());
    expect(getStep1Fields().code).toHaveValue("HOR");
    expect(getStep1Fields().name).toHaveValue("Pensioenfonds Horizon");

    // Step 1 → step 2 → step 3 again (portfolio + metadata values survive too)
    fireEvent.click(getNextButton());
    const step2 = getStep2Fields();
    expect(step2.name).toHaveValue("Rendementsportefeuille");
    expect(step2.code).toHaveValue("HORRP");
    expect(step2.assetClass).toHaveValue("EQ");
    expect(step2.allocation).toHaveValue(50);
    fireEvent.click(getNextButton());
    const step3 = getStep3Fields();
    expect(step3.parentAccountCode).toHaveValue("HOOFD_HOR");
    expect(step3.msaParentAccountCode).toHaveValue("MSA_HOR_01");
  });

  it("Back does not validate and preserves values even when step 3 is invalid", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext();
    fillStep2();
    fireEvent.click(getNextButton());

    // Enter invalid metadata, then go back twice
    fillStep3({ parentAccountCode: "invalid code!" });
    fireEvent.click(getBackButton());
    fireEvent.click(getBackButton());

    // Back worked without validation; step 1 values still intact
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeInTheDocument();
    expect(getStep1Fields().code).toHaveValue("HOR");

    // And the invalid step 3 data is still staged when returning
    fireEvent.click(getNextButton());
    fireEvent.click(getNextButton());
    expect(getStep3Fields().parentAccountCode).toHaveValue("INVALID CODE!");
  });
});

describe("ClientOnboardingWizard — submission", () => {
  it("passes the complete staged payload to the onSubmit callback", () => {
    const onSubmit = vi.fn();
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} onSubmit={onSubmit} />);

    fillAllStepsAndReachStep3();
    fillStep3();
    fireEvent.click(getSubmitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expectedPayload);
  });

  it("logs the staged payload when no backend callback is provided", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    fillAllStepsAndReachStep3();
    fillStep3();
    fireEvent.click(getSubmitButton());

    expect(logSpy).toHaveBeenCalledWith("[ClientOnboardingWizard] staged payload:", expectedPayload);
  });

  it("does not clear or drop staged data before/after submission", () => {
    const onSubmit = vi.fn();
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} onSubmit={onSubmit} />);

    fillAllStepsAndReachStep3();
    fillStep3();
    fireEvent.click(getSubmitButton());

    // Still on step 3 with all values intact
    expect(screen.getByRole("heading", { name: /Portfolio metadata/ })).toBeInTheDocument();
    const step3 = getStep3Fields();
    expect(step3.parentAccountCode).toHaveValue("HOOFD_HOR");
    expect(step3.msaParentAccountCode).toHaveValue("MSA_HOR_01");

    // Submitting again passes the same payload
    fireEvent.click(getSubmitButton());
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith(expectedPayload);
  });

  it("normalizes codes to uppercase and trims whitespace in the payload", () => {
    const onSubmit = vi.fn();
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} onSubmit={onSubmit} />);

    fillStep1AndGoNext("  hor ", "  Pensioenfonds Horizon  ");
    fillStep2({ code: " horrp ", allocation: "50" });
    fireEvent.click(getNextButton());
    fillStep3({ parentAccountCode: " hoofd_hor ", msaParentAccountCode: " msa_hor_01 " });
    fireEvent.click(getSubmitButton());

    expect(onSubmit).toHaveBeenCalledWith({
      clientCode: "HOR",
      clientName: "Pensioenfonds Horizon",
      portfolioName: "Rendementsportefeuille",
      portfolioCode: "HORRP",
      assetClass: "EQ",
      allocationPercentage: "50",
      parentAccountCode: "HOOFD_HOR",
      msaParentAccountCode: "MSA_HOR_01",
    });
  });
});

describe("ClientOnboardingWizard — inline errors", () => {
  it("shows step 1 inline errors once the user has edited fields", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    // No errors before any interaction
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(getStep1Fields().code, { target: { value: "X" } });
    expect(screen.getByText("Klantnaam is verplicht.")).toBeInTheDocument();
    expect(screen.queryByText("Klantcode is verplicht.")).toBeNull();
  });

  it("shows step 2 inline errors once the user has edited fields", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext();

    fireEvent.change(getStep2Fields().allocation, { target: { value: "150" } });
    expect(screen.getByText("Allocatiepercentage moet tussen 0 en 100 liggen.")).toBeInTheDocument();
  });

  it("shows step 3 inline errors once the user has edited fields", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillAllStepsAndReachStep3();

    fireEvent.change(getStep3Fields().parentAccountCode, { target: { value: "invalid code!" } });
    expect(
      screen.getByText(/hoofdletters, cijfers en underscores/),
    ).toBeInTheDocument();
  });

  it("the step indicator marks the current step active", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    const dots = getStepDots();
    expect(within(dots[0] as HTMLElement).getByText("Klantgegevens")).toBeInTheDocument();
    expect(within(dots[1] as HTMLElement).getByText("Portfolio & configuratieregel")).toBeInTheDocument();
    expect(within(dots[2] as HTMLElement).getByText("Portfolio metadata")).toBeInTheDocument();
  });
});
