"use client";

import { useState, type ReactNode } from "react";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import {
  orderedContractProperties,
  validateContractConfiguration,
  type ContractPropertyIssue,
  type JsonSchema,
  type WorkflowVariableOption,
} from "@/lib/workflow-studio/properties-schema";
import { WorkflowVariablePicker } from "./workflow-variable-picker";

const knownLabels: Readonly<Record<string, string>> = {
  label: "Label", outcome: "Uitkomst", dataScope: "Datascope", starterRoleIds: "Starterrollen",
  roleId: "Workflowrol", title: "Titel", instructions: "Instructies", inputVariables: "Invoervariabelen",
  outputVariables: "Uitvoervariabelen", deadlineHours: "Deadline in uren", resourceId: "Resource",
  operation: "Operatie", effectiveDateVariable: "Ingangsdatumvariabele", rationaleVariable: "Redenvariabele",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function labelFor(entry: BlockCatalogEntry, field: string): string {
  return entry.configurationUiSchema.labels?.[field] ?? knownLabels[field] ?? field.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function fieldIssues(issues: readonly ContractPropertyIssue[], field: string): readonly ContractPropertyIssue[] {
  return issues.filter((issue) => issue.path[0] === field);
}

function JsonValueField({ label, value, onChange, invalid }: { label: string; value: unknown; onChange: (value: unknown) => void; invalid: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  return <label>{label}
    <textarea aria-label={label} aria-invalid={invalid || Boolean(parseError)} value={text} onChange={(event) => {
      setText(event.target.value);
      try { onChange(JSON.parse(event.target.value)); setParseError(null); } catch { setParseError("Voer geldige JSON in."); }
    }} />
    {parseError && <small role="alert">{parseError}</small>}
  </label>;
}

function ContractField({ entry, field, schema, value, required, issues, variableOptions, onChange }: {
  entry: BlockCatalogEntry;
  field: string;
  schema: JsonSchema;
  value: unknown;
  required: boolean;
  issues: readonly ContractPropertyIssue[];
  variableOptions: readonly WorkflowVariableOption[];
  onChange: (value: unknown) => void;
}) {
  const label = `${labelFor(entry, field)}${required ? " *" : ""}`;
  const widget = entry.configurationUiSchema.widgets?.[field];
  const helpText = entry.configurationUiSchema.helpText?.[field];
  const invalid = issues.length > 0;
  const error = issues[0]?.message;
  const enumValues = Array.isArray(schema.enum) ? schema.enum.filter((item): item is string | number => typeof item === "string" || typeof item === "number") : [];
  const actualValue = value ?? schema.default;

  if (widget === "variable" || widget === "variable-multiselect") return <div className="workflow-contract-field" data-invalid={invalid}>
    <WorkflowVariablePicker label={label} value={widget === "variable-multiselect" ? Array.isArray(actualValue) ? actualValue.filter((item): item is string => typeof item === "string") : [] : typeof actualValue === "string" ? actualValue : ""} options={variableOptions} multiple={widget === "variable-multiselect"} onChange={onChange} helpText={helpText} />
    {error && <small role="alert">{error}</small>}
  </div>;
  if (enumValues.length > 0) return <label>{label}
    <select aria-label={label} aria-invalid={invalid} value={typeof actualValue === "string" || typeof actualValue === "number" ? actualValue : enumValues[0]} onChange={(event) => onChange(schema.type === "number" ? Number(event.target.value) : event.target.value)}>{enumValues.map((option) => <option value={option} key={option}>{entry.configurationUiSchema.enumLabels?.[field]?.[String(option)] ?? String(option)}</option>)}</select>
    {helpText && <small>{helpText}</small>}{error && <small role="alert">{error}</small>}
  </label>;
  if (schema.type === "boolean") return <label className="workflow-contract-check"><input aria-label={label} type="checkbox" checked={actualValue === true} onChange={(event) => onChange(event.target.checked)} /> {label}{helpText && <small>{helpText}</small>}{error && <small role="alert">{error}</small>}</label>;
  if (schema.type === "number" || schema.type === "integer") return <label>{label}<input aria-label={label} type="number" aria-invalid={invalid} min={typeof schema.minimum === "number" ? schema.minimum : undefined} max={typeof schema.maximum === "number" ? schema.maximum : undefined} value={typeof actualValue === "number" ? actualValue : ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />{helpText && <small>{helpText}</small>}{error && <small role="alert">{error}</small>}</label>;
  if (schema.type === "array" && record(schema.items).type === "string") {
    const values = Array.isArray(actualValue) ? actualValue.filter((item): item is string => typeof item === "string") : [];
    return <label>{label}<input aria-label={label} aria-invalid={invalid} value={values.join(", ")} onChange={(event) => onChange([...new Set(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))])} />{helpText && <small>{helpText}</small>}{error && <small role="alert">{error}</small>}</label>;
  }
  if (schema.type === "string") {
    const textarea = widget === "textarea" || widget === "safe-template" || (typeof schema.maxLength === "number" && schema.maxLength > 250);
    return <label>{label}{textarea
      ? <textarea aria-label={label} aria-invalid={invalid} value={typeof actualValue === "string" ? actualValue : ""} onChange={(event) => onChange(event.target.value)} />
      : <input aria-label={label} type={schema.format === "date" ? "date" : "text"} aria-invalid={invalid} value={typeof actualValue === "string" ? actualValue : ""} onChange={(event) => onChange(event.target.value)} />}{helpText && <small>{helpText}</small>}{error && <small role="alert">{error}</small>}</label>;
  }
  return <JsonValueField label={label} value={actualValue} invalid={invalid} onChange={onChange} />;
}

export function WorkflowContractProperties({ entry, configuration, variableOptions, onChange, specializedEditor }: {
  entry: BlockCatalogEntry;
  configuration: unknown;
  variableOptions: readonly WorkflowVariableOption[];
  onChange: (configuration: Readonly<Record<string, unknown>>, message: string) => void;
  specializedEditor?: ReactNode;
}) {
  const config = record(configuration);
  const issues = validateContractConfiguration(entry.configurationSchema, config);
  const required = new Set(Array.isArray(entry.configurationSchema.required) ? entry.configurationSchema.required.filter((item): item is string => typeof item === "string") : []);
  return <div className="workflow-contract-properties" data-block-contract={`${entry.blockType}@${entry.contractVersion}`}>
    {specializedEditor ?? <fieldset className="workflow-control-properties">
      <legend>{entry.ui.label} configureren</legend>
      {orderedContractProperties(entry).map(([field, schema]) => <div data-property-name={field} key={field}><ContractField
          entry={entry}
          field={field}
          schema={schema}
          value={config[field]}
          required={required.has(field)}
          issues={fieldIssues(issues, field)}
          variableOptions={variableOptions}
          onChange={(value) => onChange({ [field]: value }, `${labelFor(entry, field)} gewijzigd.`)}
        /></div>)}
    </fieldset>}
    <section className="workflow-contract-errors" aria-label="Contractvalidatie" data-valid={issues.length === 0}>
      {issues.length === 0 ? <p>Configuratie voldoet aan het JSON-contract.</p> : <><strong>{issues.length} contractfout(en)</strong><ul>{issues.map((issue, index) => <li key={`${issue.path.join(".")}:${index}`}><code>{issue.path.join(".") || "configuratie"}</code> {issue.message}</li>)}</ul></>}
    </section>
  </div>;
}
