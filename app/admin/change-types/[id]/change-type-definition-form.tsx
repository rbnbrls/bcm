"use client";

import { useActionState } from "react";
import type { ChangeTypeConfig } from "@/lib/types";
import { updateChangeTypeDefinitionAdmin, type ChangeTypeAdminState } from "../actions";
import { WORKFLOW_TEMPLATES } from "@/lib/change-types/templates";

type Props = {
  changeType: ChangeTypeConfig;
};

const initialState: ChangeTypeAdminState = {};

function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? [], null, 2);
}

export function ChangeTypeDefinitionForm({ changeType }: Props) {
  const [state, formAction, pending] = useActionState(updateChangeTypeDefinitionAdmin, initialState);
  const workflowOptions = Object.values(WORKFLOW_TEMPLATES);

  return (
    <form action={formAction} className="change-form">
      <input type="hidden" name="id" value={changeType.id} />
      <input type="hidden" name="active" value="false" />

      <section className="form-section">
        <div className="section-number" aria-label="Stap 1">01</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Basis</h2>
            <p>Publieke naam, uitleg, categorie en beschikbaarheid van dit change proces.</p>
          </div>
          <label className="field">
            <span>Naam</span>
            <input name="name" required defaultValue={changeType.name} />
          </label>
          <label className="field">
            <span>Korte beschrijving</span>
            <textarea name="description" rows={3} defaultValue={changeType.description} />
          </label>
          <label className="field">
            <span>Uitgebreide uitleg</span>
            <textarea name="extendedExplanation" rows={8} defaultValue={changeType.extendedExplanation ?? ""} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Categorie</span>
              <input name="category" required defaultValue={changeType.category} />
            </label>
            <label className="field">
              <span>Volgorde</span>
              <input name="sortOrder" type="number" min="0" step="1" required defaultValue={changeType.sortOrder} />
            </label>
          </div>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input name="active" type="checkbox" value="true" defaultChecked={changeType.active} />
            <span>Actief in frontend</span>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-label="Stap 2">02</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Workflow template</h2>
            <p>De template bepaalt welk formulier en welke veilige verwerkingsstrategie beschikbaar zijn.</p>
          </div>
          <label className="field">
            <span>Workflow</span>
            <select name="workflow" defaultValue={changeType.workflow}>
              {workflowOptions.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label} — {template.applyStrategy}
                </option>
              ))}
              {!workflowOptions.some((template) => template.id === changeType.workflow) && (
                <option value={changeType.workflow}>{changeType.workflow}</option>
              )}
            </select>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-label="Stap 3">03</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Kosten en doorlooptijd</h2>
            <p>Deze waarden worden gebruikt op de catalogus, het aanvraagformulier en de SLA-check.</p>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Basiskosten</span>
              <input name="baseCost" type="number" min="0" step="0.01" required defaultValue={changeType.cost.baseCost} />
            </label>
            <label className="field">
              <span>Kosten per item</span>
              <input name="perItemCost" type="number" min="0" step="0.01" defaultValue={changeType.cost.perItemCost ?? ""} />
            </label>
            <label className="field">
              <span>Valuta</span>
              <input name="costCurrency" maxLength={3} required defaultValue={changeType.cost.costCurrency} />
            </label>
            <label className="field">
              <span>Doorlooptijd in dagen</span>
              <input name="defaultLeadDays" type="number" min="0" max="365" step="1" required defaultValue={changeType.defaultLeadDays} />
            </label>
          </div>
          <label className="field">
            <span>Kostentekst</span>
            <input name="costDescription" maxLength={500} defaultValue={changeType.cost.description} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-label="Stap 4">04</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Definitie JSON</h2>
            <p>Velden, IST/SOLL mapping, stakeholders en procesflow worden gevalideerd bij opslaan.</p>
          </div>
          <label className="field">
            <span>Velden</span>
            <textarea name="fieldsJson" rows={12} spellCheck={false} defaultValue={prettyJson(changeType.fields)} />
          </label>
          <label className="field">
            <span>IST/SOLL mapping</span>
            <textarea name="istSollMappingJson" rows={6} spellCheck={false} defaultValue={prettyJson(changeType.istSollMapping ?? [])} />
          </label>
          <label className="field">
            <span>Stakeholders</span>
            <textarea name="stakeholdersJson" rows={10} spellCheck={false} defaultValue={prettyJson(changeType.stakeholders)} />
          </label>
          <label className="field">
            <span>Procesflow</span>
            <textarea name="processFlowJson" rows={12} spellCheck={false} defaultValue={prettyJson(changeType.processFlow ?? [])} />
          </label>
        </div>
      </section>

      {state.issues && (
        <div className="form-errors" role="alert" aria-live="polite">
          <b>Controleer de invoer</b>
          <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      )}
      {state.message && (
        <div className="success-state" role="status">
          {state.message}
        </div>
      )}

      <div className="submit-row">
        <p><b>{changeType.slug}</b></p>
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? "Opslaan..." : "Change proces opslaan"}
        </button>
      </div>
    </form>
  );
}
