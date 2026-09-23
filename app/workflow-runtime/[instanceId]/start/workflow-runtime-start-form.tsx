"use client";

import { useActionState, useEffect, useState } from "react";

import {
  startWorkflowRuntimeAction,
  type StartWorkflowRuntimeState,
} from "@/app/workflow-runtime/actions";
import { workflowRuntimeFormFieldName, type WorkflowRuntimeFormDefinition } from "@/lib/workflow-studio/runtime-form";
import type { WorkflowRuntimeAccountOption } from "@/lib/workflow-studio/runtime-start-service";
import type { WorkflowFormField } from "@/lib/workflow-studio/form-schema";

const initialState: StartWorkflowRuntimeState = { success: false, code: "idle", message: "" };

function Field({ nodeKey, field, errors, value, readOnly, options }: { nodeKey: string; field: WorkflowFormField; errors?: readonly string[]; value?: string; readOnly?: boolean; options?: readonly { value: string; label: string }[] }) {
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
    const checkedValue = value === "true" || value === "1" || value === "on";
    control = <>
      <input
        {...common}
        name={`${name}__display`}
        id={`${name}-display`}
        type="checkbox"
        data-boolean-display="true"
        required={false}
        {...(readOnly ? { checked: checkedValue, disabled: true } : { defaultChecked: field.defaultValue ?? false })}
      />
      <input type="hidden" name={name} id={`${name}-serialized`} />
    </>;
  } else if (field.type === "longtext") {
    control = <textarea
      {...common}
      {...(readOnly ? { value: value ?? field.defaultValue ?? "" } : { defaultValue: value ?? field.defaultValue ?? "" })}
      readOnly={readOnly}
      minLength={field.constraints?.minLength}
      maxLength={field.constraints?.maxLength}
    />;
  } else if (field.type === "select" || field.type === "multiselect") {
    control = <select {...common} multiple={field.type === "multiselect"} defaultValue={field.type === "multiselect" ? field.defaultValue ?? [] : field.defaultValue ?? ""}>
      {field.type === "select" && <option value="">Kies…</option>}
      {(options ?? field.options).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select>;
  } else {
    const numeric = field.type === "number" || field.type === "currency";
    control = <input
      {...common}
      type={field.type === "date" ? "date" : numeric ? "number" : "text"}
      {...(readOnly ? { value: value ?? field.defaultValue ?? "" } : { defaultValue: value ?? field.defaultValue ?? "" })}
      readOnly={readOnly}
      min={field.type === "date" || numeric ? field.constraints?.min : undefined}
      max={field.type === "date" || numeric ? field.constraints?.max : undefined}
      step={numeric ? field.constraints?.step ?? "any" : undefined}
      minLength={field.type === "text" ? field.constraints?.minLength : undefined}
      maxLength={field.type === "text" ? field.constraints?.maxLength : undefined}
      pattern={field.type === "text" ? field.constraints?.pattern : undefined}
    />;
  }
  return <label className={field.type === "boolean" ? "workflow-runtime-checkbox" : "workflow-runtime-field"} htmlFor={field.type === "boolean" ? `${name}-display` : name}>
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
  accountOptions = [],
}: {
  workflowVersionId: string;
  idempotencyKey: string;
  correlationId: string;
  forms: readonly WorkflowRuntimeFormDefinition[];
  accountOptions?: readonly WorkflowRuntimeAccountOption[];
}) {
  const [state, action, pending] = useActionState(startWorkflowRuntimeAction, initialState);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedAssetClass, setSelectedAssetClass] = useState("");
  const selectedAccount = accountOptions.find((option) => option.value === selectedAccountId);
  useEffect(() => {
    document.querySelectorAll<HTMLFormElement>('form.workflow-runtime-form input[data-boolean-display="true"]').forEach((display) => {
      const form = display.closest("form");
      const hiddenInputs = form ? Array.from(form.querySelectorAll('input[type="hidden"]')) as HTMLInputElement[] : [];
      const serialized = hiddenInputs
        .find((input) => input.id === display.id.replace("-display", "-serialized"));
      if (serialized) serialized.value = display.checked ? "true" : "false";
    });
  }, [selectedAccountId, forms, state]);
  if (state.success) return <section className="workflow-runtime-confirmation" role="status">
    <p className="eyebrow">AANVRAAG GESTART</p>
    <h2>Workflowinstance aangemaakt</h2>
    <p>{state.message}</p>
    <dl><div><dt>Instance-ID</dt><dd><code>{state.instanceId}</code></dd></div><div><dt>Status</dt><dd>Actief</dd></div></dl>
  </section>;

  return <form action={action} className="workflow-runtime-form" onSubmit={(event) => {
    // The action-state hydration path can reset hidden inputs before the
    // browser serialises the form. Set the immutable request metadata in the
    // submit event as a final, browser-owned guard.
    const form = event.currentTarget;
    const versionInput = form.elements.namedItem("workflowVersionId") as HTMLInputElement | null;
    const idempotencyInput = form.elements.namedItem("idempotencyKey") as HTMLInputElement | null;
    const correlationInput = form.elements.namedItem("correlationId") as HTMLInputElement | null;
    if (versionInput && !versionInput.value) versionInput.value = workflowVersionId || window.location.pathname.split("/").filter(Boolean)[1] || "";
    if (idempotencyInput && !idempotencyInput.value) idempotencyInput.value = idempotencyKey || crypto.randomUUID();
    if (correlationInput && !correlationInput.value) correlationInput.value = correlationId || crypto.randomUUID();
    form.querySelectorAll<HTMLInputElement>('input[data-boolean-display="true"]').forEach((display) => {
      const serialized = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]'))
        .find((input) => input.id === display.id.replace("-display", "-serialized"));
      if (serialized) serialized.value = display.checked ? "true" : "false";
    });
  }} onChange={(event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.name.endsWith(".primary_account_id")) setSelectedAccountId(target.value);
    if (target.name.endsWith(".requested_asset_class_code")) setSelectedAssetClass(target.value);
  }}>
    {/*
     * These are form-owned values rather than editable React state. Using
     * defaultValue is important here: React's action-state form reset must
     * retain the version and request correlation values after hydration and
     * after a failed server action. A controlled hidden input can be reset to
     * an empty value by the action-state lifecycle.
     */}
    <input type="hidden" name="workflowVersionId" defaultValue={workflowVersionId} />
    <input type="hidden" name="idempotencyKey" defaultValue={idempotencyKey} />
    <input type="hidden" name="correlationId" defaultValue={correlationId} />
    {forms.map((form) => <fieldset key={form.nodeId} disabled={pending}>
      <legend>{form.configuration.title}</legend>
      {form.configuration.description && <p>{form.configuration.description}</p>}
        <div>{form.configuration.fields.map((field) => <Field
        nodeKey={form.nodeKey}
        field={field}
        errors={state.fieldErrors?.[workflowRuntimeFormFieldName(form.nodeKey, field.id)]}
        value={selectedAccount?.currentValues[field.id] ?? undefined}
        readOnly={field.id.startsWith("current_")}
        options={field.id === "requested_sub_asset_class_code" && selectedAssetClass
          ? field.type === "select"
            ? field.options.filter((option) => option.label.endsWith(`(${selectedAssetClass})`))
            : undefined
          : undefined}
        key={`${field.id}-${field.id === "requested_sub_asset_class_code" ? selectedAssetClass : "stable"}`}
      />)}</div>
    </fieldset>)}
    {state.message && <div className="form-errors" role="alert">
      <b>Workflow niet gestart</b>
      <p>{state.message}</p>
      {state.fieldErrors?._form?.length ? <ul>{state.fieldErrors._form.map((error) => <li key={error}>{error}</li>)}</ul> : null}
    </div>}
    <button className="button button-primary" type="submit" disabled={pending}>
      {pending ? "Aanvraag wordt gestart…" : "Workflow starten"}
    </button>
  </form>;
}
