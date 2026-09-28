import { describe, expect, it } from "vitest";

import {
  parseWorkflowRuntimeFormData,
  workflowRuntimeFormFieldName,
  type WorkflowRuntimeFormDefinition,
} from "@/lib/workflow-studio/runtime-form";

const form: WorkflowRuntimeFormDefinition = {
  nodeId: "form-node-id",
  nodeKey: "application",
  configuration: {
    title: "Aanvraag",
    description: "Vul de aanvraag in.",
    fields: [
      { id: "title", label: "Titel", type: "text", required: true, constraints: { minLength: 3, maxLength: 20 } },
      { id: "explanation", label: "Toelichting", type: "longtext", required: false },
      { id: "amount", label: "Bedrag", type: "currency", currency: "EUR", required: true, constraints: { min: 10, max: 1000, step: 5 } },
      { id: "effective_date", label: "Ingangsdatum", type: "date", required: true, constraints: { min: "2026-08-11" } },
      { id: "urgent", label: "Spoed", type: "boolean", required: false },
      { id: "category", label: "Categorie", type: "select", required: true, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      { id: "labels", label: "Labels", type: "multiselect", required: false, options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }], constraints: { maxSelections: 2 } },
    ],
  },
};

function validFormData(): FormData {
  const data = new FormData();
  data.set("application.title", "Nieuwe aanvraag");
  data.set("application.explanation", "Een uitgebreide toelichting");
  data.set("application.amount", "125");
  data.set("application.effective_date", "2026-09-01");
  data.set("application.urgent", "on");
  data.set("application.category", "b");
  data.append("application.labels", "x");
  data.append("application.labels", "y");
  return data;
}

describe("workflow runtime form parsing", () => {
  it("uses collision-safe field names", () => {
    expect(workflowRuntimeFormFieldName("application", "effective_date")).toBe("application.effective_date");
  });

  it("coerces browser FormData and emits typed confidential variables", () => {
    const result = parseWorkflowRuntimeFormData([form], validFormData());
    expect(result).toMatchObject({
      success: true,
      values: {
        title: "Nieuwe aanvraag",
        explanation: "Een uitgebreide toelichting",
        amount: 125,
        effective_date: "2026-09-01",
        urgent: true,
        category: "b",
        labels: ["x", "y"],
      },
    });
    expect(result.success && result.variables).toEqual([
      { name: "title", dataType: "string", value: "Nieuwe aanvraag", classification: "confidential" },
      { name: "explanation", dataType: "string", value: "Een uitgebreide toelichting", classification: "confidential" },
      { name: "amount", dataType: "number", value: 125, classification: "confidential" },
      { name: "effective_date", dataType: "date", value: "2026-09-01", classification: "confidential" },
      { name: "urgent", dataType: "boolean", value: true, classification: "confidential" },
      { name: "category", dataType: "string", value: "b", classification: "confidential" },
      { name: "labels", dataType: "array", value: ["x", "y"], classification: "confidential" },
    ]);
  });

  it("validates required fields, numeric constraints and select allowlists server-side", () => {
    const data = validFormData();
    data.delete("application.title");
    data.set("application.amount", "12");
    data.set("application.category", "tampered");
    const result = parseWorkflowRuntimeFormData([form], data);
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        "application.title": expect.any(Array),
        "application.amount": expect.any(Array),
        "application.category": expect.any(Array),
      },
    });
  });

  it("ignores undeclared fields and treats absent checkboxes as false", () => {
    const data = validFormData();
    data.delete("application.urgent");
    data.set("admin_override", "true");
    const result = parseWorkflowRuntimeFormData([form], data);
    expect(result.success && result.values).toMatchObject({ urgent: false });
    expect(result.success && result.values).not.toHaveProperty("admin_override");
  });

  it("rejects duplicate variable writers across multiple start forms", () => {
    const duplicate: WorkflowRuntimeFormDefinition = {
      nodeId: "other-form",
      nodeKey: "other",
      configuration: { title: "Ander", fields: [{ id: "title", label: "Titel nogmaals", type: "text", required: true }] },
    };
    const data = validFormData();
    data.set("other.title", "Dubbel");
    const result = parseWorkflowRuntimeFormData([form, duplicate], data);
    expect(result).toMatchObject({
      success: false,
      fieldErrors: { "other.title": ["Variabele title wordt door meerdere startformulieren geschreven."] },
    });
  });
});
