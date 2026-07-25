"use client";

import { useActionState } from "react";
import { createNewBenchmark, type FormState } from "@/app/benchmark-aanvraag/actions";
import type { ClientConfig } from "@/lib/types";

type Props = { clients: ClientConfig[] };
const initialState: FormState = {};

const ASSET_CLASS_OPTIONS = [
  "Aandelen",
  "Obligaties",
  "Vastgoed",
  "Alternatieven",
  "Liquiditeiten",
  "Private Equity",
  "Infrastructure",
  "Grondstoffen",
];

export function NewBenchmarkForm({ clients }: Props) {
  const [state, formAction, pending] = useActionState(createNewBenchmark, initialState);

  return (
    <form action={formAction} className="change-form">
      <section className="form-section">
        <div className="section-number">01</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Aanvraag context</h2>
            <p>Voor welke klant wordt de nieuwe benchmark aangevraagd?</p>
          </div>
          <label className="field">
            <span>Klant</span>
            <select name="clientId" required>
              <option value="">Kies een klant</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.externalReference}</option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Aanvrager</span>
              <input name="requestedBy" required placeholder="Naam van de contactpersoon" defaultValue="Ruben Verboon" />
            </label>
            <label className="field">
              <span>Gewenste ingangsdatum</span>
              <input name="effectiveDate" required type="date" />
            </label>
          </div>
          <label className="field">
            <span>Reden van de aanvraag</span>
            <textarea name="rationale" required minLength={10} placeholder="Waarom is een nieuwe benchmark nodig?" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number">02</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Nieuwe benchmark specificaties</h2>
            <p>Geef de gewenste eigenschappen van de nieuwe benchmark. De identifier wordt automatisch gegenereerd.</p>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Short name (code)</span>
              <input name="shortName" required placeholder="Bijv. CUSTOM-ESG-NL" />
            </label>
            <label className="field">
              <span>Valuta</span>
              <input name="currency" required placeholder="EUR" defaultValue="EUR" />
            </label>
          </div>
          <label className="field">
            <span>Long name</span>
            <input name="longName" required placeholder="Bijv. Custom ESG Nederland Benchmark" />
          </label>
          <label className="field">
            <span>Asset class</span>
            <select name="assetClass" required>
              <option value="">Kies asset class</option>
              {ASSET_CLASS_OPTIONS.map((ac) => (
                <option key={ac} value={ac}>{ac}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number">03</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Kosten en doorlooptijd</h2>
            <p>Deze schatting is gebaseerd op een standaard nieuwe benchmark aanvraag.</p>
          </div>
          <div className="estimate-grid">
            <div className="estimate-card">
              <span className="estimate-label">Doorlooptijd</span>
              <strong className="estimate-value">4 weken</strong>
              <span className="estimate-note">Vanaf indienen aanvraag</span>
            </div>
            <div className="estimate-card">
              <span className="estimate-label">Geschatte kosten</span>
              <strong className="estimate-value">€ 5.000</strong>
              <span className="estimate-note">Per nieuwe benchmark</span>
            </div>
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number">04</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Controle en verzending</h2>
            <p>De aanvraag wordt als "submitted" vastgelegd en doorgestuurd voor verwerking.</p>
          </div>
          {state.issues && (
            <div className="form-errors" role="alert">
              <b>Controleer de aanvraag</b>
              {state.issues.map((issue: string) => <li key={issue}>{issue}</li>)}
            </div>
          )}
          <div className="submit-row">
            <button className="button button-primary" disabled={pending} type="submit">
              {pending ? "Aanvraag opslaan…" : "Nieuwe benchmark aanvragen →"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
