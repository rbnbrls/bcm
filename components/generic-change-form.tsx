"use client";

import { useActionState, useMemo, useState } from "react";
import { createGenericChangeRequest, type GenericFormState } from "@/app/changes/new/generic-actions";
import type { ChangeTypeConfig, ClientConfig, ChangeField } from "@/lib/types";
import { computeEstimatedCost } from "@/lib/change-form-utils";

type Props = {
  clients: ClientConfig[];
  changeTypes: ChangeTypeConfig[];
};

const initialState: GenericFormState = {};

/**
 * Generic change request form.
 *
 * Renders any change type dynamically from its ChangeTypeConfig:
 * Step 1: Context (client, requester, date, rationale)
 * Step 2: Change type + dynamic fields (renders each field per its ChangeFieldType)
 * Step 3: Costs and lead time (computed from config)
 * Step 4: Review and submit
 */
export function GenericChangeForm({ clients, changeTypes }: Props) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [selectedType, setSelectedType] = useState(changeTypes[0]?.slug ?? "");
  const [state, formAction, pending] = useActionState(createGenericChangeRequest, initialState);

  const activeTypes = changeTypes.filter((ct) => ct.active);
  const currentConfig = useMemo(
    () => activeTypes.find((ct) => ct.slug === selectedType) ?? activeTypes[0],
    [activeTypes, selectedType],
  );

  const client = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clientId, clients],
  );

  // Compute estimated cost
  const cost = useMemo(
    () => (currentConfig ? computeEstimatedCost(currentConfig, 1) : null),
    [currentConfig],
  );

  function renderField(field: ChangeField) {
    const { key, label, type, required, options, helpText, min, max, defaultValue, referenceTable } = field;
    const isRequired = required;
    const labelEl = (
      <span>{label}{isRequired ? <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span> : ""}</span>
    );

    switch (type) {
      case "select": {
        // If it references a table, render options from presets or from the DB data
        return (
          <label key={key} className="field">
            {labelEl}
            <select name={key} defaultValue={defaultValue ? String(defaultValue) : ""}>
              <option value="">Kies {label.toLowerCase()}</option>
              {options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {helpText && <small style={{ color: "var(--muted)" }}>{helpText}</small>}
          </label>
        );
      }
      case "multiselect": {
        return (
          <fieldset key={key} className="field">
            <legend>{labelEl}</legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {options?.map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" name={key} value={opt.value} />
                  <span style={{ fontSize: 13 }}>{opt.label}</span>
                </label>
              ))}
            </div>
            {helpText && <small style={{ color: "var(--muted)" }}>{helpText}</small>}
          </fieldset>
        );
      }
      case "number":
      case "currency": {
        return (
          <label key={key} className="field">
            {labelEl}
            <input
              type="number"
              name={key}
              min={min}
              max={max}
              step={type === "currency" ? "0.01" : "any"}
              defaultValue={defaultValue !== undefined ? String(defaultValue) : ""}
            />
            {helpText && <small style={{ color: "var(--muted)" }}>{helpText}</small>}
          </label>
        );
      }
      case "date": {
        return (
          <label key={key} className="field">
            {labelEl}
            <input type="date" name={key} defaultValue={defaultValue !== undefined ? String(defaultValue) : ""} />
            {helpText && <small style={{ color: "var(--muted)" }}>{helpText}</small>}
          </label>
        );
      }
      case "boolean": {
        return (
          <label key={key} className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" name={key} value="true" defaultChecked={defaultValue === true} />
            <span>{label}</span>
            {helpText && <small style={{ color: "var(--muted)" }}>{helpText}</small>}
          </label>
        );
      }
      case "longtext": {
        return (
          <label key={key} className="field">
            {labelEl}
            <textarea name={key} rows={4} maxLength={field.maxLength} placeholder={helpText ?? label} />
            {helpText && <small style={{ color: "var(--muted)" }}>{helpText}</small>}
          </label>
        );
      }
      case "benchmark": {
        return null; // Benchmark selection is rendered separately via the dedicated component
      }
      default: {
        // text, or fallback
        return (
          <label key={key} className="field">
            {labelEl}
            <input
              type="text"
              name={key}
              maxLength={field.maxLength}
              defaultValue={defaultValue !== undefined ? String(defaultValue) : ""}
              placeholder={helpText ?? label}
            />
            {helpText && <small style={{ color: "var(--muted)" }}>{helpText}</small>}
          </label>
        );
      }
    }
  }

  return (
    <form action={formAction} className="change-form">
      <input type="hidden" name="changeTypeSlug" value={selectedType} />

      {/* Step 1: Context */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 1">01</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Context van de aanvraag</h2>
            <p>De klantconfiguratie bepaalt welke gegevens beschikbaar zijn.</p>
          </div>
          <label className="field">
            <span>Change type<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              {activeTypes.map((ct) => (
                <option key={ct.slug} value={ct.slug}>
                  {ct.name} — {ct.description}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Klant<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <select
              name="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.externalReference}</option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Aanvrager<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <input name="requestedBy" required placeholder="Naam van de contactpersoon" defaultValue="Ruben Verboon" />
            </label>
            <label className="field">
              <span>Gewenste ingangsdatum<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <input name="effectiveDate" required type="date" />
            </label>
          </div>
          <label className="field">
            <span>Reden van de wijziging<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <textarea name="rationale" required minLength={10} placeholder="Bijvoorbeeld: marktconforme aanpassing van tarieven." />
          </label>
        </div>
      </section>

      {/* Step 2: Dynamic fields based on change type */}
      {currentConfig && currentConfig.fields.length > 0 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 2">02</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>{currentConfig.name}</h2>
              <p>{currentConfig.description}</p>
            </div>
            <div className="generic-fields">
              {currentConfig.fields.map((field) => renderField(field))}
            </div>
          </div>
        </section>
      )}

      {/* Step 3: Costs and lead time */}
      {cost && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 3">03</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Kosten en doorlooptijd</h2>
              <p>Geschatte kosten en doorlooptijd op basis van het geselecteerde change type.</p>
            </div>
            <div className="cost-summary-inline">
              <div className="cost-summary-row">
                <span>Geschatte kosten</span>
                <span>€ {cost.cost.toLocaleString("nl-NL")} {cost.currency}</span>
              </div>
              <div className="cost-summary-row">
                <span>Doorlooptijd</span>
                <span>{currentConfig?.defaultLeadDays ?? "—"} dag{currentConfig?.defaultLeadDays !== 1 ? "en" : ""}</span>
              </div>
              {currentConfig && (
                <div className="cost-summary-row highlight">
                  <span>Kostendetail</span>
                  <span>{cost.description}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Step 4: Review and submit */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 4">04</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Controle en verzending</h2>
            <p>Het request wordt vastgelegd en is klaar voor distributie naar de betrokken stakeholders.</p>
          </div>
          {currentConfig && currentConfig.stakeholders.length > 0 && (
            <div className="stakeholder-grid">
              {currentConfig.stakeholders.map((s) => (
                <div key={s.id}>
                  <b>{s.name}</b>
                  <span>{s.role}{s.mandatory ? " (verplicht)" : ""}</span>
                </div>
              ))}
            </div>
          )}
          {state.issues && (
            <div className="form-errors" role="alert" aria-live="polite">
              <b>Controleer de aanvraag</b>
              <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}
          <div className="submit-row">
            <p><b>{currentConfig?.name ?? "Change"}</b></p>
            <button className="button button-primary" disabled={pending} type="submit">
              {pending ? "Aanvraag opslaan…" : "Genereer change request →"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
