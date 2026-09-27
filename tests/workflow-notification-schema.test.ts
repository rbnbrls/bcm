import { describe, expect, it } from "vitest";
import {
  escapeWorkflowNotificationValue,
  renderWorkflowNotification,
  workflowNotificationConfigurationSchema,
} from "@/lib/workflow-studio/notification-schema";

const configuration = {
  recipientRoleIds: ["aanvrager", "operations"],
  channel: "email",
  trigger: "on_workflow_completed",
  subjectTemplate: "Aanvraag {{ aanvraagnummer }} afgerond",
  messageTemplate: "Beste {{ clientnaam }}, aanvraag {{ aanvraagnummer }} is verwerkt.",
  templateVariables: ["aanvraagnummer", "clientnaam"],
};

describe("workflow notification templates", () => {
  it("accepts role recipients, managed channels, triggers and declared placeholders", () => {
    expect(workflowNotificationConfigurationSchema.safeParse(configuration).success).toBe(true);
  });

  it("rejects undeclared variables, malformed placeholders and free webhook configuration", () => {
    expect(workflowNotificationConfigurationSchema.safeParse({ ...configuration, templateVariables: ["aanvraagnummer"] }).success).toBe(false);
    expect(workflowNotificationConfigurationSchema.safeParse({ ...configuration, messageTemplate: "Hallo {{ client-name }}" }).success).toBe(false);
    expect(workflowNotificationConfigurationSchema.safeParse({ ...configuration, channel: "webhook", webhookUrl: "https://example.test/hook" }).success).toBe(false);
  });

  it("renders every template value as escaped text", () => {
    const result = renderWorkflowNotification(configuration, {
      aanvraagnummer: "REQ-<&>",
      clientnaam: '<script>alert("x")</script>',
    });
    expect(result).toMatchObject({ valid: true });
    if (!result.valid) return;
    expect(result.subject).toBe("Aanvraag REQ-&lt;&amp;&gt; afgerond");
    expect(result.message).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(result.message).not.toContain("<script>");
    expect(escapeWorkflowNotificationValue("'&")).toBe("&#39;&amp;");
  });

  it("refuses to render when a declared template variable is missing", () => {
    expect(renderWorkflowNotification(configuration, { aanvraagnummer: "REQ-1" }))
      .toMatchObject({ valid: false, issues: [{ variableId: "clientnaam" }] });
  });
});
