"use client";

import { useActionState } from "react";
import {
  createWorkflowDraftAction,
  type CreateWorkflowDraftState,
} from "@/app/workflow-studio/actions";

export type WorkflowTemplateOption = {
  reference: string;
  label: string;
  description: string;
};

const initialState: CreateWorkflowDraftState = { success: false, message: "" };

export function WorkflowDraftCreateForm({
  templates,
  selectedTemplate = "",
}: {
  templates: readonly WorkflowTemplateOption[];
  selectedTemplate?: string;
}) {
  const [state, action, pending] = useActionState(createWorkflowDraftAction, initialState);

  return (
    <form action={action} className="studio-create-form">
      <fieldset disabled={pending}>
        <legend>Basisgegevens</legend>
        <label className="field">
          <span>Naam</span>
          <input name="name" minLength={2} maxLength={200} required autoFocus />
        </label>
        <label className="field">
          <span>Slug</span>
          <input name="slug" pattern="[a-z0-9]+(?:[-_][a-z0-9]+)*" maxLength={120} required placeholder="bijvoorbeeld benchmark-wijziging" />
        </label>
        <label className="field studio-field-wide">
          <span>Doel</span>
          <textarea name="description" maxLength={2000} placeholder="Beschrijf kort waarvoor dit proces wordt gebruikt." />
        </label>
      </fieldset>

      <fieldset disabled={pending}>
        <legend>Startpunt</legend>
        <label className="field studio-field-wide">
          <span>Procesbasis</span>
          <select name="template" defaultValue={selectedTemplate}>
            <option value="">Leeg proces — start en einde</option>
            {templates.map((template) => (
              <option key={template.reference} value={template.reference}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
        <p className="studio-form-hint">
          Een template wordt als onafhankelijke draft gekloond; latere wijzigingen aan de bron veranderen deze workflow niet.
        </p>
      </fieldset>

      {state.message ? (
        <div className="form-errors" role="alert">
          <b>Workflow niet aangemaakt</b>
          <p>{state.message}</p>
          {state.issues?.length ? <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        </div>
      ) : null}

      <div className="studio-form-actions">
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Draft wordt aangemaakt…" : "Draft aanmaken"}
        </button>
      </div>
    </form>
  );
}
