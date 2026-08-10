"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { updateWorkflowMetadataAction, type UpdateWorkflowMetadataState } from "@/app/workflow-studio/actions";
import type { WorkflowCategory, WorkflowCostModel } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowPreviewMetadata } from "@/lib/workflow-studio/workflow-preview";

export type WorkflowEditorMetadata = {
  definitionId: string;
  name: string;
  slug: string;
  description: string;
  category: WorkflowCategory;
  tags: readonly string[];
  catalogDescription: string;
  costModel: WorkflowCostModel;
  ownerUserId: string;
  scope: { tenant: string; businessUnit: string; clientIds: readonly string[] | null };
};

const initialActionState: UpdateWorkflowMetadataState = { success: false, message: "" };
const categoryLabels: Record<WorkflowCategory, string> = {
  change: "Change",
  operations: "Operations",
  compliance: "Compliance",
  data: "Data",
  other: "Overig",
};

function requiredError(value: string, label: string, minimum = 1): string | null {
  return value.trim().length >= minimum ? null : `${label} is verplicht${minimum > 1 ? ` (minimaal ${minimum} tekens)` : ""}.`;
}

export function WorkflowMetadataPanel({
  initial,
  revision,
  onRevisionChange,
  onPreviewChange,
}: {
  initial: WorkflowEditorMetadata;
  revision: string;
  onRevisionChange: (revision: string) => void;
  onPreviewChange: (metadata: WorkflowPreviewMetadata) => void;
}) {
  const [state, action, pending] = useActionState(updateWorkflowMetadataAction, initialActionState);
  const [metadata, setMetadata] = useState({
    name: initial.name,
    slug: initial.slug,
    description: initial.description,
    category: initial.category,
    tags: initial.tags.join(", "),
    catalogDescription: initial.catalogDescription,
    baseCost: String(initial.costModel.baseCost),
    perItemCost: initial.costModel.perItemCost === undefined ? "" : String(initial.costModel.perItemCost),
    currency: initial.costModel.currency,
    costDescription: initial.costModel.description,
  });
  const errors = useMemo(() => ({
    name: requiredError(metadata.name, "Naam", 2),
    slug: /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(metadata.slug) ? null : "Gebruik kleine letters, cijfers, koppeltekens of underscores.",
    description: requiredError(metadata.description, "Doel", 10),
    catalogDescription: requiredError(metadata.catalogDescription, "Catalogusbeschrijving", 10),
    baseCost: metadata.baseCost.trim() !== "" && Number(metadata.baseCost) >= 0
      ? null
      : "Vul niet-negatieve basiskosten in.",
    currency: /^[A-Za-z]{3}$/.test(metadata.currency) ? null : "Gebruik een valutacode van drie letters.",
  }), [metadata]);
  const invalid = Object.values(errors).some(Boolean);

  useEffect(() => {
    if (state.success && state.revision) onRevisionChange(state.revision);
  }, [onRevisionChange, state.revision, state.success]);

  function field<K extends keyof typeof metadata>(name: K, value: (typeof metadata)[K]) {
    setMetadata((current) => {
      const next = { ...current, [name]: value };
      const baseCost = Number(next.baseCost);
      const perItemCost = next.perItemCost.trim() === "" ? undefined : Number(next.perItemCost);
      onPreviewChange({
        name: next.name,
        description: next.description,
        catalogDescription: next.catalogDescription,
        costModel: {
          baseCost: Number.isFinite(baseCost) ? baseCost : 0,
          ...(perItemCost !== undefined && Number.isFinite(perItemCost) ? { perItemCost } : {}),
          currency: /^[A-Z]{3}$/.test(next.currency) ? next.currency : "EUR",
          description: next.costDescription,
        },
      });
      return next;
    });
  }

  return (
    <details className="workflow-metadata" open>
      <summary>Workflowmetadata en cataloguspreview</summary>
      <div className="workflow-metadata-layout">
        <form action={action} className="workflow-metadata-form" noValidate>
          <input type="hidden" name="definitionId" value={initial.definitionId} />
          <input type="hidden" name="expectedRevision" value={revision} />
          <label>Naam *<input name="name" value={metadata.name} onChange={(event) => field("name", event.target.value)} aria-invalid={Boolean(errors.name)} /></label>
          {errors.name && <small role="alert">{errors.name}</small>}
          <label>Slug *<input name="slug" value={metadata.slug} onChange={(event) => field("slug", event.target.value)} aria-invalid={Boolean(errors.slug)} /></label>
          {errors.slug && <small role="alert">{errors.slug}</small>}
          <label className="workflow-metadata-wide">Doel *<textarea name="description" value={metadata.description} onChange={(event) => field("description", event.target.value)} aria-invalid={Boolean(errors.description)} /></label>
          {errors.description && <small role="alert">{errors.description}</small>}
          <label>Categorie *<select name="category" value={metadata.category} onChange={(event) => field("category", event.target.value as WorkflowCategory)}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Tags<input name="tags" value={metadata.tags} onChange={(event) => field("tags", event.target.value)} placeholder="audit, standaard, klant" /></label>
          <label className="workflow-metadata-wide">Catalogusbeschrijving *<textarea name="catalogDescription" value={metadata.catalogDescription} onChange={(event) => field("catalogDescription", event.target.value)} aria-invalid={Boolean(errors.catalogDescription)} /></label>
          {errors.catalogDescription && <small role="alert">{errors.catalogDescription}</small>}
          <fieldset className="workflow-cost-fields"><legend>Kostenmodel</legend>
            <label>Basiskosten *<input name="baseCost" type="number" min="0" step="0.01" value={metadata.baseCost} onChange={(event) => field("baseCost", event.target.value)} /></label>
            <label>Per item<input name="perItemCost" type="number" min="0" step="0.01" value={metadata.perItemCost} onChange={(event) => field("perItemCost", event.target.value)} /></label>
            <label>Valuta *<input name="currency" maxLength={3} value={metadata.currency} onChange={(event) => field("currency", event.target.value.toUpperCase())} /></label>
            <label>Toelichting<input name="costDescription" value={metadata.costDescription} onChange={(event) => field("costDescription", event.target.value)} /></label>
          </fieldset>
          <dl className="workflow-metadata-managed">
            <div><dt>Eigenaar</dt><dd>{initial.ownerUserId}</dd></div>
            <div><dt>Standaardscope</dt><dd>{initial.scope.tenant} · {initial.scope.businessUnit}{initial.scope.clientIds?.length ? ` · ${initial.scope.clientIds.join(", ")}` : " · alle clients"}</dd></div>
          </dl>
          {state.message && <p className={state.success ? "workflow-metadata-success" : "form-error"} role="status">{state.message}</p>}
          {state.fieldErrors && Object.entries(state.fieldErrors).flatMap(([key, messages]) => messages.map((message) => <small role="alert" key={`${key}:${message}`}>{message}</small>))}
          <button className="button button-primary" type="submit" disabled={invalid || pending}>{pending ? "Opslaan…" : "Metadata opslaan"}</button>
        </form>

        <article className="workflow-catalog-preview" aria-labelledby="catalog-preview-title">
          <p className="eyebrow">CATALOGUSPREVIEW</p>
          <h2 id="catalog-preview-title">{metadata.name || "Naamloze workflow"}</h2>
          <code>{metadata.slug || "slug"}</code>
          <p>{metadata.catalogDescription || "De catalogusbeschrijving verschijnt hier."}</p>
          <dl>
            <div><dt>Doel</dt><dd>{metadata.description || "—"}</dd></div>
            <div><dt>Categorie</dt><dd>{categoryLabels[metadata.category]}</dd></div>
            <div><dt>Eigenaar</dt><dd>{initial.ownerUserId}</dd></div>
            <div><dt>Kosten</dt><dd>{metadata.currency || "EUR"} {Number(metadata.baseCost || 0).toFixed(2)}{metadata.perItemCost ? ` + ${metadata.currency} ${Number(metadata.perItemCost).toFixed(2)} per item` : ""}</dd></div>
            <div><dt>Scope</dt><dd>{initial.scope.tenant} / {initial.scope.businessUnit}</dd></div>
          </dl>
          <ul>{metadata.tags.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => <li key={tag}>{tag}</li>)}</ul>
        </article>
      </div>
    </details>
  );
}
