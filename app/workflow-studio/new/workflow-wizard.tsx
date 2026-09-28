"use client";

import { useState, useActionState } from "react";
import { createWorkflowDraftAction, type CreateWorkflowDraftState } from "@/app/workflow-studio/actions";
import type { WorkflowTemplateOption } from "./workflow-draft-create-form";

const STEPS = ["Doel", "Gegevens", "Goedkeuring", "Actie", "Testen", "Publiceren"] as const;

function friendlyLabel(label: string): string {
  return label
    .replace(/ · (standaardtemplate|draft|v\d+)$/, "")
    .replace(/portfolio_configuration/gi, "portefeuille")
    .replace(/portfolio\b/gi, "portefeuille")
    .replace(/IST\/SOLL/g, "huidige en nieuwe waarden");
}

function friendlyDescription(description: string): string {
  return description
    .replace(/portfolio_configuration/gi, "portefeuille")
    .replace(/portfolio\b/gi, "portefeuille")
    .replace(/IST\/SOLL/g, "huidige en nieuwe waarden")
    .replace(/service catalogus/gi, "beschikbare catalogus");
}

export function WorkflowWizard({ templates, selectedTemplate = "" }: {
  templates: readonly WorkflowTemplateOption[];
  selectedTemplate?: string;
}) {
  const [state, action, pending] = useActionState<CreateWorkflowDraftState, FormData>(createWorkflowDraftAction, { success: false, message: "" });
  const [step, setStep] = useState(selectedTemplate ? 1 : 0);
  const [template, setTemplate] = useState(selectedTemplate);
  const [draftFields, setDraftFields] = useState({ name: "", slug: "", description: "" });
  const selected = templates.find((item) => item.reference === template);

  function choose(reference: string) {
    setTemplate(reference);
    setStep(1);
  }

  function fillExample() {
    setDraftFields({ name: "Benchmark wijzigen", slug: "benchmark-wijziging", description: "Een benchmark gecontroleerd wijzigen met goedkeuring." });
  }

  return (
    <form action={action} className="workflow-wizard studio-create-form" data-testid="workflow-wizard">
      <ol className="workflow-wizard-steps" aria-label="Workflowstappen">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "is-current" : index < step ? "is-complete" : undefined}>
            <button type="button" onClick={() => index <= step && setStep(index)} aria-current={index === step ? "step" : undefined}>
              <span>{index + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="workflow-wizard-panel" aria-labelledby="workflow-goal-title">
          <p className="eyebrow">STAP 1 VAN 6</p>
          <h2 id="workflow-goal-title">Wat wil je regelen?</h2>
          <p>Kies een herkenbaar scenario. De juiste stappen, velden en controles worden automatisch klaargezet.</p>
          <div className="workflow-scenario-grid">
            {templates.map((item) => (
              <button type="button" className={`workflow-scenario-card${item.reference === template ? " is-selected" : ""}`} key={item.reference} onClick={() => choose(item.reference)}>
                <strong>{friendlyLabel(item.label)}</strong>
                <span>{friendlyDescription(item.description)}</span>
                <small>Dit scenario kiezen →</small>
              </button>
            ))}
          </div>
          <label className="workflow-wizard-select">Of kies een bestaande workflow als startpunt
            <select value={template} onChange={(event) => choose(event.target.value)}>
              <option value="">Kies een scenario…</option>
              {templates.map((item) => <option value={item.reference} key={item.reference}>{friendlyLabel(item.label)}</option>)}
            </select>
          </label>
        </section>
      ) : (
        <>
          <input type="hidden" name="template" value={template} />
          <input type="hidden" name="name" value={draftFields.name} />
          <input type="hidden" name="slug" value={draftFields.slug} />
          <input type="hidden" name="description" value={draftFields.description} />
          <section className="workflow-wizard-panel" aria-labelledby="workflow-details-title">
            <p className="eyebrow">STAP {step + 1} VAN 6</p>
            <h2 id="workflow-details-title">{STEPS[step]} voor {selected ? friendlyLabel(selected.label) : "je workflow"}</h2>
            <p>{step === 1 ? "Geef de workflow een herkenbare naam en beschrijf het doel." : step === 2 ? "Controleer wie de aanvraag mag goedkeuren." : step === 3 ? "Controleer welke wijziging na goedkeuring wordt uitgevoerd." : step === 4 ? "Vul voorbeeldgegevens in en test een veilig voorbeeldpad." : "Controleer de impact en bied de workflow ter review aan."}</p>
            {step === 1 ? <div className="workflow-wizard-fields">
              <label className="field"><span>Naam</span><input minLength={2} maxLength={200} required autoFocus value={draftFields.name} onChange={(event) => setDraftFields((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Technische slug <small>(alleen voor de URL)</small></span><input pattern="[a-z0-9]+(?:[-_][a-z0-9]+)*" maxLength={120} required placeholder="bijvoorbeeld benchmark-wijziging" value={draftFields.slug} onChange={(event) => setDraftFields((current) => ({ ...current, slug: event.target.value }))} /></label>
              <label className="field studio-field-wide"><span>Doel</span><textarea maxLength={2000} placeholder="Beschrijf kort waarvoor dit proces wordt gebruikt." value={draftFields.description} onChange={(event) => setDraftFields((current) => ({ ...current, description: event.target.value }))} /></label>
              <button type="button" className="button button-secondary" onClick={fillExample}>Voorbeeld invullen</button>
            </div> : null}
            {step === 2 ? <div className="workflow-wizard-summary"><strong>Goedkeuring</strong><p>De geselecteerde template bevat een goedkeuringsstap. De goedkeurdersrol en besluiten kunnen na het aanmaken worden gecontroleerd.</p><a href="#workflow-review-title">Naar goedkeuringsinstellingen</a></div> : null}
            {step === 3 ? <div className="workflow-wizard-summary"><strong>Actie</strong><p>De actie gebruikt de catalogus en de gegevens uit het formulier. Technische mappings blijven verborgen totdat je Geavanceerde modus opent.</p></div> : null}
            {step === 4 ? <div className="workflow-wizard-summary"><strong>Testpad</strong><p>Na het aanmaken kun je voorbeeldgegevens invullen en op <em>Test dit pad</em> drukken. De test gebruikt geen productiedata.</p></div> : null}
            {step === 5 ? <div className="workflow-wizard-summary"><strong>Publiceren</strong><p>Opslaan als concept, ter review aanbieden en publiceren zijn afzonderlijke acties. Publiceren kan alleen na validatie en goedkeuring.</p></div> : null}
          </section>
          <div className="workflow-wizard-actions">
            <button type="button" className="button button-secondary" onClick={() => setStep(Math.max(0, step - 1))}>Vorige</button>
            {step < STEPS.length - 1 ? <button type="button" className="button button-primary" onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}>Volgende</button> : <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Concept wordt aangemaakt…" : "Concept aanmaken"}</button>}
          </div>
        </>
      )}
      {state.message ? <div className="form-errors" role="alert"><b>Workflow niet aangemaakt</b><p>{state.message}</p>{state.issues?.length ? <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}</div> : null}
      <p className="workflow-wizard-note">Je kunt technische details later bekijken via <strong>Geavanceerde modus</strong>.</p>
    </form>
  );
}
