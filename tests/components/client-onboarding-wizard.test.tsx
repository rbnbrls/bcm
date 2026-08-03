// @vitest-environment jsdom
/**
 * Component tests for the ClientOnboardingWizard shell (t_60c3573f) — the
 * multi-step container that composes the two independent step forms
 * (ClientInfoStepForm + PortfolioConfigStep) and owns all wizard-level state.
 *
 * Verifies:
 *  - Renders a 2-step indicator and starts on step 1 (Klantgegevens)
 *  - "Volgende →" is gated by the current step's validation
 *  - "← Vorige" never validates and preserves all staged values
 *  - All data collected on both steps survives back-and-forth navigation
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

const expectedPayload: ClientOnboardingData = {
  clientCode: "HOR",
  clientName: "Pensioenfonds Horizon",
  portfolioName: "Rendementsportefeuille",
  portfolioCode: "HORRP",
  assetClass: "EQ",
  allocationPercentage: "50",
};

describe("ClientOnboardingWizard — rendering", () => {
  it("renders the 2-step indicator and starts on step 1 (Klantgegevens)", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    expect(getStepDots()).toHaveLength(2);
    expect(document.querySelector(".step-dot.active")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Klantcode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Klantnaam/)).toBeInTheDocument();
    // Step 2 content is not rendered yet
    expect(screen.queryByRole("heading", { name: /Portfolio & eerste configuratieregel/ })).toBeNull();
  });

  it("step 1 has no Back button; step 2 shows Back + Submit", () => {
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

  it("disables 'Genereer change request →' on step 2 until the portfolio step is valid", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext();

    expect(getSubmitButton()).toBeDisabled();

    fillStep2({ allocation: "" });
    expect(getSubmitButton()).toBeDisabled();

    fillStep2({ allocation: "150" });
    expect(getSubmitButton()).toBeDisabled();

    fillStep2({ allocation: "50" });
    expect(getSubmitButton()).toBeEnabled();
  });
});

describe("ClientOnboardingWizard — navigation and staged state", () => {
  it("navigates step 1 → step 2 via 'Volgende →'", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext();

    expect(screen.getByRole("heading", { name: /Portfolio & eerste configuratieregel/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Portefeuillenaam/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Asset class/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Allocatiepercentage/)).toBeInTheDocument();
    // Step 2 shows the asset class options
    const select = getStep2Fields().assetClass as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toContain("EQ");
  });

  it("preserves step 1 values when going back from step 2", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext("NAV", "Back Nav Test Fonds");

    fireEvent.click(getBackButton());

    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeInTheDocument();
    expect(getStep1Fields().code).toHaveValue("NAV");
    expect(getStep1Fields().name).toHaveValue("Back Nav Test Fonds");
  });

  it("preserves all values navigating back and forth multiple times", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    // Step 1 → step 2
    fillStep1AndGoNext("HOR", "Pensioenfonds Horizon");
    fillStep2();

    // Step 2 → step 1 (values must survive)
    fireEvent.click(getBackButton());
    expect(getStep1Fields().code).toHaveValue("HOR");
    expect(getStep1Fields().name).toHaveValue("Pensioenfonds Horizon");

    // Step 1 → step 2 again (portfolio values must survive too)
    fireEvent.click(getNextButton());
    const step2 = getStep2Fields();
    expect(step2.name).toHaveValue("Rendementsportefeuille");
    expect(step2.code).toHaveValue("HORRP");
    expect(step2.assetClass).toHaveValue("EQ");
    expect(step2.allocation).toHaveValue(50);
  });

  it("Back does not validate and preserves values even when step 2 is invalid", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    fillStep1AndGoNext();

    // Enter incomplete/invalid portfolio data, then go back
    fillStep2({ name: "R", allocation: "999" });
    fireEvent.click(getBackButton());

    // Back worked without validation; step 1 values still intact
    expect(screen.getByRole("heading", { name: "Klantgegevens" })).toBeInTheDocument();
    expect(getStep1Fields().code).toHaveValue("HOR");

    // And the invalid step 2 data is still staged when returning
    fireEvent.click(getNextButton());
    expect(getStep2Fields().name).toHaveValue("R");
    expect(getStep2Fields().allocation).toHaveValue(999);
  });
});

describe("ClientOnboardingWizard — submission", () => {
  it("passes the complete staged payload to the onSubmit callback", () => {
    const onSubmit = vi.fn();
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} onSubmit={onSubmit} />);

    fillStep1AndGoNext();
    fillStep2();
    fireEvent.click(getSubmitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expectedPayload);
  });

  it("logs the staged payload when no backend callback is provided", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);

    fillStep1AndGoNext();
    fillStep2();
    fireEvent.click(getSubmitButton());

    expect(logSpy).toHaveBeenCalledWith("[ClientOnboardingWizard] staged payload:", expectedPayload);
  });

  it("does not clear or drop staged data before/after submission", () => {
    const onSubmit = vi.fn();
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} onSubmit={onSubmit} />);

    fillStep1AndGoNext();
    fillStep2();
    fireEvent.click(getSubmitButton());

    // Still on step 2 with all values intact
    expect(screen.getByRole("heading", { name: /Portfolio & eerste configuratieregel/ })).toBeInTheDocument();
    const step2 = getStep2Fields();
    expect(step2.name).toHaveValue("Rendementsportefeuille");
    expect(step2.code).toHaveValue("HORRP");
    expect(step2.assetClass).toHaveValue("EQ");
    expect(step2.allocation).toHaveValue(50);

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
    fireEvent.click(getSubmitButton());

    expect(onSubmit).toHaveBeenCalledWith({
      clientCode: "HOR",
      clientName: "Pensioenfonds Horizon",
      portfolioName: "Rendementsportefeuille",
      portfolioCode: "HORRP",
      assetClass: "EQ",
      allocationPercentage: "50",
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

  it("the step indicator marks the current step active", () => {
    render(<ClientOnboardingWizard assetClasses={demoClientConfigAssetClasses} />);
    const dots = getStepDots();
    expect(within(dots[0] as HTMLElement).getByText("Klantgegevens")).toBeInTheDocument();
    expect(within(dots[1] as HTMLElement).getByText("Portfolio & configuratieregel")).toBeInTheDocument();
  });
});
