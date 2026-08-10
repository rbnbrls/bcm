import { z } from "zod";
import { blockReferenceSchema } from "@/lib/workflow-studio/block-contract";

const slugRegex = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const nodeKeyRegex = /^[a-zA-Z0-9_]+$/;
const edgeKeyRegex = /^[a-zA-Z0-9_]+$/;
const workflowRoleRegex = /^[a-zA-Z0-9_]+$/;
const identityGroupRegex = /^bcm:[a-zA-Z0-9_:-]+$/;

export const workflowDefinitionStatusSchema = z.enum([
  "draft",
  "published",
  "deprecated",
  "archived",
]);

export const workflowVersionStatusSchema = z.enum(["draft", "published"]);

export const workflowDataScopeInputSchema = z.object({
  tenant: z.string().trim().min(1),
  businessUnit: z.string().trim().min(1),
  clientIds: z.array(z.string().trim().min(1)).optional(),
});

export type WorkflowDataScopeInput = z.infer<typeof workflowDataScopeInputSchema>;

export const workflowNodeInputSchema = z.object({
  id: z.string().uuid().optional(),
  nodeKey: z.string().trim().regex(nodeKeyRegex, "Node key mag alleen letters, cijfers en underscores bevatten."),
  block: blockReferenceSchema,
  configuration: z.unknown().optional().default({}),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .default({ x: 0, y: 0 }),
});

export type WorkflowNodeInput = z.infer<typeof workflowNodeInputSchema>;

export const workflowEdgeInputSchema = z.object({
  id: z.string().uuid().optional(),
  edgeKey: z.string().trim().regex(edgeKeyRegex, "Edge key mag alleen letters, cijfers en underscores bevatten."),
  sourceNodeId: z.string().uuid(),
  sourcePort: z.string().trim().min(1),
  targetNodeId: z.string().uuid(),
  targetPort: z.string().trim().min(1),
  condition: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type WorkflowEdgeInput = z.infer<typeof workflowEdgeInputSchema>;

export const workflowRuntimePermissionSchema = z.enum([
  "workflow:start",
  "workflow:tasks:execute",
  "workflow:approve",
]);

export type WorkflowRuntimePermission = z.infer<typeof workflowRuntimePermissionSchema>;

export const workflowRoleBindingInputSchema = z.object({
  workflowRole: z.string().trim().regex(workflowRoleRegex, "Workflowrol bevat ongeldige tekens."),
  identityGroup: z.string().trim().regex(identityGroupRegex, "Identiteitgroep moet beginnen met bcm: en mag alleen letters, cijfers, underscore, dubbele punt en streepje bevatten."),
  permissions: z.array(workflowRuntimePermissionSchema).min(1),
  tenant: z.string().trim().min(1),
  businessUnit: z.string().trim().min(1),
  clientIds: z.array(z.string().trim().min(1)).optional(),
});

export type WorkflowRoleBindingInput = z.infer<typeof workflowRoleBindingInputSchema>;

export const workflowDraftMetadataSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
});

export type WorkflowDraftMetadata = z.infer<typeof workflowDraftMetadataSchema>;

export const createWorkflowDraftInputSchema = workflowDraftMetadataSchema.extend({
  scope: workflowDataScopeInputSchema,
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(slugRegex, "Slug mag alleen kleine letters, cijfers, koppeltekens en underscores bevatten."),
  nodes: z.array(workflowNodeInputSchema).default([]),
  edges: z.array(workflowEdgeInputSchema).default([]),
  roleBindings: z.array(workflowRoleBindingInputSchema).default([]),
});

export type CreateWorkflowDraftInput = z.infer<typeof createWorkflowDraftInputSchema>;

export const updateWorkflowDraftInputSchema = z.object({
  definitionId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  metadata: workflowDraftMetadataSchema.partial().optional(),
  nodes: z.array(workflowNodeInputSchema).optional(),
  edges: z.array(workflowEdgeInputSchema).optional(),
  roleBindings: z.array(workflowRoleBindingInputSchema).optional(),
});

export type UpdateWorkflowDraftInput = z.infer<typeof updateWorkflowDraftInputSchema>;

export const cloneWorkflowInputSchema = z.object({
  sourceDefinitionId: z.string().uuid().optional(),
  sourceVersionId: z.string().uuid().optional(),
  scope: workflowDataScopeInputSchema,
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(slugRegex, "Slug mag alleen kleine letters, cijfers, koppeltekens en underscores bevatten."),
  metadata: workflowDraftMetadataSchema.partial().optional(),
  ownerUserId: z.string().trim().min(1).optional(),
}).refine(
  (value) => Boolean(value.sourceDefinitionId) || Boolean(value.sourceVersionId),
  {
    message: "Geef een sourceDefinitionId of sourceVersionId op.",
  },
);

export type CloneWorkflowInput = z.infer<typeof cloneWorkflowInputSchema>;

export const publishWorkflowInputSchema = z.object({
  definitionId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
});

export type PublishWorkflowInput = z.infer<typeof publishWorkflowInputSchema>;

export const deprecateWorkflowInputSchema = z.object({
  definitionId: z.string().uuid(),
});

export type DeprecateWorkflowInput = z.infer<typeof deprecateWorkflowInputSchema>;

export const submitForReviewInputSchema = z.object({
  definitionId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  notes: z.string().trim().max(2000).optional(),
});

export type SubmitForReviewInput = z.infer<typeof submitForReviewInputSchema>;

export const loadWorkflowInputSchema = z.object({
  definitionId: z.string().uuid().optional(),
  versionId: z.string().uuid().optional(),
  includeDraft: z.boolean().default(false),
}).refine(
  (value) => Boolean(value.definitionId) !== Boolean(value.versionId),
  {
    message: "Geef precies één van definitionId of versionId op.",
  },
);

// Callers may omit includeDraft; the schema supplies the false default.
export type LoadWorkflowInput = z.input<typeof loadWorkflowInputSchema>;
