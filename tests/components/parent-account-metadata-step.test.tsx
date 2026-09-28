// @vitest-environment jsdom
/**
 * Component tests for the ParentAccountMetadataStep form (task t_4fbdd465) —
 * the optional portfolio-metadata step of the client onboarding wizard.
 *
 * Verifies:
 *  - Renders the parent-account code + MSA code fields
 *  - Both fields are optional (empty values are valid)
 *  - Format validation rejects invalid codes and accepts valid ones
 *  - onValidationChange reports errors + validity live
 *  - Inline .field-error renders when showErrors is true
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ParentAccountMetadataStep,
  validateParentAccountMetadataStep,
  isParentAccountMetadataStepValid,
} from "@/components/parent-account-metadata-step";

afterEach(() => {
  vi.restoreAllMocks();
});

function getFields() {
  return {
    parentAccountCode: screen.getByPlaceholderText("Bijv. ADP_MAIN"),
    msaParentAccountCode: screen.getByPlaceholderText("Bijv. ADP_MSA_01"),
  };
}

describe("ParentAccountMetadataStep — validation helpers", () => {
  it("empty values are valid (step is optional)", () => {
    expect(isParentAccountMetadataStepValid({ parentAccountCode: "", msaParentAccountCode: "" })).toBe(true);
    expect(validateParentAccountMetadataStep({ parentAccountCode: "", msaParentAccountCode: "" })).toEqual({});
  });

  it("accepts valid parent-account codes (uppercase, digits, underscores)", () => {
    expect(
      isParentAccountMetadataStepValid({ parentAccountCode: "ADP_MAIN", msaParentAccountCode: "ADP_MSA_01" }),
    ).toBe(true);
    // lowercase input is normalized by the field (uppercase transform)
    expect(
      validateParentAccountMetadataStep({ parentAccountCode: "adp_main", msaParentAccountCode: "" }),
    ).toEqual({});
  });

  it("rejects invalid parent-account code format", () => {
    const errors = validateParentAccountMetadataStep({
      parentAccountCode: "ongeldige code!",
      msaParentAccountCode: "",
    });
    expect(errors.parentAccountCode).toMatch(/hoofdletters, cijfers en underscores/);
  });

  it("rejects invalid MSA code format independently", () => {
    const errors = validateParentAccountMetadataStep({
      parentAccountCode: "",
      msaParentAccountCode: "ongeldig!",
    });
    expect(errors.msaParentAccountCode).toMatch(/hoofdletters, cijfers en underscores/);
  });

  it("rejects a too-long parent-account code", () => {
    const errors = validateParentAccountMetadataStep({
      parentAccountCode: "ABCDEFGHIJKLMNOPQ", // 17 chars > 16
      msaParentAccountCode: "",
    });
    expect(errors.parentAccountCode).toMatch(/1-16 tekens/);
  });
});

describe("ParentAccountMetadataStep — rendering", () => {
  it("renders both optional fields with labels and placeholders", () => {
    render(
      <ParentAccountMetadataStep
        value={{ parentAccountCode: "", msaParentAccountCode: "" }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText(/Ouderaccount code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/MSA ouderaccount code/)).toBeInTheDocument();
    // Not required — no asterisk markers
    expect(screen.queryByText("*")).toBeNull();
  });

  it("marks the step valid when both fields are empty", () => {
    const onValidationChange = vi.fn();
    render(
      <ParentAccountMetadataStep
        value={{ parentAccountCode: "", msaParentAccountCode: "" }}
        onChange={() => {}}
        onValidationChange={onValidationChange}
      />,
    );

    expect(onValidationChange).toHaveBeenCalledWith({}, true);
  });

  it("reports errors live as the user types an invalid code", () => {
    const onValidationChange = vi.fn();
    render(
      <ParentAccountMetadataStep
        value={{ parentAccountCode: "", msaParentAccountCode: "" }}
        onChange={() => {}}
        onValidationChange={onValidationChange}
      />,
    );

    const fields = getFields();
    fireEvent.change(fields.parentAccountCode, { target: { value: "ongeldige code!" } });

    // Parent re-renders with the new value → validation runs again
    const { rerender } = render(
      <ParentAccountMetadataStep
        value={{ parentAccountCode: "ONGELDIGE CODE!", msaParentAccountCode: "" }}
        onChange={() => {}}
        onValidationChange={onValidationChange}
      />,
    );
    void rerender;

    expect(isParentAccountMetadataStepValid({ parentAccountCode: "ONGELDIGE CODE!", msaParentAccountCode: "" })).toBe(false);
    expect(onValidationChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentAccountCode: expect.stringMatching(/hoofdletters/) }),
      false,
    );
  });

  it("shows inline .field-error for an invalid parent-account code when showErrors is true", () => {
    render(
      <ParentAccountMetadataStep
        value={{ parentAccountCode: "ONGELDIGE CODE!", msaParentAccountCode: "" }}
        onChange={() => {}}
        showErrors
      />,
    );

    const error = screen.getByRole("alert");
    expect(error).toHaveClass("field-error");
    expect(error).toHaveTextContent(/hoofdletters, cijfers en underscores/);
  });

  it("hides inline errors when showErrors is false", () => {
    render(
      <ParentAccountMetadataStep
        value={{ parentAccountCode: "ONGELDIGE CODE!", msaParentAccountCode: "" }}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
