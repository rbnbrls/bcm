// @vitest-environment jsdom
/**
 * Component tests for PortfolioConfigStep (t_4ed84e67) — the portfolio
 * metadata + first configuration row step of the client onboarding wizard.
 *
 * Verifies:
 *  - All four fields render (portfolio name, portfolio code, asset class,
 *    allocation percentage)
 *  - Required validation on every field
 *  - Portfolio code format validation (2-15 alphanumeric, uppercased)
 *  - Allocation percentage numeric + range validation (0-100)
 *  - Inline field-level errors display when showErrors is set
 *  - Values propagate to the parent via onChange
 *  - The component reports validation results to the parent
 *    (onValidationChange: errors + isValid)
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PortfolioConfigStep,
  validatePortfolioConfigStep,
  isPortfolioConfigStepValid,
  type PortfolioConfigStepValue,
} from "@/components/portfolio-config-step";
import { demoClientConfigAssetClasses } from "@/lib/fixtures";

const emptyValue: PortfolioConfigStepValue = {
  portfolioName: "",
  portfolioCode: "",
  assetClass: "",
  allocationPercentage: "",
};

const validValue: PortfolioConfigStepValue = {
  portfolioName: "Rendementsportefeuille",
  portfolioCode: "HORRP",
  assetClass: "EQ",
  allocationPercentage: "50",
};

function getFields() {
  return {
    name: screen.getByPlaceholderText("Bijv. Rendementsportefeuille"),
    code: screen.getByPlaceholderText("Bijv. HOR-RP"),
    assetClass: screen.getByRole("combobox"),
    allocation: screen.getByPlaceholderText("Bijv. 50"),
  };
}

describe("PortfolioConfigStep — rendering", () => {
  it("renders all four fields with labels", () => {
    render(
      <PortfolioConfigStep value={emptyValue} onChange={vi.fn()} assetClasses={demoClientConfigAssetClasses} />,
    );

    const fields = getFields();
    expect(fields.name).toBeInTheDocument();
    expect(fields.code).toBeInTheDocument();
    expect(fields.assetClass).toBeInTheDocument();
    expect(fields.allocation).toBeInTheDocument();

    expect(screen.getByText("Portefeuillenaam")).toBeInTheDocument();
    expect(screen.getByText("Portefeuillecode")).toBeInTheDocument();
    expect(screen.getByText("Asset class")).toBeInTheDocument();
    expect(screen.getByText("Allocatiepercentage")).toBeInTheDocument();
  });

  it("renders the supplied asset classes as select options", () => {
    render(
      <PortfolioConfigStep value={emptyValue} onChange={vi.fn()} assetClasses={demoClientConfigAssetClasses} />,
    );

    const options = screen.getAllByRole("option");
    // placeholder + one option per asset class
    expect(options.length).toBe(demoClientConfigAssetClasses.length + 1);
    expect(screen.getByRole("option", { name: /EQ — EQUITIES/ })).toBeInTheDocument();
  });
});

describe("PortfolioConfigStep — validation", () => {
  it("flags every field as required when empty", () => {
    const errors = validatePortfolioConfigStep(emptyValue);

    expect(errors.portfolioName).toBe("Portefeuillenaam is verplicht.");
    expect(errors.portfolioCode).toBe("Portefeuillecode is verplicht.");
    expect(errors.assetClass).toBe("Kies een asset class.");
    expect(errors.allocationPercentage).toBe("Allocatiepercentage is verplicht.");
    expect(isPortfolioConfigStepValid(emptyValue)).toBe(false);
  });

  it("accepts a fully valid value", () => {
    const errors = validatePortfolioConfigStep(validValue);
    expect(errors).toEqual({});
    expect(isPortfolioConfigStepValid(validValue)).toBe(true);
  });

  it("rejects a portfolio name that is only whitespace", () => {
    const errors = validatePortfolioConfigStep({ ...validValue, portfolioName: "   " });
    expect(errors.portfolioName).toBe("Portefeuillenaam is verplicht.");
  });

  it("rejects a portfolio code with non-alphanumeric characters", () => {
    const errors = validatePortfolioConfigStep({ ...validValue, portfolioCode: "HOR-!" });
    expect(errors.portfolioCode).toMatch(/hoofdletters of cijfers/);
  });

  it("rejects a portfolio code that is too short", () => {
    const errors = validatePortfolioConfigStep({ ...validValue, portfolioCode: "A" });
    expect(errors.portfolioCode).toMatch(/hoofdletters of cijfers/);
  });

  it("accepts a lowercase portfolio code (normalized to uppercase)", () => {
    const errors = validatePortfolioConfigStep({ ...validValue, portfolioCode: "horrp" });
    expect(errors.portfolioCode).toBeUndefined();
  });

  it("rejects allocation below 0", () => {
    const errors = validatePortfolioConfigStep({ ...validValue, allocationPercentage: "-1" });
    expect(errors.allocationPercentage).toBe("Allocatiepercentage moet tussen 0 en 100 liggen.");
  });

  it("rejects allocation above 100", () => {
    const errors = validatePortfolioConfigStep({ ...validValue, allocationPercentage: "100.01" });
    expect(errors.allocationPercentage).toBe("Allocatiepercentage moet tussen 0 en 100 liggen.");
  });

  it("rejects non-numeric allocation", () => {
    const errors = validatePortfolioConfigStep({ ...validValue, allocationPercentage: "abc" });
    expect(errors.allocationPercentage).toBe("Allocatiepercentage moet tussen 0 en 100 liggen.");
  });

  it("accepts the range boundaries 0 and 100", () => {
    expect(validatePortfolioConfigStep({ ...validValue, allocationPercentage: "0" })).toEqual({});
    expect(validatePortfolioConfigStep({ ...validValue, allocationPercentage: "100" })).toEqual({});
  });
});

describe("PortfolioConfigStep — error display", () => {
  it("hides inline errors by default", () => {
    render(
      <PortfolioConfigStep value={emptyValue} onChange={vi.fn()} assetClasses={demoClientConfigAssetClasses} />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows inline field-level errors when showErrors is set", () => {
    render(
      <PortfolioConfigStep
        value={emptyValue}
        onChange={vi.fn()}
        assetClasses={demoClientConfigAssetClasses}
        showErrors
      />,
    );

    expect(screen.getAllByRole("alert")).toHaveLength(4);
    expect(screen.getByText("Portefeuillenaam is verplicht.")).toBeInTheDocument();
    expect(screen.getByText("Portefeuillecode is verplicht.")).toBeInTheDocument();
    expect(screen.getByText("Kies een asset class.")).toBeInTheDocument();
    expect(screen.getByText("Allocatiepercentage is verplicht.")).toBeInTheDocument();
  });

  it("marks invalid fields with aria-invalid when showErrors is set", () => {
    render(
      <PortfolioConfigStep
        value={emptyValue}
        onChange={vi.fn()}
        assetClasses={demoClientConfigAssetClasses}
        showErrors
      />,
    );

    const fields = getFields();
    expect(fields.name).toHaveAttribute("aria-invalid", "true");
    expect(fields.code).toHaveAttribute("aria-invalid", "true");
    expect(fields.assetClass).toHaveAttribute("aria-invalid", "true");
    expect(fields.allocation).toHaveAttribute("aria-invalid", "true");
  });

  it("clears errors once the value becomes valid", () => {
    const { rerender } = render(
      <PortfolioConfigStep
        value={emptyValue}
        onChange={vi.fn()}
        assetClasses={demoClientConfigAssetClasses}
        showErrors
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(4);

    rerender(
      <PortfolioConfigStep
        value={validValue}
        onChange={vi.fn()}
        assetClasses={demoClientConfigAssetClasses}
        showErrors
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PortfolioConfigStep — data-driven API", () => {
  it("propagates field edits to the parent via onChange", () => {
    const onChange = vi.fn();
    render(<PortfolioConfigStep value={emptyValue} onChange={onChange} assetClasses={demoClientConfigAssetClasses} />);

    fireEvent.change(getFields().name, { target: { value: "Rendementsportefeuille" } });
    expect(onChange).toHaveBeenCalledWith({ ...emptyValue, portfolioName: "Rendementsportefeuille" });

    fireEvent.change(getFields().code, { target: { value: "horrp" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyValue, portfolioCode: "HORRP" });

    fireEvent.change(getFields().assetClass, { target: { value: "EQ" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyValue, assetClass: "EQ" });

    fireEvent.change(getFields().allocation, { target: { value: "50" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyValue, allocationPercentage: "50" });
  });

  it("reports validation results to the parent via onValidationChange", () => {
    const onValidationChange = vi.fn();
    const { rerender } = render(
      <PortfolioConfigStep
        value={emptyValue}
        onChange={vi.fn()}
        assetClasses={demoClientConfigAssetClasses}
        onValidationChange={onValidationChange}
      />,
    );

    expect(onValidationChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ portfolioName: expect.any(String) }),
      false,
    );

    rerender(
      <PortfolioConfigStep
        value={validValue}
        onChange={vi.fn()}
        assetClasses={demoClientConfigAssetClasses}
        onValidationChange={onValidationChange}
      />,
    );

    expect(onValidationChange).toHaveBeenLastCalledWith({}, true);
  });

  it("reflects the parent-controlled value (controlled component)", () => {
    const { rerender } = render(
      <PortfolioConfigStep value={emptyValue} onChange={vi.fn()} assetClasses={demoClientConfigAssetClasses} />,
    );

    expect(getFields().name).toHaveValue("");
    expect(getFields().code).toHaveValue("");

    rerender(
      <PortfolioConfigStep value={validValue} onChange={vi.fn()} assetClasses={demoClientConfigAssetClasses} />,
    );

    expect(getFields().name).toHaveValue("Rendementsportefeuille");
    expect(getFields().code).toHaveValue("HORRP");
    expect(getFields().assetClass).toHaveValue("EQ");
    expect(getFields().allocation).toHaveValue(50);
  });
});
