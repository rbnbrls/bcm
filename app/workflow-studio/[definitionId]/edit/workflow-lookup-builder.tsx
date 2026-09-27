"use client";

import type { PublicDataCatalogAttribute, PublicDataCatalogResource } from "@/lib/workflow-studio/data-catalog";
import { workflowLookupConfigurationSchema } from "@/lib/workflow-studio/lookup-schema";
import type { WorkflowVariableOption } from "@/lib/workflow-studio/properties-schema";
import { WorkflowVariablePicker } from "./workflow-variable-picker";

type LooseFilter = { attributeId: string; source: "literal" | "variable"; value?: unknown; variableId?: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function maskedValue(attribute: PublicDataCatalogAttribute): string | number | boolean {
  if (attribute.valueType === "integer") return 101;
  if (attribute.valueType === "boolean") return true;
  if (attribute.valueType === "date") return "2026-01-15";
  if (attribute.valueType === "reference") return "REF-***";
  return attribute.id.includes("name") ? "Voorbeeld ***" : "DEMO-***";
}

function literalValue(value: string, attribute: PublicDataCatalogAttribute | undefined): string | number | boolean | null {
  if (!attribute) return value;
  if (attribute.valueType === "integer") return Number.isFinite(Number(value)) ? Number(value) : 0;
  if (attribute.valueType === "boolean") return value === "true";
  return value;
}

export function WorkflowLookupBuilder({
  configuration,
  catalog,
  variableOptions,
  onChange,
}: {
  configuration: unknown;
  catalog: readonly PublicDataCatalogResource[];
  variableOptions: readonly WorkflowVariableOption[];
  onChange: (configuration: Readonly<Record<string, unknown>>, message: string) => void;
}) {
  const config = record(configuration);
  const resource = catalog.find((item) => item.id === config.resourceId) ?? catalog[0];
  if (!resource) return <p>Geen geautoriseerde data-catalogusresources beschikbaar.</p>;
  const filters = Array.isArray(config.filters) ? config.filters as LooseFilter[] : [];
  const displayFields = Array.isArray(config.displayFields) ? config.displayFields.filter((item): item is string => typeof item === "string") : [];
  const selection = config.selection === "many" ? "many" : "one";
  const outputVariable = typeof config.outputVariable === "string" ? config.outputVariable : `geselecteerde_${resource.id}`;
  const parent = record(config.parentBinding);
  const parentMode = parent.mode === "scope_client" || parent.mode === "attribute" ? parent.mode : "none";
  const previewAttributes = resource.attributes.filter((attribute) => displayFields.includes(attribute.id));
  const visiblePreviewAttributes = previewAttributes.length > 0
    ? previewAttributes
    : resource.attributes.filter((attribute) => attribute.id === resource.identityAttributeId);
  const previewRecord = Object.fromEntries(visiblePreviewAttributes.map((attribute) => [attribute.id, maskedValue(attribute)]));
  const contract = workflowLookupConfigurationSchema.safeParse({
    resourceId: resource.id,
    filters,
    ...(parentMode === "none" ? {} : { parentBinding: parent }),
    displayFields,
    selection,
    outputVariable,
  });

  function emit(patch: Record<string, unknown>, message: string) {
    onChange({
      resourceId: resource.id,
      filters,
      displayFields,
      selection,
      outputVariable,
      ...(parentMode === "none" ? {} : { parentBinding: parent }),
      ...patch,
    }, message);
  }

  function changeResource(resourceId: string) {
    const next = catalog.find((item) => item.id === resourceId);
    if (!next) return;
    emit({
      resourceId,
      filters: [],
      parentBinding: undefined,
      displayFields: next.attributes.slice(0, 3).map((attribute) => attribute.id),
      outputVariable: `geselecteerde_${resourceId}`,
    }, "Lookupresource gewijzigd.");
  }

  function updateFilter(index: number, patch: Partial<LooseFilter>) {
    emit({ filters: filters.map((filter, filterIndex) => filterIndex === index ? { ...filter, ...patch } : filter) }, "Lookupfilter gewijzigd.");
  }

  return (
    <fieldset className="workflow-lookup-properties">
      <legend>Client-config lookup configureren</legend>
      <label>Resource
        <select value={resource.id} onChange={(event) => changeResource(event.target.value)}>{catalog.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>
      </label>
      <p>{resource.description}</p>

      <fieldset className="workflow-lookup-fields">
        <legend>Getoonde velden</legend>
        {resource.attributes.map((attribute) => <label key={attribute.id}><input type="checkbox" checked={displayFields.includes(attribute.id)} onChange={(event) => emit({ displayFields: event.target.checked ? [...displayFields, attribute.id] : displayFields.filter((id) => id !== attribute.id) }, "Getoonde lookupvelden gewijzigd.")} /> {attribute.label} <small>{attribute.valueType}</small></label>)}
      </fieldset>

      <fieldset className="workflow-lookup-parent">
        <legend>Afhankelijke selectie</legend>
        <label>Parent-binding
          <select value={parentMode} onChange={(event) => {
            const mode = event.target.value;
            emit({ parentBinding: mode === "none" ? undefined : mode === "scope_client" ? { mode, sourceVariable: "geselecteerde_client" } : { mode, sourceVariable: "parent_output", targetAttributeId: resource.attributes[0]?.id ?? resource.identityAttributeId } }, "Parent-binding gewijzigd.");
          }}>
            <option value="none">Geen</option>
            <option value="scope_client">Clientscope uit eerdere lookup</option>
            <option value="attribute">Eerdere output aan attribuut binden</option>
          </select>
        </label>
        {parentMode !== "none" && <WorkflowVariablePicker label="Parent-outputvariabele" value={typeof parent.sourceVariable === "string" ? parent.sourceVariable : ""} options={variableOptions} onChange={(value) => emit({ parentBinding: { ...parent, sourceVariable: value } }, "Parent-output gewijzigd.")} />}
        {parentMode === "attribute" && <label>Doelattribuut<select value={typeof parent.targetAttributeId === "string" ? parent.targetAttributeId : resource.identityAttributeId} onChange={(event) => emit({ parentBinding: { ...parent, targetAttributeId: event.target.value } }, "Parentattribuut gewijzigd.")}>{resource.attributes.map((attribute) => <option value={attribute.id} key={attribute.id}>{attribute.label}</option>)}</select></label>}
      </fieldset>

      <fieldset className="workflow-lookup-filters">
        <legend>Exacte filters</legend>
        {filters.map((filter, index) => {
          const attribute = resource.attributes.find((item) => item.id === filter.attributeId);
          return <div key={`${filter.attributeId}:${index}`}>
            <label>Attribuut<select value={filter.attributeId} onChange={(event) => updateFilter(index, { attributeId: event.target.value })}>{resource.attributes.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
            <label>Bron<select value={filter.source} onChange={(event) => updateFilter(index, event.target.value === "variable" ? { source: "variable", variableId: "filter_variabele", value: undefined } : { source: "literal", value: "", variableId: undefined })}><option value="literal">Vaste waarde</option><option value="variable">Workflowvariabele</option></select></label>
            {filter.source === "variable"
              ? <WorkflowVariablePicker label="Variabele" value={filter.variableId ?? ""} options={variableOptions} onChange={(value) => updateFilter(index, { variableId: String(value) })} />
              : <label>Waarde<input value={filter.value === null || filter.value === undefined ? "" : String(filter.value)} onChange={(event) => updateFilter(index, { value: literalValue(event.target.value, attribute) })} /></label>}
            <button type="button" aria-label={`Verwijder filter ${attribute?.label ?? index + 1}`} onClick={() => emit({ filters: filters.filter((_, filterIndex) => filterIndex !== index) }, "Lookupfilter verwijderd.")}>×</button>
          </div>;
        })}
        <button type="button" className="button" disabled={resource.attributes.length === 0 || filters.length >= 10} onClick={() => emit({ filters: [...filters, { attributeId: resource.attributes.find((attribute) => !filters.some((filter) => filter.attributeId === attribute.id))?.id ?? resource.identityAttributeId, source: "literal", value: "" }] }, "Lookupfilter toegevoegd.")}>Filter toevoegen</button>
      </fieldset>

      <label>Selectiegedrag<select value={selection} onChange={(event) => emit({ selection: event.target.value }, "Selectiegedrag gewijzigd.")}><option value="one">Eén record</option><option value="many">Meerdere records</option></select></label>
      <label>Outputvariabele<input value={outputVariable} onChange={(event) => emit({ outputVariable: event.target.value }, "Lookupoutput gewijzigd.")} /></label>
      <div className="workflow-lookup-contract" data-valid={contract.success}>{contract.success ? "Lookupcontract geldig" : contract.error.issues[0]?.message}</div>

      <section className="workflow-lookup-preview" aria-labelledby="lookup-preview-title">
        <h3 id="lookup-preview-title">Preview met testdata</h3>
        <p>Geen productiegegevens · waarden zijn gemaskeerd</p>
        <code>{outputVariable}: {selection === "many" ? "array<object>" : "object"}</code>
        <dl>{visiblePreviewAttributes.map((attribute) => <div key={attribute.id}><dt>{attribute.label} <small>{attribute.valueType}</small></dt><dd>{String(previewRecord[attribute.id])}</dd></div>)}</dl>
      </section>
    </fieldset>
  );
}
