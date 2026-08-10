import { z } from "zod";

const catalogId = z.string().regex(/^[a-z][a-z0-9_.-]*$/, "Gebruik een stabiele catalogus-ID.");
const variableId = z.string().regex(/^[a-z][a-z0-9_]*$/, "Gebruik een stabiele snake_case variabele-ID.");

export const workflowLookupFilterSchema = z.discriminatedUnion("source", [
  z.object({
    attributeId: catalogId,
    source: z.literal("literal"),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }).strict(),
  z.object({
    attributeId: catalogId,
    source: z.literal("variable"),
    variableId,
  }).strict(),
]);

export const workflowLookupParentBindingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("scope_client"), sourceVariable: variableId }).strict(),
  z.object({ mode: z.literal("attribute"), sourceVariable: variableId, targetAttributeId: catalogId }).strict(),
]);

export const workflowLookupConfigurationSchema = z.object({
  resourceId: catalogId,
  filters: z.array(workflowLookupFilterSchema).max(10).default([]),
  parentBinding: workflowLookupParentBindingSchema.optional(),
  displayFields: z.array(catalogId).max(50).default([]),
  selection: z.enum(["one", "many"]).default("one"),
  outputVariable: variableId,
}).strict().superRefine((configuration, context) => {
  if (new Set(configuration.displayFields).size !== configuration.displayFields.length) {
    context.addIssue({ code: "custom", path: ["displayFields"], message: "Getoonde velden moeten uniek zijn." });
  }
  const filterAttributes = configuration.filters.map((filter) => filter.attributeId);
  if (new Set(filterAttributes).size !== filterAttributes.length) {
    context.addIssue({ code: "custom", path: ["filters"], message: "Gebruik ieder filterattribuut maximaal één keer." });
  }
  const consumedVariables = [
    ...configuration.filters.filter((filter) => filter.source === "variable").map((filter) => filter.variableId),
    ...(configuration.parentBinding ? [configuration.parentBinding.sourceVariable] : []),
  ];
  if (consumedVariables.includes(configuration.outputVariable)) {
    context.addIssue({ code: "custom", path: ["outputVariable"], message: "De outputvariabele mag niet ook als filter- of parentinvoer worden gebruikt." });
  }
});

export type WorkflowLookupConfiguration = z.infer<typeof workflowLookupConfigurationSchema>;
export type WorkflowLookupFilter = z.infer<typeof workflowLookupFilterSchema>;
export type WorkflowLookupParentBinding = z.infer<typeof workflowLookupParentBindingSchema>;
