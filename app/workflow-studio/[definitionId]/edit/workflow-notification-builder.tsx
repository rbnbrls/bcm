"use client";

import { useState } from "react";
import {
  renderWorkflowNotification,
  workflowNotificationConfigurationSchema,
  type WorkflowNotificationChannel,
  type WorkflowNotificationTrigger,
} from "@/lib/workflow-studio/notification-schema";
import type { WorkflowVariableOption } from "@/lib/workflow-studio/properties-schema";
import { WorkflowVariablePicker } from "./workflow-variable-picker";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function WorkflowNotificationBuilder({ configuration, variableOptions, onChange }: {
  configuration: unknown;
  variableOptions: readonly WorkflowVariableOption[];
  onChange: (configuration: Readonly<Record<string, unknown>>, message: string) => void;
}) {
  const config = record(configuration);
  const recipientRoleIds = stringList(config.recipientRoleIds);
  const channel: WorkflowNotificationChannel = config.channel === "email" ? "email" : "in_app";
  const trigger: WorkflowNotificationTrigger = config.trigger === "on_workflow_completed" || config.trigger === "on_workflow_failed" ? config.trigger : "on_reached";
  const subjectTemplate = typeof config.subjectTemplate === "string" ? config.subjectTemplate : "Workflowupdate";
  const messageTemplate = typeof config.messageTemplate === "string" ? config.messageTemplate : "Er is een workflowupdate.";
  const templateVariables = stringList(config.templateVariables);
  const [examples, setExamples] = useState<Record<string, string>>({});
  const normalized = { recipientRoleIds, channel, trigger, subjectTemplate, messageTemplate, templateVariables };
  const contract = workflowNotificationConfigurationSchema.safeParse(normalized);
  const exampleValues = Object.fromEntries(templateVariables.map((variable) => [variable, examples[variable] ?? `<voorbeeld & ${variable}>`]));
  const preview = renderWorkflowNotification(normalized, exampleValues);

  function patch(next: Record<string, unknown>, message: string) {
    onChange({ ...normalized, ...next }, message);
  }

  return <fieldset className="workflow-notification-properties">
    <legend>Notificatie configureren</legend>
    <label>Ontvangersrollen
      <input value={recipientRoleIds.join(", ")} onChange={(event) => patch({ recipientRoleIds: parseList(event.target.value) }, "Notificatieontvangers gewijzigd.")} placeholder="aanvrager, operations" />
    </label>
    <label>Kanaal<select value={channel} onChange={(event) => patch({ channel: event.target.value }, "Notificatiekanaal gewijzigd.")}><option value="in_app">In-app</option><option value="email">E-mail</option></select></label>
    <label>Triggerpunt<select value={trigger} onChange={(event) => patch({ trigger: event.target.value }, "Notificatietrigger gewijzigd.")}><option value="on_reached">Wanneer dit blok wordt bereikt</option><option value="on_workflow_completed">Wanneer de workflow voltooit</option><option value="on_workflow_failed">Wanneer de workflow faalt</option></select></label>
    <WorkflowVariablePicker label="Templatevariabelen" value={templateVariables} options={variableOptions} multiple onChange={(value) => patch({ templateVariables: value }, "Templatevariabelen gewijzigd.")} />
    <p>Gebruik uitsluitend gedeclareerde placeholders zoals <code>{"{{ aanvraagnummer }}"}</code>.</p>
    <label>Onderwerptemplate<input value={subjectTemplate} onChange={(event) => patch({ subjectTemplate: event.target.value }, "Notificatieonderwerp gewijzigd.")} /></label>
    <label>Berichttemplate<textarea value={messageTemplate} onChange={(event) => patch({ messageTemplate: event.target.value }, "Notificatiebericht gewijzigd.")} /></label>
    <div className="workflow-notification-contract" data-valid={contract.success}>{contract.success ? "Notificatiecontract geldig" : contract.error.issues[0]?.message}</div>

    <section className="workflow-notification-preview" aria-labelledby="notification-preview-title">
      <h3 id="notification-preview-title">Veilige templatepreview</h3>
      {templateVariables.map((variable) => <label key={variable}>{variable}<input value={examples[variable] ?? `<voorbeeld & ${variable}>`} onChange={(event) => setExamples({ ...examples, [variable]: event.target.value })} /></label>)}
      {preview.valid ? <article>
        <span>{channel === "email" ? "E-mail" : "In-app"} · {recipientRoleIds.join(", ")}</span>
        <strong>{preview.subject}</strong>
        <p>{preview.message}</p>
      </article> : <output>{preview.issues[0]?.message}</output>}
      <small>Templatewaarden worden als tekst verwerkt en HTML-geëscapet. Vrije webhook-URL&apos;s zijn niet beschikbaar.</small>
    </section>
  </fieldset>;
}
