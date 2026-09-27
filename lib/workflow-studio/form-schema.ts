import { z } from "zod";

export const workflowFormFieldTypeSchema = z.enum([
  "text", "longtext", "number", "currency", "date", "boolean", "select", "multiselect",
]);
export type WorkflowFormFieldType = z.infer<typeof workflowFormFieldTypeSchema>;

const fieldIdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, "Gebruik een stabiele snake_case veld-ID.");
const optionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
}).strict();
const commonShape = {
  id: fieldIdSchema,
  label: z.string().trim().min(1).max(120),
  helpText: z.string().trim().max(500).optional(),
  required: z.boolean().default(false),
};
const lengthConstraintsSchema = z.object({
  minLength: z.number().int().min(0).max(100_000).optional(),
  maxLength: z.number().int().min(1).max(100_000).optional(),
  pattern: z.string().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.minLength !== undefined && value.maxLength !== undefined && value.minLength > value.maxLength) {
    context.addIssue({ code: "custom", path: ["maxLength"], message: "Maximale lengte moet minimaal de minimale lengte zijn." });
  }
  if (value.pattern) {
    try { new RegExp(value.pattern); } catch {
      context.addIssue({ code: "custom", path: ["pattern"], message: "Het patroon is geen geldige reguliere expressie." });
    }
  }
});
const numberConstraintsSchema = z.object({
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().finite().positive().optional(),
}).strict().superRefine((value, context) => {
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
    context.addIssue({ code: "custom", path: ["max"], message: "Maximum moet minimaal het minimum zijn." });
  }
});
const dateConstraintsSchema = z.object({
  min: z.iso.date().optional(),
  max: z.iso.date().optional(),
}).strict().superRefine((value, context) => {
  if (value.min && value.max && value.min > value.max) {
    context.addIssue({ code: "custom", path: ["max"], message: "De maximale datum moet op of na de minimale datum liggen." });
  }
});

export const workflowFormFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...commonShape, type: z.literal("text"), defaultValue: z.string().max(100_000).optional(), constraints: lengthConstraintsSchema.optional() }).strict(),
  z.object({ ...commonShape, type: z.literal("longtext"), defaultValue: z.string().max(100_000).optional(), constraints: lengthConstraintsSchema.optional() }).strict(),
  z.object({ ...commonShape, type: z.literal("number"), defaultValue: z.number().finite().optional(), constraints: numberConstraintsSchema.optional() }).strict(),
  z.object({ ...commonShape, type: z.literal("currency"), defaultValue: z.number().finite().optional(), currency: z.string().regex(/^[A-Z]{3}$/).default("EUR"), constraints: numberConstraintsSchema.optional() }).strict(),
  z.object({ ...commonShape, type: z.literal("date"), defaultValue: z.iso.date().optional(), constraints: dateConstraintsSchema.optional() }).strict(),
  z.object({ ...commonShape, type: z.literal("boolean"), defaultValue: z.boolean().optional() }).strict(),
  z.object({ ...commonShape, type: z.literal("select"), defaultValue: z.string().max(120).optional(), options: z.array(optionSchema).min(1).max(250) }).strict(),
  z.object({
    ...commonShape,
    type: z.literal("multiselect"),
    defaultValue: z.array(z.string().max(120)).max(250).optional(),
    options: z.array(optionSchema).min(1).max(250),
    constraints: z.object({
      minSelections: z.number().int().min(0).optional(),
      maxSelections: z.number().int().positive().optional(),
    }).strict().optional(),
  }).strict(),
]).superRefine((field, context) => {
  if (field.type === "text" || field.type === "longtext") {
    const value = field.defaultValue;
    if (value !== undefined && field.constraints?.minLength !== undefined && value.length < field.constraints.minLength) {
      context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardwaarde is korter dan de minimale lengte." });
    }
    if (value !== undefined && field.constraints?.maxLength !== undefined && value.length > field.constraints.maxLength) {
      context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardwaarde is langer dan de maximale lengte." });
    }
    if (value !== undefined && field.constraints?.pattern) {
      try {
        if (!new RegExp(field.constraints.pattern).test(value)) context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardwaarde voldoet niet aan het patroon." });
      } catch { /* the constraint schema reports the malformed pattern */ }
    }
  }
  if (field.type === "number" || field.type === "currency") {
    const value = field.defaultValue;
    if (value !== undefined && field.constraints?.min !== undefined && value < field.constraints.min) {
      context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardwaarde ligt onder het minimum." });
    }
    if (value !== undefined && field.constraints?.max !== undefined && value > field.constraints.max) {
      context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardwaarde ligt boven het maximum." });
    }
    if (value !== undefined && field.constraints?.step !== undefined && Math.abs(value / field.constraints.step - Math.round(value / field.constraints.step)) >= 1e-9) {
      context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardwaarde is geen geldig veelvoud van de stapgrootte." });
    }
  }
  if (field.type === "date" && field.defaultValue !== undefined) {
    if (field.constraints?.min && field.defaultValue < field.constraints.min) context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaarddatum ligt voor de minimumdatum." });
    if (field.constraints?.max && field.defaultValue > field.constraints.max) context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaarddatum ligt na de maximumdatum." });
  }
  if (field.type === "select" && field.defaultValue !== undefined && !field.options.some((option) => option.value === field.defaultValue)) {
    context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardwaarde moet een bestaande optie zijn." });
  }
  if (field.type === "multiselect") {
    const optionValues = new Set(field.options.map((option) => option.value));
    if (field.defaultValue?.some((value) => !optionValues.has(value))) {
      context.addIssue({ code: "custom", path: ["defaultValue"], message: "Iedere standaardwaarde moet een bestaande optie zijn." });
    }
    const { minSelections, maxSelections } = field.constraints ?? {};
    if (minSelections !== undefined && maxSelections !== undefined && minSelections > maxSelections) {
      context.addIssue({ code: "custom", path: ["constraints", "maxSelections"], message: "Maximumselecties moet minimaal minimumselecties zijn." });
    }
    if (field.defaultValue && minSelections !== undefined && field.defaultValue.length < minSelections) context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardselectie bevat minder waarden dan het minimum." });
    if (field.defaultValue && maxSelections !== undefined && field.defaultValue.length > maxSelections) context.addIssue({ code: "custom", path: ["defaultValue"], message: "De standaardselectie bevat meer waarden dan het maximum." });
  }
  if (field.type === "select" || field.type === "multiselect") {
    const optionValues = field.options.map((option) => option.value);
    if (new Set(optionValues).size !== optionValues.length) context.addIssue({ code: "custom", path: ["options"], message: "Optiewaarden moeten uniek zijn." });
  }
});
export type WorkflowFormField = z.infer<typeof workflowFormFieldSchema>;

export const workflowFormBlockConfigurationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  fields: z.array(workflowFormFieldSchema).max(100).default([]),
}).strict().superRefine((configuration, context) => {
  const seen = new Set<string>();
  configuration.fields.forEach((field, index) => {
    if (seen.has(field.id)) context.addIssue({ code: "custom", path: ["fields", index, "id"], message: `Veld-ID ${field.id} wordt meer dan één keer gebruikt.` });
    seen.add(field.id);
  });
});
export type WorkflowFormBlockConfiguration = z.infer<typeof workflowFormBlockConfigurationSchema>;

function submissionFieldSchema(field: WorkflowFormField): z.ZodType {
  let schema: z.ZodType;
  switch (field.type) {
    case "text":
    case "longtext": {
      let value = z.string();
      const minimum = field.constraints?.minLength ?? (field.required ? 1 : 0);
      if (minimum > 0) value = value.min(minimum);
      if (field.constraints?.maxLength !== undefined) value = value.max(field.constraints.maxLength);
      if (field.constraints?.pattern) value = value.regex(new RegExp(field.constraints.pattern));
      schema = value;
      break;
    }
    case "number":
    case "currency": {
      let value = z.number().finite();
      if (field.constraints?.min !== undefined) value = value.min(field.constraints.min);
      if (field.constraints?.max !== undefined) value = value.max(field.constraints.max);
      if (field.constraints?.step !== undefined) {
        const step = field.constraints.step;
        value = value.refine((input) => Math.abs(input / step - Math.round(input / step)) < 1e-9, `Waarde moet een veelvoud van ${step} zijn.`) as typeof value;
      }
      schema = value;
      break;
    }
    case "date": {
      let value = z.iso.date();
      if (field.constraints?.min) value = value.refine((input) => input >= field.constraints!.min!, `Datum moet op of na ${field.constraints.min} liggen.`) as typeof value;
      if (field.constraints?.max) value = value.refine((input) => input <= field.constraints!.max!, `Datum moet op of voor ${field.constraints.max} liggen.`) as typeof value;
      schema = value;
      break;
    }
    case "boolean": schema = z.boolean(); break;
    case "select": {
      const values = new Set(field.options.map((option) => option.value));
      schema = z.string().refine((value) => values.has(value), "Kies een geldige optie.");
      break;
    }
    case "multiselect": {
      const values = new Set(field.options.map((option) => option.value));
      let value = z.array(z.string()).refine((items) => items.every((item) => values.has(item)), "Kies alleen geldige opties.");
      if (field.constraints?.minSelections !== undefined) value = value.min(field.constraints.minSelections);
      if (field.constraints?.maxSelections !== undefined) value = value.max(field.constraints.maxSelections);
      schema = value;
      break;
    }
  }
  if (field.defaultValue !== undefined) return schema.default(field.defaultValue);
  return field.required ? schema : schema.optional();
}

export function createWorkflowFormSubmissionSchema(configuration: WorkflowFormBlockConfiguration) {
  return z.object(Object.fromEntries(configuration.fields.map((field) => [field.id, submissionFieldSchema(field)]))).strict();
}

export function validateWorkflowFormSubmission(configuration: unknown, values: unknown) {
  const parsedConfiguration = workflowFormBlockConfigurationSchema.safeParse(configuration);
  if (!parsedConfiguration.success) return parsedConfiguration;
  return createWorkflowFormSubmissionSchema(parsedConfiguration.data).safeParse(values);
}
