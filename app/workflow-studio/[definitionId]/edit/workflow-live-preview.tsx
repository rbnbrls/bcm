"use client";

import { useMemo } from "react";
import type { PublicChangeRequestCatalogResource } from "@/lib/workflow-studio/data-catalog";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import type { WorkflowFormField } from "@/lib/workflow-studio/form-schema";
import {
  buildWorkflowPreviewModel,
  workflowPreviewOperationLabel,
  type WorkflowPreviewMetadata,
  type WorkflowPreviewRoleBinding,
} from "@/lib/workflow-studio/workflow-preview";

const blockTypeLabels: Readonly<Record<string, string>> = {
  manual_start: "Start",
  form: "Formulier",
  role_task: "Taak",
  approval: "Goedkeuring",
  client_config_lookup: "Gegevens ophalen",
  change_request: "Wijziging",
  decision: "Beslissing",
  notification: "Notificatie",
  end: "Einde",
};

function ReadOnlyField({ field }: { field: WorkflowFormField }) {
  const label = <>{field.label}{field.required ? " *" : ""}</>;
  if (field.type === "boolean") {
    return <label className="workflow-live-checkbox"><input type="checkbox" checked={field.defaultValue === true} disabled aria-label={`${field.label}${field.required ? " *" : ""}`} /> {label}</label>;
  }
  if (field.type === "longtext") {
    return <label>{label}<textarea value={field.defaultValue ?? ""} readOnly aria-readonly="true" aria-label={`${field.label}${field.required ? " *" : ""}`} />{field.helpText && <small>{field.helpText}</small>}</label>;
  }
  if (field.type === "select" || field.type === "multiselect") {
    const selected = field.type === "multiselect" ? field.defaultValue ?? [] : field.defaultValue ?? "";
    return <label>{label}<select value={selected} multiple={field.type === "multiselect"} disabled aria-readonly="true" aria-label={`${field.label}${field.required ? " *" : ""}`}><option value="">Kies…</option>{field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>{field.helpText && <small>{field.helpText}</small>}</label>;
  }
  return <label>{label}<input
    type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"}
    value={field.defaultValue ?? ""}
    readOnly
    aria-readonly="true"
    aria-label={`${field.label}${field.required ? " *" : ""}`}
  />{field.type === "currency" && <span className="workflow-live-field-suffix">{field.currency}</span>}{field.helpText && <small>{field.helpText}</small>}</label>;
}

function formatCost(metadata: WorkflowPreviewMetadata): string {
  const { baseCost, perItemCost, currency } = metadata.costModel;
  const formatter = new Intl.NumberFormat("nl-NL", { style: "currency", currency });
  return `${formatter.format(baseCost)}${perItemCost === undefined ? "" : ` + ${formatter.format(perItemCost)} per item`}`;
}

function formatHours(hours: number | null): string {
  if (hours === null) return "Niet ingesteld";
  if (hours % 24 === 0) return `${hours / 24} ${hours === 24 ? "dag" : "dagen"}`;
  return `${hours} uur`;
}

export function WorkflowLivePreview({
  metadata,
  nodes,
  edges,
  roleBindings,
  changeRequestCatalog,
  blockCatalog = [],
}: {
  metadata: WorkflowPreviewMetadata;
  nodes: readonly WorkflowEditorNode[];
  edges: readonly WorkflowEditorEdge[];
  roleBindings: readonly WorkflowPreviewRoleBinding[];
  changeRequestCatalog: readonly PublicChangeRequestCatalogResource[];
  blockCatalog?: readonly BlockCatalogEntry[];
}) {
  const preview = useMemo(() => buildWorkflowPreviewModel({
    metadata,
    nodes,
    edges,
    roleBindings,
    changeRequestCatalog,
    blockCatalog,
  }), [blockCatalog, changeRequestCatalog, edges, metadata, nodes, roleBindings]);

  return (
    <details className="workflow-live-preview" open>
      <summary>Live eindgebruikerspreview</summary>
      <div className="workflow-live-preview-body" data-preview-mode="read-only">
        <header>
          <div>
            <p className="eyebrow">DRAFTPREVIEW · ALLEEN-LEZEN</p>
            <h2 aria-label={`Preview: ${preview.metadata.name || "Naamloze workflow"}`}>{preview.metadata.name || "Naamloze workflow"}</h2>
            <p>{preview.metadata.catalogDescription || preview.metadata.description || "Nog geen omschrijving."}</p>
          </div>
          <dl className="workflow-live-summary">
            <div><dt>Kosten</dt><dd>{formatCost(preview.metadata)}</dd></div>
            <div><dt>Indicatieve SLA</dt><dd>{formatHours(preview.slaHours)}</dd></div>
            <div><dt>Processtappen</dt><dd>{preview.steps.length}</dd></div>
          </dl>
        </header>

        {preview.incompleteSections.length > 0 && <aside className="workflow-live-notice" aria-label="Onvolledige preview">
          <strong>Draft nog niet compleet</strong>
          <ul>{preview.incompleteSections.map((message) => <li key={message}>{message}</li>)}</ul>
        </aside>}

        <div className="workflow-live-grid">
          <section aria-labelledby="live-form-title">
            <h3 id="live-form-title">Aanvraagformulier</h3>
            {preview.forms.length === 0 ? <p>Nog geen formulier beschikbaar.</p> : preview.forms.map(({ nodeId, configuration }) => <article className="workflow-live-form" key={nodeId}>
              <h4>{configuration.title}</h4>
              {configuration.description && <p>{configuration.description}</p>}
              <div>{configuration.fields.map((field) => <ReadOnlyField field={field} key={field.id} />)}</div>
            </article>)}
          </section>

          <section aria-labelledby="live-roles-title">
            <h3 id="live-roles-title">Rollen</h3>
            {preview.roles.length === 0 ? <p>Nog geen rollen gebruikt.</p> : <ul className="workflow-live-roles">{preview.roles.map((role) => <li key={role.id}>
              <strong>{role.id}</strong>
              <span>{role.contexts.join(" · ")}</span>
              <small>{role.identityGroups.length ? role.identityGroups.join(", ") : "Nog niet gekoppeld"}</small>
            </li>)}</ul>}
          </section>
        </div>

        <section aria-labelledby="live-change-title">
          <h3 id="live-change-title">IST/SOLL-overzicht</h3>
          {preview.changes.length === 0 ? <p>Deze workflow bevat geen geldig wijzigingsverzoek.</p> : preview.changes.map((change) => <article className="workflow-live-change" key={change.nodeId}>
            <div className="workflow-panel-heading"><h4>{change.title}</h4><span>{workflowPreviewOperationLabel(change.operation)} · {change.resource}</span></div>
            <table><thead><tr><th>Attribuut</th><th>IST</th><th>SOLL</th></tr></thead><tbody>{change.mappings.map((mapping) => <tr key={mapping.attribute}><th>{mapping.attribute}</th><td><code>{mapping.ist}</code></td><td><code>{mapping.soll}</code></td></tr>)}</tbody></table>
            <p>Ingangsdatum: <code>{change.effectiveDateVariable}</code> · Reden: <code>{change.rationaleVariable}</code></p>
          </article>)}
        </section>

        <section aria-labelledby="live-process-title">
          <h3 id="live-process-title">Verwacht proces</h3>
          {preview.steps.length === 0 ? <p>Nog geen processtappen.</p> : <ol className="workflow-live-process">{preview.steps.map((step) => <li key={step.nodeId}>
            <span className="workflow-live-step-type">{blockTypeLabels[step.blockType] ?? step.blockType}</span>
            <div><strong>{step.title}</strong><p>{step.description}</p>{step.roleId && <small>Rol: {step.roleId}</small>}{step.deadlineHours && <small>Deadline: {formatHours(step.deadlineHours)}</small>}{step.branches.length > 1 && <small>Vervolg: {step.branches.join(" / ")}</small>}</div>
          </li>)}</ol>}
        </section>

        <footer>Deze preview gebruikt uitsluitend de actuele lokale draft en kan geen aanvraag indienen of productiedata wijzigen.</footer>
      </div>
    </details>
  );
}
