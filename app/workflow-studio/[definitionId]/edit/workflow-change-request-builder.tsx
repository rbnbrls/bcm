"use client";

import type {
  PublicChangeRequestCatalogAttribute,
  PublicChangeRequestCatalogResource,
} from "@/lib/workflow-studio/data-catalog";
import {
  workflowChangeRequestConfigurationSchema,
  type WorkflowChangeRequestOperation,
} from "@/lib/workflow-studio/change-request-schema";
import type { WorkflowVariableOption } from "@/lib/workflow-studio/properties-schema";
import { WorkflowVariablePicker } from "./workflow-variable-picker";

type LooseMapping = {
  attributeId: string;
  ist?: { snapshotVariableId: string; snapshotAttributeId: string };
  soll?: { variableId: string };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function operationsFor(resource: PublicChangeRequestCatalogResource): WorkflowChangeRequestOperation[] {
  return ["CREATE", "UPDATE", "RETIRE"].filter((operation) => (
    resource.attributes.some((attribute) => attribute.requestableOperations.includes(operation as WorkflowChangeRequestOperation))
  )) as WorkflowChangeRequestOperation[];
}

function mappingFor(attribute: PublicChangeRequestCatalogAttribute, operation: WorkflowChangeRequestOperation): LooseMapping {
  const variableStem = attribute.id.replace(/[^a-z0-9_]/g, "_");
  return {
    attributeId: attribute.id,
    ...(operation === "CREATE" ? {} : { ist: { snapshotVariableId: "geselecteerde_configuratie", snapshotAttributeId: attribute.id } }),
    ...(operation === "RETIRE" ? {} : { soll: { variableId: `nieuwe_${variableStem}` } }),
  };
}

export function WorkflowChangeRequestBuilder({
  configuration,
  catalog,
  variableOptions,
  onChange,
}: {
  configuration: unknown;
  catalog: readonly PublicChangeRequestCatalogResource[];
  variableOptions: readonly WorkflowVariableOption[];
  onChange: (configuration: Readonly<Record<string, unknown>>, message: string) => void;
}) {
  const config = record(configuration);
  const resource = catalog.find((item) => item.id === config.resourceId) ?? catalog[0];
  if (!resource) return <p>Geen aanvraagbare client-configresources beschikbaar.</p>;
  const supportedOperations = operationsFor(resource);
  const operation = supportedOperations.includes(config.operation as WorkflowChangeRequestOperation)
    ? config.operation as WorkflowChangeRequestOperation
    : supportedOperations[0]!;
  const requestableAttributes = resource.attributes.filter((attribute) => attribute.requestableOperations.includes(operation));
  const attributeMappings = Array.isArray(config.attributeMappings)
    ? config.attributeMappings.filter((item): item is LooseMapping => Boolean(item) && typeof item === "object" && typeof (item as LooseMapping).attributeId === "string")
    : [];
  const effectiveDateVariable = typeof config.effectiveDateVariable === "string" ? config.effectiveDateVariable : "ingangsdatum";
  const rationaleVariable = typeof config.rationaleVariable === "string" ? config.rationaleVariable : "toelichting";
  const contract = workflowChangeRequestConfigurationSchema.safeParse({
    resourceId: resource.id,
    operation,
    attributeMappings,
    effectiveDateVariable,
    rationaleVariable,
  });

  function emit(patch: Record<string, unknown>, message: string) {
    onChange({ resourceId: resource.id, operation, attributeMappings, effectiveDateVariable, rationaleVariable, ...patch }, message);
  }

  function reset(resourceId: string, nextOperation?: WorkflowChangeRequestOperation) {
    const nextResource = catalog.find((item) => item.id === resourceId);
    if (!nextResource) return;
    const allowed = operationsFor(nextResource);
    const chosenOperation = nextOperation && allowed.includes(nextOperation) ? nextOperation : allowed[0];
    if (!chosenOperation) return;
    const firstAttribute = nextResource.attributes.find((attribute) => attribute.requestableOperations.includes(chosenOperation));
    onChange({
      resourceId: nextResource.id,
      operation: chosenOperation,
      attributeMappings: firstAttribute ? [mappingFor(firstAttribute, chosenOperation)] : [],
      effectiveDateVariable,
      rationaleVariable,
    }, nextResource.id === resource.id ? "Wijzigingsoperatie gewijzigd." : "Wijzigingsresource gewijzigd.");
  }

  function updateMapping(index: number, patch: Partial<LooseMapping>) {
    emit({ attributeMappings: attributeMappings.map((mapping, mappingIndex) => mappingIndex === index ? { ...mapping, ...patch } : mapping) }, "Attribuutmapping gewijzigd.");
  }

  return (
    <fieldset className="workflow-change-request-properties">
      <legend>Wijzigingsverzoek configureren</legend>
      <label>Resource
        <select value={resource.id} onChange={(event) => reset(event.target.value)}>{catalog.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>
      </label>
      <label>Operatie
        <select value={operation} onChange={(event) => reset(resource.id, event.target.value as WorkflowChangeRequestOperation)}>{supportedOperations.map((item) => <option value={item} key={item}>{item}</option>)}</select>
      </label>
      <p>{resource.description}</p>

      <fieldset className="workflow-change-request-mappings">
        <legend>IST → SOLL attribuutmappings</legend>
        {attributeMappings.map((mapping, index) => {
          const attribute = requestableAttributes.find((item) => item.id === mapping.attributeId) ?? requestableAttributes[0];
          return <div key={`${mapping.attributeId}:${index}`}>
            <label>Doelattribuut
              <select value={attribute?.id ?? ""} onChange={(event) => {
                const next = requestableAttributes.find((item) => item.id === event.target.value);
                if (next) updateMapping(index, mappingFor(next, operation));
              }}>{requestableAttributes.map((item) => <option value={item.id} key={item.id}>{item.label} · {item.valueType}</option>)}</select>
            </label>
            {operation !== "CREATE" && <WorkflowVariablePicker label="IST-snapshotvariabele" value={mapping.ist?.snapshotVariableId ?? ""} options={variableOptions} onChange={(value) => updateMapping(index, { ist: { snapshotVariableId: String(value), snapshotAttributeId: attribute?.id ?? mapping.attributeId } })} />}
            {operation !== "RETIRE" && <WorkflowVariablePicker label="SOLL-variabele" value={mapping.soll?.variableId ?? ""} options={variableOptions} onChange={(value) => updateMapping(index, { soll: { variableId: String(value) } })} />}
            <button type="button" aria-label={`Verwijder mapping ${attribute?.label ?? index + 1}`} onClick={() => emit({ attributeMappings: attributeMappings.filter((_, mappingIndex) => mappingIndex !== index) }, "Attribuutmapping verwijderd.")}>×</button>
          </div>;
        })}
        <button type="button" className="button" disabled={attributeMappings.length >= requestableAttributes.length} onClick={() => {
          const next = requestableAttributes.find((attribute) => !attributeMappings.some((mapping) => mapping.attributeId === attribute.id));
          if (next) emit({ attributeMappings: [...attributeMappings, mappingFor(next, operation)] }, "Attribuutmapping toegevoegd.");
        }}>Mapping toevoegen</button>
      </fieldset>

      <WorkflowVariablePicker label="Ingangsdatumvariabele" value={effectiveDateVariable} options={variableOptions} onChange={(value) => emit({ effectiveDateVariable: value }, "Ingangsdatum gewijzigd.")} />
      <WorkflowVariablePicker label="Redenvariabele" value={rationaleVariable} options={variableOptions} onChange={(value) => emit({ rationaleVariable: value }, "Reden gewijzigd.")} />
      <div className="workflow-change-request-contract" data-valid={contract.success}>{contract.success ? "Wijzigingscontract geldig" : contract.error.issues[0]?.message}</div>

      <section className="workflow-change-request-preview" aria-labelledby="change-request-preview-title">
        <h3 id="change-request-preview-title">Wijzigingsintentie</h3>
        <p><strong>{operation}</strong> {resource.label}</p>
        <ul>{attributeMappings.map((mapping) => <li key={mapping.attributeId}>
          <code>{mapping.attributeId}</code>: {mapping.ist ? `IST ${mapping.ist.snapshotVariableId}.${mapping.ist.snapshotAttributeId}` : "IST —"} → {mapping.soll ? `SOLL ${mapping.soll.variableId}` : `SOLL ${effectiveDateVariable} (beëindigen)`}
        </li>)}</ul>
        <p>Effectief: <code>{effectiveDateVariable}: date</code> · Reden: <code>{rationaleVariable}: string</code></p>
      </section>
    </fieldset>
  );
}
