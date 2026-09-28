import { z } from "zod";

const variableId = z.string().regex(/^[a-z][a-z0-9_]*$/, "Gebruik een stabiele snake_case variabele-ID.");

export const WORKFLOW_SUBWORKFLOW_MAX_NESTING_DEPTH = 3 as const;

export const workflowSubworkflowMappingSchema = z.object({
  parentVariable: variableId,
  childVariable: variableId,
}).strict();

export type WorkflowSubworkflowMapping = z.infer<typeof workflowSubworkflowMappingSchema>;

export const workflowSubworkflowConfigurationSchema = z.object({
  label: z.string().trim().min(1).max(120),
  childWorkflowVersionId: z.string().uuid(),
  pinnedVersionLabel: z.string().trim().min(1).max(120).optional(),
  inputMappings: z.array(workflowSubworkflowMappingSchema).max(100).default([]),
  outputMappings: z.array(workflowSubworkflowMappingSchema).max(100).default([]),
  nestingDepth: z.number().int().min(1).max(WORKFLOW_SUBWORKFLOW_MAX_NESTING_DEPTH).default(1),
}).strict().superRefine((config, ctx) => {
  const inputParents = new Set<string>();
  const inputChildren = new Set<string>();
  config.inputMappings.forEach((mapping, index) => {
    if (inputParents.has(mapping.parentVariable)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inputMappings", index, "parentVariable"], message: "Parent inputvariabele is dubbel gemapt." });
    }
    if (inputChildren.has(mapping.childVariable)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inputMappings", index, "childVariable"], message: "Child inputvariabele is dubbel gemapt." });
    }
    inputParents.add(mapping.parentVariable);
    inputChildren.add(mapping.childVariable);
  });

  const outputParents = new Set<string>();
  const outputChildren = new Set<string>();
  config.outputMappings.forEach((mapping, index) => {
    if (outputParents.has(mapping.parentVariable)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outputMappings", index, "parentVariable"], message: "Parent outputvariabele is dubbel gemapt." });
    }
    if (outputChildren.has(mapping.childVariable)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outputMappings", index, "childVariable"], message: "Child outputvariabele is dubbel gemapt." });
    }
    outputParents.add(mapping.parentVariable);
    outputChildren.add(mapping.childVariable);
  });
});

export type WorkflowSubworkflowConfiguration = z.infer<typeof workflowSubworkflowConfigurationSchema>;
