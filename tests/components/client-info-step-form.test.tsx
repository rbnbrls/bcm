// @vitest-environment jsdom
/**
 * Component tests for ClientInfoStepForm (t_a3fe436e) — the client info step
 * of the client onboarding wizard.
 *
 * Verifies:
 *  - Both fields render (client code, client name) with labels
 *  - Required validation on both fields
 *  - Client code format validation (1-3 alphanumeric, uppercased; hyphens and
 *    underscores are NOT valid client codes)
 *  - Inline field-level errors display when showErrors is set
 *  - Values propagate to the parent via onChange
 *  - The component reports validation results to the parent
 *    (onValidationChange: errors + isValid)
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ClientInfoStepForm,
  validateClientInfoStep,
  isClientInfoStepValid,
  type ClientInfoStepValue,
} from "@/components/client-info-step-form";

const emptyValue: ClientInfoStepValue = {
  clientCode: "",
  clientName: "",
};

const validValue: ClientInfoStepValue = {
  clientCode: "HOR",
  clientName: "Pensioenfonds Horizon",
};

function getFields() {
  return {
    code: screen.getByPlaceholderText("Bijv. HOR"),
    name: screen.getByPlaceholderText("Bijv. Pensioenfonds Horizon"),
  };
}

describe("ClientInfoStepForm — rendering", () => {
  it("renders both fields with labels", () => {
    render(<ClientInfoStepForm value={emptyValue} onChange={vi.fn()} />);

    const fields = getFields();
    expect(fields.code).toBeInTheDocument();
    expect(fields.name).toBeInTheDocument();

    expect(screen.getByText("Klantcode")).toBeInTheDocument();
    expect(screen.getByText("Klantnaam")).toBeInTheDocument();
  });
});

describe("ClientInfoStepForm — validation", () => {
  it("flags both fields as required when empty", () => {
    const errors = validateClientInfoStep(emptyValue);

    expect(errors.clientCode).toBe("Klantcode is verplicht.");
    expect(errors.clientName).toBe("Klantnaam is verplicht.");
    expect(isClientInfoStepValid(emptyValue)).toBe(false);
  });

  it("accepts a fully valid value", () => {
    const errors = validateClientInfoStep(validValue);
    expect(errors).toEqual({});
    expect(isClientInfoStepValid(validValue)).toBe(true);
  });

  it("rejects a client code that is only whitespace", () => {
    const errors = validateClientInfoStep({ ...validValue, clientCode: "   " });
    expect(errors.clientCode).toBe("Klantcode is verplicht.");
  });

  it("rejects a client code with hyphens or underscores", () => {
    expect(validateClientInfoStep({ ...validValue, clientCode: "HOR-1" }).clientCode).toMatch(/hoofdletters of cijfers/);
    expect(validateClientInfoStep({ ...validValue, clientCode: "HOR_1" }).clientCode).toMatch(/hoofdletters of cijfers/);
  });

  it("rejects a client code that is too long (more than 3 characters)", () => {
    const errors = validateClientInfoStep({ ...validValue, clientCode: "HORZ" });
    expect(errors.clientCode).toMatch(/hoofdletters of cijfers/);
  });

  it("accepts a lowercase client code (normalized to uppercase)", () => {
    const errors = validateClientInfoStep({ ...validValue, clientCode: "hor" });
    expect(errors.clientCode).toBeUndefined();
  });

  it("accepts numeric client codes", () => {
    const errors = validateClientInfoStep({ ...validValue, clientCode: "12A" });
    expect(errors.clientCode).toBeUndefined();
  });

  it("rejects a client name that is only whitespace", () => {
    const errors = validateClientInfoStep({ ...validValue, clientName: "   " });
    expect(errors.clientName).toBe("Klantnaam is verplicht.");
  });

  it("rejects a client name shorter than 2 characters", () => {
    const errors = validateClientInfoStep({ ...validValue, clientName: "A" });
    expect(errors.clientName).toBe("Klantnaam moet minimaal 2 tekens bevatten.");
  });
});

describe("ClientInfoStepForm — error display", () => {
  it("hides inline errors by default", () => {
    render(<ClientInfoStepForm value={emptyValue} onChange={vi.fn()} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows inline field-level errors when showErrors is set", () => {
    render(<ClientInfoStepForm value={emptyValue} onChange={vi.fn()} showErrors />);

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByText("Klantcode is verplicht.")).toBeInTheDocument();
    expect(screen.getByText("Klantnaam is verplicht.")).toBeInTheDocument();
  });

  it("shows the format error for an invalid client code", () => {
    render(
      <ClientInfoStepForm
        value={{ clientCode: "TOOLONG", clientName: "Pensioenfonds Horizon" }}
        onChange={vi.fn()}
        showErrors
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("1-3 hoofdletters of cijfers");
  });

  it("marks invalid fields with aria-invalid when showErrors is set", () => {
    render(<ClientInfoStepForm value={emptyValue} onChange={vi.fn()} showErrors />);

    const fields = getFields();
    expect(fields.code).toHaveAttribute("aria-invalid", "true");
    expect(fields.name).toHaveAttribute("aria-invalid", "true");
  });

  it("clears errors once the value becomes valid", () => {
    const { rerender } = render(<ClientInfoStepForm value={emptyValue} onChange={vi.fn()} showErrors />);
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    rerender(<ClientInfoStepForm value={validValue} onChange={vi.fn()} showErrors />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ClientInfoStepForm — data-driven API", () => {
  it("propagates field edits to the parent via onChange", () => {
    const onChange = vi.fn();
    render(<ClientInfoStepForm value={emptyValue} onChange={onChange} />);

    fireEvent.change(getFields().code, { target: { value: "hor" } });
    expect(onChange).toHaveBeenCalledWith({ ...emptyValue, clientCode: "HOR" });

    fireEvent.change(getFields().name, { target: { value: "Pensioenfonds Horizon" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...emptyValue, clientName: "Pensioenfonds Horizon" });
  });

  it("reports validation results to the parent via onValidationChange", () => {
    const onValidationChange = vi.fn();
    const { rerender } = render(
      <ClientInfoStepForm value={emptyValue} onChange={vi.fn()} onValidationChange={onValidationChange} />,
    );

    expect(onValidationChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientCode: expect.any(String), clientName: expect.any(String) }),
      false,
    );

    rerender(
      <ClientInfoStepForm value={validValue} onChange={vi.fn()} onValidationChange={onValidationChange} />,
    );

    expect(onValidationChange).toHaveBeenLastCalledWith({}, true);
  });

  it("reflects the parent-controlled value (controlled component)", () => {
    const { rerender } = render(<ClientInfoStepForm value={emptyValue} onChange={vi.fn()} />);

    expect(getFields().code).toHaveValue("");
    expect(getFields().name).toHaveValue("");

    rerender(<ClientInfoStepForm value={validValue} onChange={vi.fn()} />);

    expect(getFields().code).toHaveValue("HOR");
    expect(getFields().name).toHaveValue("Pensioenfonds Horizon");
  });
});
