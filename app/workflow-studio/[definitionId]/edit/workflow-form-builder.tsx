"use client";

import { useMemo, useState } from "react";
import {
  validateWorkflowFormSubmission,
  workflowFormBlockConfigurationSchema,
  type WorkflowFormFieldType,
} from "@/lib/workflow-studio/form-schema";

type LooseField = Record<string, unknown> & { id: string; label: string; type: WorkflowFormFieldType };

const fieldLabels: Record<WorkflowFormFieldType, string> = {
  text: "Tekst",
  longtext: "Lange tekst",
  number: "Getal",
  currency: "Valuta",
  date: "Datum",
  boolean: "Ja/nee",
  select: "Selectie",
  multiselect: "Multiselect",
};

function looseConfiguration(value: unknown): { title: string; description: string; fields: LooseField[] } {
  const configuration = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    title: typeof configuration.title === "string" ? configuration.title : "Nieuw formulier",
    description: typeof configuration.description === "string" ? configuration.description : "",
    fields: Array.isArray(configuration.fields)
      ? configuration.fields.filter((field): field is LooseField => Boolean(
        field && typeof field === "object"
        && typeof (field as LooseField).id === "string"
        && typeof (field as LooseField).label === "string"
        && typeof (field as LooseField).type === "string",
      ))
      : [],
  };
}

