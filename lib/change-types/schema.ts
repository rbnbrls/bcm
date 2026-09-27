import { z } from "zod";

export const changeFieldTypeSchema = z.enum([
  "benchmark",
  "text",
  "longtext",
  "number",
  "currency",
  "date",
  "select",
  "multiselect",
  "boolean",
]);

export const changeFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const changeFieldSchema = z.object({
  key: z.string().trim().min(1).regex(/^[a-zA-Z0-9_]+$/, "Field key mag alleen letters, cijfers en underscores bevatten."),
  label: z.string().trim().min(1),
  type: changeFieldTypeSchema,
  required: z.boolean(),
  options: z.array(changeFieldOptionSchema).optional(),
  referenceTable: z.enum(["benchmark_catalog", "clients", "portfolios"]).optional(),
  readOnly: z.boolean().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  helpText: z.string().optional(),
});

export const costModelSchema = z.object({
  baseCost: z.number().min(0),
  costCurrency: z.string().trim().length(3).toUpperCase(),
  perItemCost: z.number().min(0).optional(),
  description: z.string(),
});

export const stakeholderTriggerSchema = z.enum([
  "on_submit",
  "on_approval",
  "on_completion",
]);

export const stakeholderDefSchema = z.object({
  id: z.string().trim().min(1).regex(/^[a-zA-Z0-9_-]+$/, "Stakeholder id mag alleen letters, cijfers, underscores en streepjes bevatten."),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  notifyOn: z.array(stakeholderTriggerSchema).min(1),
  mandatory: z.boolean(),
  contactType: z.enum(["email", "webhook"]).optional(),
});

export const flowStepSchema = z.object({
  stepOrder: z.number().int().min(1),
  stakeholder: z.string().trim().min(1),
  stakeholderId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1),
  leadTime: z.string(),
  description: z.string(),
});

export const istSollMappingSchema = z.object({
  ist: z.string().trim().min(1),
  soll: z.string().trim().min(1),
  labelIst: z.string().trim().min(1),
  labelSoll: z.string().trim().min(1),
});

export const editableChangeTypeDefinitionSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim(),
  extendedExplanation: z.string().optional(),
  category: z.string().trim().min(1),
  fields: z.array(changeFieldSchema),
  istSollMapping: z.array(istSollMappingSchema).optional(),
  cost: costModelSchema,
  defaultLeadDays: z.number().int().min(0).max(365),
  stakeholders: z.array(stakeholderDefSchema),
  workflow: z.string().trim().min(1),
  processFlow: z.array(flowStepSchema).optional(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export function parseJsonFormValue<T>(
  raw: FormDataEntryValue | null,
  schema: z.ZodType<T>,
  label: string,
): { ok: true; value: T } | { ok: false; issue: string } {
  const text = String(raw ?? "").trim();
  if (!text) {
    const parsed = schema.safeParse(undefined);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, issue: `${label} bevat geen geldige JSON.` };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { ok: false, issue: `${label} bevat ongeldige JSON.` };
  }

  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    return {
      ok: false,
      issue: `${label}: ${parsed.error.issues.map((issue) => issue.message).join(" ")}`,
    };
  }

  return { ok: true, value: parsed.data };
}
