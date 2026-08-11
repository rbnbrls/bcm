import { z } from "zod";

const variableId = z.string().regex(/^[a-z][a-z0-9_]*$/);
const secretRef = z.string().regex(/^secret:[a-z][a-z0-9_.-]*$/);

export const WORKFLOW_INTEGRATION_CONNECTORS = [
  "servicenow.create_ticket.v1",
  "slack.post_message.v1",
  "teams.post_message.v1",
] as const;

export const workflowIntegrationConnectorSchema = z.enum(WORKFLOW_INTEGRATION_CONNECTORS);
export type WorkflowIntegrationConnector = z.infer<typeof workflowIntegrationConnectorSchema>;

export const workflowIntegrationRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5).default(3),
  backoff: z.enum(["fixed", "exponential"]).default("exponential"),
}).strict().default({ maxAttempts: 3, backoff: "exponential" });

export const workflowIntegrationSecretReferenceSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  secretRef,
}).strict();

export const workflowIntegrationSigningSchema = z.object({
  mode: z.enum(["none", "hmac_sha256"]).default("none"),
  secretRef: secretRef.optional(),
}).strict().default({ mode: "none" }).superRefine((signing, ctx) => {
  if (signing.mode === "hmac_sha256" && !signing.secretRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secretRef"], message: "HMAC-signing vereist een secret reference." });
  }
  if (signing.mode === "none" && signing.secretRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secretRef"], message: "Een signing secret is alleen toegestaan bij hmac_sha256." });
  }
});

export const workflowIntegrationConfigurationSchema = z.object({
  connectorId: workflowIntegrationConnectorSchema,
  connectorVersion: z.number().int().positive().default(1),
  operation: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  inputSchemaVersion: z.number().int().positive().default(1),
  outputSchemaVersion: z.number().int().positive().default(1),
  inputVariables: z.array(variableId).max(100).default([]),
  outputVariable: variableId.optional(),
  secretRefs: z.array(workflowIntegrationSecretReferenceSchema).max(20).default([]),
  timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
  retryPolicy: workflowIntegrationRetryPolicySchema,
  signing: workflowIntegrationSigningSchema,
  sandboxMode: z.boolean().default(true),
}).strict().superRefine((config, ctx) => {
  if (new Set(config.inputVariables).size !== config.inputVariables.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inputVariables"], message: "Inputvariabelen moeten uniek zijn." });
  }
  const secretNames = new Set<string>();
  config.secretRefs.forEach((entry, index) => {
    if (secretNames.has(entry.name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secretRefs", index, "name"], message: "Secretnamen moeten uniek zijn." });
    }
    secretNames.add(entry.name);
  });
});

export type WorkflowIntegrationConfiguration = z.infer<typeof workflowIntegrationConfigurationSchema>;
export type WorkflowIntegrationRetryPolicy = z.infer<typeof workflowIntegrationRetryPolicySchema>;
export type WorkflowIntegrationSecretReference = z.infer<typeof workflowIntegrationSecretReferenceSchema>;
