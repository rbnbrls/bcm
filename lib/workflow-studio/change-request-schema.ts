import { z } from "zod";

const catalogId = z.string().regex(/^[a-z][a-z0-9_.-]*$/, "Gebruik een stabiele catalogus-ID.");
const variableId = z.string().regex(/^[a-z][a-z0-9_]*$/, "Gebruik een stabiele snake_case variabele-ID.");

export const workflowChangeRequestOperationSchema = z.enum(["CREATE", "UPDATE", "RETIRE"]);

export const workflowChangeRequestAttributeMappingSchema = z.object({
  attributeId: catalogId,
  ist: z.object({
    snapshotVariableId: variableId,
    snapshotAttributeId: catalogId,
  }).strict().optional(),
  soll: z.object({
    variableId,
  }).strict().optional(),
}).strict();

export const workflowChangeRequestConfigurationSchema = z.object({
  resourceId: catalogId,
  operation: workflowChangeRequestOperationSchema,
  attributeMappings: z.array(workflowChangeRequestAttributeMappingSchema).min(1).max(50),
  effectiveDateVariable: variableId,
  rationaleVariable: variableId,
}).strict().superRefine((configuration, context) => {
  const attributeIds = configuration.attributeMappings.map((mapping) => mapping.attributeId);
  if (new Set(attributeIds).size !== attributeIds.length) {
    context.addIssue({ code: "custom", path: ["attributeMappings"], message: "Map ieder doelattribuut maximaal één keer." });
  }

  configuration.attributeMappings.forEach((mapping, index) => {
    if (configuration.operation === "CREATE") {
      if (mapping.ist) context.addIssue({ code: "custom", path: ["attributeMappings", index, "ist"], message: "CREATE heeft geen IST-snapshot." });
      if (!mapping.soll) context.addIssue({ code: "custom", path: ["attributeMappings", index, "soll"], message: "CREATE vereist een SOLL-variabele." });
    }
    if (configuration.operation === "UPDATE") {
      if (!mapping.ist) context.addIssue({ code: "custom", path: ["attributeMappings", index, "ist"], message: "UPDATE vereist een IST-snapshot." });
      if (!mapping.soll) context.addIssue({ code: "custom", path: ["attributeMappings", index, "soll"], message: "UPDATE vereist een SOLL-variabele." });
    }
    if (configuration.operation === "RETIRE") {
      if (!mapping.ist) context.addIssue({ code: "custom", path: ["attributeMappings", index, "ist"], message: "RETIRE vereist een IST-snapshot." });
      if (mapping.soll) context.addIssue({ code: "custom", path: ["attributeMappings", index, "soll"], message: "RETIRE gebruikt de ingangsdatum en heeft geen losse SOLL-waarde." });
    }
  });
});

export type WorkflowChangeRequestOperation = z.infer<typeof workflowChangeRequestOperationSchema>;
export type WorkflowChangeRequestAttributeMapping = z.infer<typeof workflowChangeRequestAttributeMappingSchema>;
export type WorkflowChangeRequestConfiguration = z.infer<typeof workflowChangeRequestConfigurationSchema>;
