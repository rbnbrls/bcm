import { z } from "zod";
import { workflowBusinessCalendarSchema } from "@/lib/workflow-studio/runtime-calendar";

const variableId = z.string().regex(/^[a-z][a-z0-9_]*$/);
const roleId = z.string().regex(/^[a-z][a-z0-9_-]*$/);

export const workflowRoleTaskConfigurationSchema = z.object({
  roleId,
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().min(1).max(2_000),
  inputVariables: z.array(variableId).max(100).default([]),
  outputVariables: z.array(variableId).max(100).default([]),
  deadlineHours: z.number().int().positive().max(8_760).optional(),
  deadlineCalendar: workflowBusinessCalendarSchema.optional(),
}).strict().superRefine((configuration, context) => {
  if (new Set(configuration.inputVariables).size !== configuration.inputVariables.length) {
    context.addIssue({ code: "custom", path: ["inputVariables"], message: "Invoervariabelen moeten uniek zijn." });
  }
  if (new Set(configuration.outputVariables).size !== configuration.outputVariables.length) {
    context.addIssue({ code: "custom", path: ["outputVariables"], message: "Uitvoervariabelen moeten uniek zijn." });
  }
  const overlap = configuration.outputVariables.filter((variable) => configuration.inputVariables.includes(variable));
  if (overlap.length > 0) {
    context.addIssue({ code: "custom", path: ["outputVariables"], message: `Variabelen mogen niet tegelijk invoer en uitvoer zijn: ${overlap.join(", ")}.` });
  }
});

export const workflowApprovalDecisionSchema = z.enum(["approved", "rejected", "returned"]);
export type WorkflowApprovalDecision = z.infer<typeof workflowApprovalDecisionSchema>;

export const workflowApprovalAggregationModeSchema = z.enum(["sequential", "all_of", "any_of", "quorum"]);
export type WorkflowApprovalAggregationMode = z.infer<typeof workflowApprovalAggregationModeSchema>;

export const workflowApprovalRoleCombinationSchema = z.enum(["distinct_roles", "allow_repeated_roles"]);
export type WorkflowApprovalRoleCombination = z.infer<typeof workflowApprovalRoleCombinationSchema>;

export const workflowApprovalConfigurationSchema = z.object({
  roleId,
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(2_000).optional(),
  inputVariables: z.array(variableId).max(100).default([]),
  decisionLabels: z.object({
    approved: z.string().trim().min(1).max(80).default("Goedkeuren"),
    rejected: z.string().trim().min(1).max(80).default("Afwijzen"),
    returned: z.string().trim().min(1).max(80).default("Terugsturen"),
  }).strict().default({ approved: "Goedkeuren", rejected: "Afwijzen", returned: "Terugsturen" }),
  requireCommentOnApprove: z.boolean().default(false),
  requireCommentOnReject: z.boolean().default(true),
  requireCommentOnReturn: z.boolean().default(true),
  approvalGroupId: variableId.optional(),
  approvalMode: workflowApprovalAggregationModeSchema.default("sequential"),
  quorum: z.number().int().positive().max(100).optional(),
  uniqueApprovers: z.boolean().default(true),
  roleCombination: workflowApprovalRoleCombinationSchema.default("distinct_roles"),
  escalationHours: z.number().int().positive().max(8_760).optional(),
}).strict().superRefine((config, ctx) => {
  if (config.approvalMode === "quorum") {
    if (config.quorum === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quorum"],
        message: "Quorum is verplicht voor quorum-goedkeuringen.",
      });
    }
    return;
  }
  if (config.quorum !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quorum"],
      message: "Quorum mag alleen worden ingesteld bij approvalMode=quorum.",
    });
  }
});
