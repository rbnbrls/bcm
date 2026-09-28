import { z } from "zod";

const roleId = z.string().regex(/^[a-z][a-z0-9_-]*$/, "Gebruik een geldige rol-ID.");
const variableId = z.string().regex(/^[a-z][a-z0-9_]*$/, "Gebruik een stabiele snake_case variabele-ID.");
const placeholderPattern = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

export const workflowNotificationChannelSchema = z.enum(["in_app", "email"]);
export const workflowNotificationTriggerSchema = z.enum(["on_reached", "on_workflow_completed", "on_workflow_failed"]);

export function extractWorkflowTemplateVariables(template: string): readonly string[] {
  return Object.freeze([...template.matchAll(placeholderPattern)].map((match) => match[1]!));
}

function hasInvalidTemplateSyntax(template: string): boolean {
  return template.replace(placeholderPattern, "").includes("{{") || template.replace(placeholderPattern, "").includes("}}");
}

export const workflowNotificationConfigurationSchema = z.object({
  recipientRoleIds: z.array(roleId).min(1).max(20),
  channel: workflowNotificationChannelSchema,
  trigger: workflowNotificationTriggerSchema,
  subjectTemplate: z.string().trim().min(1).max(160).regex(/^[^\r\n]+$/, "Onderwerp mag geen regeleinden bevatten."),
  messageTemplate: z.string().trim().min(1).max(5_000),
  templateVariables: z.array(variableId).max(100).default([]),
}).strict().superRefine((configuration, context) => {
  if (new Set(configuration.recipientRoleIds).size !== configuration.recipientRoleIds.length) {
    context.addIssue({ code: "custom", path: ["recipientRoleIds"], message: "Ontvangersrollen moeten uniek zijn." });
  }
  if (new Set(configuration.templateVariables).size !== configuration.templateVariables.length) {
    context.addIssue({ code: "custom", path: ["templateVariables"], message: "Templatevariabelen moeten uniek zijn." });
  }
  if (hasInvalidTemplateSyntax(configuration.subjectTemplate)) context.addIssue({ code: "custom", path: ["subjectTemplate"], message: "Gebruik uitsluitend placeholders zoals {{ variabele_id }}." });
  if (hasInvalidTemplateSyntax(configuration.messageTemplate)) context.addIssue({ code: "custom", path: ["messageTemplate"], message: "Gebruik uitsluitend placeholders zoals {{ variabele_id }}." });
  const declared = new Set(configuration.templateVariables);
  const used = new Set([
    ...extractWorkflowTemplateVariables(configuration.subjectTemplate),
    ...extractWorkflowTemplateVariables(configuration.messageTemplate),
  ]);
  for (const variable of used) {
    if (!declared.has(variable)) context.addIssue({ code: "custom", path: ["templateVariables"], message: `Templatevariabele ${variable} is niet gedeclareerd.` });
  }
  for (const variable of declared) {
    if (!used.has(variable)) context.addIssue({ code: "custom", path: ["templateVariables"], message: `Gedeclareerde templatevariabele ${variable} wordt niet gebruikt.` });
  }
});

export type WorkflowNotificationConfiguration = z.infer<typeof workflowNotificationConfigurationSchema>;
export type WorkflowNotificationChannel = z.infer<typeof workflowNotificationChannelSchema>;
export type WorkflowNotificationTrigger = z.infer<typeof workflowNotificationTriggerSchema>;

export function escapeWorkflowNotificationValue(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return (serialized ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type WorkflowNotificationRenderResult =
  | { valid: true; subject: string; message: string; usedVariables: readonly string[] }
  | { valid: false; issues: readonly { variableId?: string; message: string }[] };

export function renderWorkflowNotification(
  configuration: unknown,
  variables: Readonly<Record<string, unknown>>,
): WorkflowNotificationRenderResult {
  const parsed = workflowNotificationConfigurationSchema.safeParse(configuration);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map((item) => ({ message: item.message })) };
  const missing = parsed.data.templateVariables.filter((variable) => variables[variable] === undefined);
  if (missing.length > 0) return { valid: false, issues: missing.map((variableId) => ({ variableId, message: `Templatevariabele ${variableId} ontbreekt.` })) };
  const render = (template: string) => template.replace(placeholderPattern, (_placeholder, variable: string) => escapeWorkflowNotificationValue(variables[variable]));
  const subject = render(parsed.data.subjectTemplate);
  const message = render(parsed.data.messageTemplate);
  if (subject.length > 300 || message.length > 10_000) return { valid: false, issues: [{ message: "Gerenderde notificatie overschrijdt de veilige lengtegrens." }] };
  return { valid: true, subject, message, usedVariables: Object.freeze([...parsed.data.templateVariables]) };
}
