// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import { WorkflowContractProperties } from "@/app/workflow-studio/[definitionId]/edit/workflow-contract-properties";

const entry: BlockCatalogEntry = {
  blockType: "review_gate",
  contractVersion: 2,
  configurationSchema: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 3 },
      mode: { type: "string", enum: ["strict", "advisory"] },
      threshold: { type: "number", minimum: 0 },
      enabled: { type: "boolean", default: true },
      sourceVariable: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
    },
    required: ["title", "sourceVariable"],
    additionalProperties: false,
  },
  configurationUiSchema: {
    fieldOrder: ["title", "sourceVariable", "mode", "threshold", "enabled"],
    widgets: { title: "text", sourceVariable: "variable", mode: "select" },
    labels: { title: "Titel", sourceVariable: "Bronvariabele", mode: "Modus", threshold: "Drempel", enabled: "Actief" },
    enumLabels: { mode: { strict: "Strikt", advisory: "Adviserend" } },
  },
  inputs: [], outputs: [], capabilities: [],
  ui: { label: "Reviewgate", description: "Contractgedreven testblok", category: "control", icon: "gate", order: 1 },
};

describe("WorkflowContractProperties", () => {
  it("renders an unseen block version from metadata and centralizes errors and variable selection", () => {
    const onChange = vi.fn();
    render(<WorkflowContractProperties
      entry={entry}
      configuration={{ title: "x", sourceVariable: "Bad value", mode: "strict", threshold: 5, enabled: true }}
      variableOptions={[{ id: "formulier_waarde", valueType: "number", sourceNodeKey: "form_1", label: "formulier_waarde · form_1" }]}
      onChange={onChange}
    />);

    const form = screen.getByRole("group", { name: "Reviewgate configureren" });
    expect(within(form).getByRole("textbox", { name: "Titel *" })).toBeInTheDocument();
    expect(within(form).getByRole("combobox", { name: "Modus" })).toHaveDisplayValue("Strikt");
    expect(within(form).getByRole("spinbutton", { name: "Drempel" })).toHaveValue(5);
    expect(within(form).getByRole("checkbox", { name: "Actief" })).toBeChecked();
    const errors = screen.getByRole("region", { name: "Contractvalidatie" });
    expect(within(errors).getByText("2 contractfout(en)")).toBeInTheDocument();
    expect(within(errors).getByText("sourceVariable").closest("li")).toHaveTextContent("Waarde heeft niet het vereiste formaat.");

    fireEvent.change(within(form).getByRole("combobox", { name: "Bronvariabele * kiezen" }), { target: { value: "formulier_waarde" } });
    expect(onChange).toHaveBeenCalledWith({ sourceVariable: "formulier_waarde" }, "Bronvariabele gewijzigd.");
    expect(document.querySelector('[data-block-contract="review_gate@2"]')).toBeInTheDocument();
  });
});
