"use client";

import { useActionState } from "react";
import { createNewSubAssetClass, type FormState } from "@/app/sub-asset-class-aanvraag/actions";
import type { ClientConfig, ClientConfigAssetClass } from "@/lib/types";

type Props = { clients: ClientConfig[]; assetClasses: ClientConfigAssetClass[] };
const initialState: FormState = {};

export function SubAssetClassRequestForm({ clients, assetClasses }: Props) {
  const [state, formAction, pending] = useActionState(createNewSubAssetClass, initialState);

  return (
    <form action={formAction} className="change-form">
      <section className="form-section">
        <div className="section-number" aria-hidden="true">01</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Aanvraag context</h2>
            <p>Voor welke klant wordt de nieuwe sub asset class aangevraagd?</p>
          </div>
          <label className="field">
            <span>Klant</span>
            <select name="clientId" required aria-label="Selecteer klant">
              <option value="">Kies een klant</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.externalReference}</option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Aanvrager</span>
              <input name="requestedBy" required placeholder="Naam van de contactpersoon" defaultValue="Ruben Verboon" aria-label="Aanvrager" />
            </label>
            <label className="field">
              <span>Gewenste ingangsdatum</span>
              <input name="effectiveDate" required type="date" aria-label="Gewenste ingangsdatum" />
            </label>
          </div>
          <label className="field">
            <span>Reden van de aanvraag</span>
            <textarea name="rationale" required minLength={10} placeholder="Waarom is een nieuwe sub asset class nodig?" aria-label="Reden van de aanvraag" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-hidden="true">02</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Nieuwe sub asset class specificaties</h2>
            <p>De sub asset class valt altijd onder één bestaande asset class.</p>
          </div>
          <label className="field">
            <span>Bestaande asset class</span>
            <select name="parentAssetClass" required aria-label="Bestaande asset class">
              <option value="">Kies een asset class</option>
              {assetClasses.map((ac) => (
                <option key={ac.assetClassCode} value={ac.assetClassName}>{ac.assetClassName} ({ac.assetClassCode})</option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Sub asset class code (3 letters)</span>
              <input name="subAssetClassCode" required placeholder="Bijv. PRI" maxLength={3} aria-label="Sub asset class code" />
            </label>
            <label className="field">
              <span>Sorteervolgorde (optioneel)</span>
              <input name="sortOrder" type="number" min={1} placeholder="Bijv. 5" aria-label="Sorteervolgorde" />
            </label>
          </div>
          <label className="field">
            <span>Sub asset class naam</span>
            <input name="subAssetClassName" required placeholder="Bijv. PRIVATE EQUITY" maxLength={100} aria-label="Sub asset class naam" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-hidden="true">03</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Kosten en doorlooptijd</h2>
            <p>Deze schatting is gebaseerd op een standaard nieuwe sub asset class aanvraag.</p>
          </div>
          <div className="estimate-grid">
            <div className="estimate-card">
              <span className="estimate-label">Doorlooptijd</span>
              <strong className="estimate-value">2 weken</strong>
              <span className="estimate-note">Vanaf indienen aanvraag</span>
            </div>
            <div className="estimate-card">
              <span className="estimate-label">Geschatte kosten</span>
              <strong className="estimate-value">€ 1.500</strong>
              <span className="estimate-note">Per nieuwe sub asset class</span>
            </div>
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-hidden="true">04</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Controle en verzending</h2>
            <p>De aanvraag wordt als &ldquo;submitted&rdquo; vastgelegd en doorloopt de goedkeuringsworkflow.</p>
          </div>
          {state.issues && (
            <div className="form-errors" role="alert" aria-live="polite">
              <b>Controleer de aanvraag</b>
              <ul>
                {state.issues.map((issue: string) => <li key={issue}>{issue}</li>)}
              </ul>
            </div>
          )}
          <div className="submit-row">
            <button className="button button-primary" disabled={pending} type="submit">
              {pending ? "Aanvraag opslaan…" : "Nieuwe sub asset class aanvragen →"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
