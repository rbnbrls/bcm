import { describe, expect, it } from "vitest";
import {
  createWorkflowFormSubmissionSchema,
  validateWorkflowFormSubmission,
  workflowFormBlockConfigurationSchema,
} from "@/lib/workflow-studio/form-schema";

const configuration = {
  title: "Aanvraag",
  fields: [
    { id: "name", label: "Naam", type: "text", required: true, constraints: { minLength: 2, maxLength: 20 } },
    { id: "details", label: "Toelichting", type: "longtext", required: false, helpText: "Geef context.", defaultValue: "Geen" },
    { id: "amount", label: "Aantal", type: "number", required: true, constraints: { min: 1, max: 10, step: 1 } },
    { id: "fee", label: "Kosten", type: "currency", required: false, currency: "EUR", defaultValue: 25, constraints: { min: 0 } },
    { id: "date", label: "Datum", type: "date", required: true, constraints: { min: "2026-01-01", max: "2026-12-31" } },
    { id: "confirmed", label: "Akkoord", type: "boolean", required: true, defaultValue: false },
    { id: "priority", label: "Prioriteit", type: "select", required: true, options: [{ value: "high", label: "Hoog" }], defaultValue: "high" },
    { id: "regions", label: "Regio's", type: "multiselect", required: true, options: [{ value: "nl", label: "Nederland" }, { value: "be", label: "België" }], constraints: { minSelections: 1, maxSelections: 2 } },
  ],
} as const;

describe("workflow form schema", () => {
  it("uses one configuration contract for all eight editor field types", () => {
    const parsed = workflowFormBlockConfigurationSchema.safeParse(configuration);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.fields.map((field) => field.type)).toEqual([
      "text", "longtext", "number", "currency", "date", "boolean", "select", "multiselect",
    ]);
  });

  it("generates the runtime/server submission schema with defaults and constraints", () => {
    const parsed = workflowFormBlockConfigurationSchema.parse(configuration);
    const schema = createWorkflowFormSubmissionSchema(parsed);
    const valid = schema.safeParse({
      name: "Ada",
      amount: 3,
      date: "2026-08-10",
      regions: ["nl"],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toMatchObject({ details: "Geen", fee: 25, confirmed: false, priority: "high" });
    }

    expect(validateWorkflowFormSubmission(configuration, {
      name: "A",
      amount: 2.5,
      date: "2027-01-01",
      regions: [],
    }).success).toBe(false);
  });

  it("rejects duplicate ids, invalid option defaults and contradictory constraints", () => {
    expect(workflowFormBlockConfigurationSchema.safeParse({
      title: "Ongeldig",
      fields: [
        { id: "same", label: "Een", type: "text", constraints: { minLength: 10, maxLength: 2 } },
        { id: "same", label: "Twee", type: "select", options: [{ value: "a", label: "A" }], defaultValue: "b" },
      ],
    }).success).toBe(false);
  });
});
