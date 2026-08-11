"use client";

import { useActionState } from "react";

import {
  startWorkflowRuntimeAction,
  type StartWorkflowRuntimeState,
} from "@/app/workflow-runtime/actions";
import { workflowRuntimeFormFieldName, type WorkflowRuntimeFormDefinition } from "@/lib/workflow-studio/runtime-form";
import type { WorkflowFormField } from "@/lib/workflow-studio/form-schema";

const initialState: StartWorkflowRuntimeState = { success: false, code: "idle", message: "" };

function Field({ nodeKey, field, errors }: { nodeKey: string; field: WorkflowFormField; errors?: readonly string[] }) {
  const name = workflowRuntimeFormFieldName(nodeKey, field.id);
  const describedBy = `${name}-help ${name}-errors`;
  const common = {
    name,
    id: name,
    required: field.required,
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": describedBy,
  };
  let control;
  if (field.type === "boolean") {
    control = <input {...common} type="checkbox" defaultChecked={field.defaultValue ?? false} />;
  } else if (field.type === "longtext") {
    control = <textarea {...common} defaultValue={field.defaultValue ?? ""} minLength={field.constraints?.minLength} maxLength={field.constraints?.maxLength} />;
  } else if (field.type === "select" || field.type === "multiselect") {
    control = <select {...common} multiple={field.type === "multiselect"} defaultValue={field.type === "multiselect" ? field.defaultValue ?? [] : field.defaultValue ?? ""}>
      {field.type === "select" && <option value="">Kies…</option>}
      {field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select>;
  } else {
    const numeric = field.type === "number" || field.type === "currency";
    control = <input
      {...common}
      type={field.type === "date" ? "date" : numeric ? "number" : "text"}
      defaultValue={field.defaultValue ?? ""}
      min={field.type === "date" || numeric ? field.constraints?.min : undefined}
      max={field.type === "date" || numeric ? field.constraints?.max : undefined}
      step={numeric ? field.constraints?.step ?? "any" : undefined}
      minLength={field.type === "text" ? field.constraints?.minLength : undefined}
      maxLength={field.type === "text" ? field.constraints?.maxLength : undefined}
      pattern={field.type === "text" ? field.constraints?.pattern : undefined}
    />;
  }
  return <label className={field.type === "boolean" ? "workflow-runtime-checkbox" : "workflow-runtime-field"} htmlFor={name}>
    <span>{field.label}{field.required ? " *" : ""}</span>
    {control}
    {field.type === "currency" && <small>{field.currency}</small>}
    {field.helpText && <small id={`${name}-help`}>{field.helpText}</small>}
    {errors?.length ? <span className="workflow-runtime-field-errors" id={`${name}-errors`} role="alert">{errors.join(" ")}</span> : null}
  </label>;
}

export function WorkflowRuntimeStartForm({
  workflowVersionId,
  idempotencyKey,
  correlationId,
  forms,
}: {
  workflowVersionId: string;
  idempotencyKey: string;
  correlationId: string;
  forms: readonly WorkflowRuntimeFormDefinition[];
}) {
  const [state, action, pending] = useActionState(startWorkflowRuntimeAction, initialState);
  if (state.success) return <section className="workflow-runtime-confirmation" role="status">
    <p className="eyebrow">AANVRAAG GESTART</p>
    <h2>Workflowinstance aangemaakt</h2>
    <p>{state.message}</p>
    <dl><div><dt>Instance-ID</dt><dd><code>{state.instanceId}</code></dd></div><div><dt>Status</dt><dd>Actief</dd></div></dl>
  </section>;

  return <form action={action} className="workflow-runtime-form">
    <input type="hidden" name="workflowVersionId" value={workflowVersionId} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="correlationId" value={correlationId} />
    {forms.map((form) => <fieldset key={form.nodeId} disabled={pending}>
      <legend>{form.configuration.title}</legend>
      {form.configuration.description && <p>{form.configuration.description}</p>}
      <div>{form.configuration.fields.map((field) => <Field
        nodeKey={form.nodeKey}
        field={field}
        errors={state.fieldErrors?.[workflowRuntimeFormFieldName(form.nodeKey, field.id)]}
        key={field.id}
      />)}</div>
    </fieldset>)}
    {state.message && <div className="form-errors" role="alert"><b>Workflow niet gestart</b><p>{state.message}</p></div>}
    <button className="button button-primary" type="submit" disabled={pending}>
      {pending ? "Aanvraag wordt gestart…" : "Workflow starten"}
    </button>
  </form>;
}
