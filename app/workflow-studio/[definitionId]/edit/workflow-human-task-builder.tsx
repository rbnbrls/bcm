"use client";

import type { WorkflowVariableOption } from "@/lib/workflow-studio/properties-schema";
import { WorkflowVariablePicker } from "./workflow-variable-picker";

type HumanBlockType = "role_task" | "approval";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function variableList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function WorkflowHumanTaskBuilder({
  blockType,
  configuration,
  variableOptions,
  onChange,
}: {
  blockType: HumanBlockType;
  configuration: unknown;
  variableOptions: readonly WorkflowVariableOption[];
  onChange: (configuration: Readonly<Record<string, unknown>>, message: string) => void;
}) {
  const config = record(configuration);
  const roleId = typeof config.roleId === "string" ? config.roleId : blockType === "approval" ? "goedkeurder" : "uitvoerder";
  const title = typeof config.title === "string" ? config.title : blockType === "approval" ? "Nieuwe goedkeuring" : "Nieuwe taak";
  const instructions = typeof config.instructions === "string" ? config.instructions : "";
  const inputs = variableList(config.inputVariables);
  const outputs = variableList(config.outputVariables);
  const decisionLabels = { approved: "Goedkeuren", rejected: "Afwijzen", returned: "Terugsturen", ...record(config.decisionLabels) };

  function patch(next: Record<string, unknown>, message: string) {
    onChange({ ...config, ...next }, message);
  }

  function parseVariables(value: string): string[] {
    return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  }

  return (
    <fieldset className="workflow-human-properties">
      <legend>{blockType === "approval" ? "Goedkeuring configureren" : "Roltaak configureren"}</legend>
      <label>{blockType === "approval" ? "Goedkeurdersrol" : "Uitvoerdersrol"}
        <input value={roleId} aria-invalid={!/^[a-z][a-z0-9_-]*$/.test(roleId)} onChange={(event) => patch({ roleId: event.target.value }, "Workflowrol gewijzigd.")} />
      </label>
      <label>Titel<input value={title} onChange={(event) => patch({ title: event.target.value }, "Taaktitel gewijzigd.")} /></label>
      <label>Instructies<textarea value={instructions} onChange={(event) => patch({ instructions: event.target.value }, "Taakinstructies gewijzigd.")} /></label>
      <WorkflowVariablePicker label="Invoervariabelen" value={inputs} options={variableOptions} multiple onChange={(value) => patch({ inputVariables: value }, "Taakinvoer gewijzigd.")} />

      {blockType === "role_task" ? <>
        <label>Uitvoervariabelen
          <input value={outputs.join(", ")} onChange={(event) => patch({ outputVariables: parseVariables(event.target.value) }, "Taakuitvoer gewijzigd.")} placeholder="bevestiging, resultaat" />
        </label>
        <label>Deadline in uren
          <input type="number" min="1" max="8760" value={typeof config.deadlineHours === "number" ? config.deadlineHours : ""} onChange={(event) => patch({ deadlineHours: event.target.value ? Number(event.target.value) : undefined }, "Taakdeadline gewijzigd.")} />
        </label>
        <dl className="workflow-human-preview">
          <div><dt>Toegewezen aan</dt><dd>{roleId}</dd></div>
          <div><dt>Invoer</dt><dd>{inputs.join(", ") || "Geen"}</dd></div>
          <div><dt>Uitvoer</dt><dd>{outputs.join(", ") || "Geen"}</dd></div>
        </dl>
      </> : <>
        <fieldset className="workflow-approval-decisions">
          <legend>Besluiten en opmerkingen</legend>
          {(["approved", "rejected", "returned"] as const).map((decision) => {
            const commentKey = decision === "approved" ? "requireCommentOnApprove" : decision === "rejected" ? "requireCommentOnReject" : "requireCommentOnReturn";
            return (
              <div key={decision}>
                <label>{decision === "approved" ? "Goedkeuren" : decision === "rejected" ? "Afwijzen" : "Terugsturen"}
                  <input value={String(decisionLabels[decision])} onChange={(event) => patch({ decisionLabels: { ...decisionLabels, [decision]: event.target.value } }, "Besluitlabel gewijzigd.")} />
                </label>
                <label className="workflow-form-check"><input type="checkbox" checked={config[commentKey] === true || (config[commentKey] === undefined && decision !== "approved")} onChange={(event) => patch({ [commentKey]: event.target.checked }, "Opmerkingenbeleid gewijzigd.")} /> Opmerking verplicht</label>
              </div>
            );
          })}
        </fieldset>
        <div className="workflow-approval-preview" aria-label="Goedkeuringsacties">
          <button type="button">{String(decisionLabels.approved)}</button>
          <button type="button">{String(decisionLabels.rejected)}</button>
          <button type="button">{String(decisionLabels.returned)}</button>
        </div>
      </>}
      <p className="workflow-role-hint">Voor publicatie moet deze workflowrol een passende rolbinding hebben. Starter en goedkeurder moeten functiescheidend zijn.</p>
    </fieldset>
  );
}