function newField(type: WorkflowFormFieldType, fields: readonly LooseField[]): LooseField {
  let suffix = 1;
  const ids = new Set(fields.map((field) => field.id));
  while (ids.has(`${type}_${suffix}`)) suffix += 1;
  const common = { id: `${type}_${suffix}`, label: fieldLabels[type], type, required: false };
  if (type === "select" || type === "multiselect") {
    return { ...common, options: [{ value: "optie_1", label: "Optie 1" }] };
  }
  if (type === "currency") return { ...common, currency: "EUR" };
  return common;
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function WorkflowFormBuilder({
  configuration,
  onChange,
}: {
  configuration: unknown;
  onChange: (configuration: Readonly<Record<string, unknown>>, message: string) => void;
}) {
  const form = looseConfiguration(configuration);
  const [newType, setNewType] = useState<WorkflowFormFieldType>("text");
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [previewMessage, setPreviewMessage] = useState("");
  const contractResult = useMemo(() => workflowFormBlockConfigurationSchema.safeParse(form), [form]);

  function emit(next: typeof form, message: string) {
    onChange({
      title: next.title,
      ...(next.description ? { description: next.description } : {}),
      fields: next.fields,
    }, message);
  }

  function updateField(index: number, patch: Record<string, unknown>, message = "Formulierveld gewijzigd.") {
    emit({ ...form, fields: form.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } as LooseField : field) }, message);
  }

  function changeFieldType(index: number, type: WorkflowFormFieldType) {
    const current = form.fields[index];
    if (!current) return;
    const replacement = newField(type, form.fields.filter((_, fieldIndex) => fieldIndex !== index));
    const nextField = {
      ...replacement,
      id: current.id,
      label: current.label,
      required: current.required,
      ...(typeof current.helpText === "string" && current.helpText ? { helpText: current.helpText } : {}),
    } as LooseField;
    emit({
      ...form,
      fields: form.fields.map((field, fieldIndex) => fieldIndex === index ? nextField : field),
    }, "Veldtype gewijzigd.");
  }

  function updateConstraint(index: number, key: string, value: number | string | undefined) {
    const field = form.fields[index];
    const constraints = field?.constraints && typeof field.constraints === "object" ? field.constraints as Record<string, unknown> : {};
    const next = { ...constraints, [key]: value };
    if (value === undefined || value === "") delete next[key];
    updateField(index, { constraints: Object.keys(next).length ? next : undefined });
  }

  function updatePreview(id: string, value: unknown, omit = false) {
    setPreviewValues((current) => {
      const next = { ...current };
      if (omit) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  function validatePreview() {
    const result = validateWorkflowFormSubmission(form, previewValues);
    setPreviewMessage(result.success
      ? "Voorbeeld is geldig volgens het gedeelde runtime-schema."
      : result.error.issues.map((issue) => `${issue.path.join(".") || "formulier"}: ${issue.message}`).join(" "));
  }

  return (
    <section className="workflow-form-builder" aria-labelledby="form-builder-title">
      <h3 id="form-builder-title">Formulier bouwen</h3>
      <label>Titel
        <input value={form.title} onChange={(event) => emit({ ...form, title: event.target.value }, "Formuliertitel gewijzigd.")} />
      </label>
      <label>Beschrijving
        <textarea value={form.description} onChange={(event) => emit({ ...form, description: event.target.value }, "Formulierbeschrijving gewijzigd.")} />
      </label>

      <div className="workflow-form-add">
        <label>Nieuw veldtype
          <select value={newType} onChange={(event) => setNewType(event.target.value as WorkflowFormFieldType)}>
            {Object.entries(fieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="button" className="button" onClick={() => emit({ ...form, fields: [...form.fields, newField(newType, form.fields)] }, `${fieldLabels[newType]}veld toegevoegd.`)}>Veld toevoegen</button>
      </div>

      <div className="workflow-form-fields">
        {form.fields.length === 0 && <p>Voeg het eerste formulierveld toe.</p>}
        {form.fields.map((field, index) => {
          const constraints = field.constraints && typeof field.constraints === "object" ? field.constraints as Record<string, unknown> : {};
          const options = Array.isArray(field.options) ? field.options as Array<{ value: string; label: string }> : [];
          return (
            <fieldset key={`${field.id}:${index}`}>
              <legend>{fieldLabels[field.type]} · {field.id}</legend>
              <label>Veld-ID<input value={field.id} onChange={(event) => updateField(index, { id: event.target.value })} /></label>
              <label>Label<input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} /></label>
              <label>Type<select value={field.type} onChange={(event) => changeFieldType(index, event.target.value as WorkflowFormFieldType)}>{Object.entries(fieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="workflow-form-check"><input type="checkbox" checked={field.required === true} onChange={(event) => updateField(index, { required: event.target.checked })} /> Verplicht</label>
              <label className="workflow-form-wide">Hulptekst<input value={typeof field.helpText === "string" ? field.helpText : ""} onChange={(event) => updateField(index, { helpText: event.target.value || undefined })} /></label>

              {(field.type === "text" || field.type === "longtext") && <>
                <label>Standaardwaarde<input value={typeof field.defaultValue === "string" ? field.defaultValue : ""} onChange={(event) => updateField(index, { defaultValue: event.target.value || undefined })} /></label>
                <label>Min. lengte<input type="number" min="0" value={typeof constraints.minLength === "number" ? constraints.minLength : ""} onChange={(event) => updateConstraint(index, "minLength", optionalNumber(event.target.value))} /></label>
                <label>Max. lengte<input type="number" min="1" value={typeof constraints.maxLength === "number" ? constraints.maxLength : ""} onChange={(event) => updateConstraint(index, "maxLength", optionalNumber(event.target.value))} /></label>
                <label>Patroon<input value={typeof constraints.pattern === "string" ? constraints.pattern : ""} onChange={(event) => updateConstraint(index, "pattern", event.target.value || undefined)} /></label>
              </>}
              {(field.type === "number" || field.type === "currency") && <>
                <label>Standaardwaarde<input type="number" value={typeof field.defaultValue === "number" ? field.defaultValue : ""} onChange={(event) => updateField(index, { defaultValue: optionalNumber(event.target.value) })} /></label>
                <label>Minimum<input type="number" value={typeof constraints.min === "number" ? constraints.min : ""} onChange={(event) => updateConstraint(index, "min", optionalNumber(event.target.value))} /></label>
                <label>Maximum<input type="number" value={typeof constraints.max === "number" ? constraints.max : ""} onChange={(event) => updateConstraint(index, "max", optionalNumber(event.target.value))} /></label>
                <label>Stap<input type="number" min="0" value={typeof constraints.step === "number" ? constraints.step : ""} onChange={(event) => updateConstraint(index, "step", optionalNumber(event.target.value))} /></label>
                {field.type === "currency" && <label>Valuta<input maxLength={3} value={typeof field.currency === "string" ? field.currency : "EUR"} onChange={(event) => updateField(index, { currency: event.target.value.toUpperCase() })} /></label>}
              </>}
              {field.type === "date" && <>
                <label>Standaarddatum<input type="date" value={typeof field.defaultValue === "string" ? field.defaultValue : ""} onChange={(event) => updateField(index, { defaultValue: event.target.value || undefined })} /></label>
                <label>Vanaf<input type="date" value={typeof constraints.min === "string" ? constraints.min : ""} onChange={(event) => updateConstraint(index, "min", event.target.value || undefined)} /></label>
                <label>Tot<input type="date" value={typeof constraints.max === "string" ? constraints.max : ""} onChange={(event) => updateConstraint(index, "max", event.target.value || undefined)} /></label>
              </>}
              {field.type === "boolean" && <label className="workflow-form-check"><input type="checkbox" checked={field.defaultValue === true} onChange={(event) => updateField(index, { defaultValue: event.target.checked })} /> Standaard aangevinkt</label>}
              {(field.type === "select" || field.type === "multiselect") && <>
                <label className="workflow-form-wide">Opties (waarde | label)<textarea value={options.map((option) => `${option.value} | ${option.label}`).join("\n")} onChange={(event) => updateField(index, { options: event.target.value.split("\n").map((line) => line.split("|").map((part) => part.trim())).filter(([value, label]) => value && label).map(([value, label]) => ({ value, label })) })} /></label>
                <label>Standaardwaarde(n)<input value={Array.isArray(field.defaultValue) ? field.defaultValue.join(", ") : typeof field.defaultValue === "string" ? field.defaultValue : ""} onChange={(event) => updateField(index, { defaultValue: field.type === "multiselect" ? event.target.value.split(",").map((value) => value.trim()).filter(Boolean) : event.target.value || undefined })} /></label>
                {field.type === "multiselect" && <>
                  <label>Min. selecties<input type="number" min="0" value={typeof constraints.minSelections === "number" ? constraints.minSelections : ""} onChange={(event) => updateConstraint(index, "minSelections", optionalNumber(event.target.value))} /></label>
                  <label>Max. selecties<input type="number" min="1" value={typeof constraints.maxSelections === "number" ? constraints.maxSelections : ""} onChange={(event) => updateConstraint(index, "maxSelections", optionalNumber(event.target.value))} /></label>
                </>}
              </>}
              <button type="button" className="button button-danger" onClick={() => emit({ ...form, fields: form.fields.filter((_, fieldIndex) => fieldIndex !== index) }, `${field.label} verwijderd.`)}>Veld verwijderen</button>
            </fieldset>
          );
        })}
      </div>

      <div className="workflow-form-contract" aria-live="polite">
        {contractResult.success ? <span>Formuliercontract geldig</span> : <span>{contractResult.error.issues[0]?.message}</span>}
      </div>
      {contractResult.success && <section className="workflow-form-preview" aria-labelledby="form-preview-title">
        <h4 id="form-preview-title">Formuliervoorbeeld</h4>
        {contractResult.data.fields.map((field) => {
          const current = previewValues[field.id] ?? field.defaultValue;
          if (field.type === "boolean") return <label key={field.id}><input type="checkbox" checked={current === true} onChange={(event) => updatePreview(field.id, event.target.checked)} /> {field.label}{field.required ? " *" : ""}</label>;
          if (field.type === "longtext") return <label key={field.id}>{field.label}{field.required ? " *" : ""}<textarea value={typeof current === "string" ? current : ""} onChange={(event) => updatePreview(field.id, event.target.value, event.target.value === "" && !field.required)} /></label>;
          if (field.type === "select" || field.type === "multiselect") return <label key={field.id}>{field.label}{field.required ? " *" : ""}<select multiple={field.type === "multiselect"} value={field.type === "multiselect" ? Array.isArray(current) ? current : [] : typeof current === "string" ? current : ""} onChange={(event) => updatePreview(field.id, field.type === "multiselect" ? [...event.target.selectedOptions].map((option) => option.value) : event.target.value, !event.target.value && !field.required)}><option value="">Kies…</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
          return <label key={field.id}>{field.label}{field.required ? " *" : ""}<input type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"} value={typeof current === "string" || typeof current === "number" ? current : ""} onChange={(event) => updatePreview(field.id, field.type === "number" || field.type === "currency" ? optionalNumber(event.target.value) : event.target.value, event.target.value === "" && !field.required)} />{field.helpText && <small>{field.helpText}</small>}</label>;
        })}
        <button type="button" className="button" onClick={validatePreview}>Voorbeeld valideren</button>
        {previewMessage && <p role="status">{previewMessage}</p>}
      </section>}
    </section>
  );
}
