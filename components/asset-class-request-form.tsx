"use client";

import { useActionState } from "react";
import { createNewAssetClass, type FormState } from "@/app/asset-class-aanvraag/actions";
import type { ClientConfig } from "@/lib/types";

type Props = { clients: ClientConfig[] };
const initialState: FormState = {};

export function AssetClassRequestForm({ clients }: Props) {
  const [state, formAction, pending] = useActionState(createNewAssetClass, initialState);

  return (
    <form action={formAction} className="change-form">
      <section className="form-section">
        <div className="section-number" aria-hidden="true">01</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Aanvraag context</h2>
            <p>Voor welke klant wordt de nieuwe asset class aangevraagd?</p>
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
            <textarea name="rationale" required minLength={10} placeholder="Waarom is een nieuwe asset class nodig?" aria-label="Reden van de aanvraag" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-hidden="true">02</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Nieuwe asset class specificaties</h2>
            <p>De code wordt onderdeel van de primary account id en moet uniek zijn (2 hoofdletters).</p>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Asset class code (2 letters)</span>
              <input name="assetClassCode" required placeholder="Bijv. PR" maxLength={2} aria-label="Asset class code" />
            </label>
            <label className="field">
              <span>Asset class naam</span>
              <input name="assetClassName" required placeholder="Bijv. PRIVATE MARKETS" maxLength={30} aria-label="Asset class naam" />
            </label>
          </div>
          <label className="field">
            <span>Sub asset classes (optioneel)</span>
            <textarea
              name="subAssetClasses"
              rows={4}
              placeholder={"Eén per regel: CODE|Naam\nBijv.\nPRI|PRIVATE EQUITY\nPRD|PRIVATE DEBT"}
              aria-label="Sub asset classes"
            />
            <small style={{ color: "var(--muted)" }}>Nieuwe asset classes worden meestal samen met hun sub asset classes aangevraagd.</small>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-hidden="true">03</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Kosten en doorlooptijd</h2>
            <p>Deze schatting is gebaseerd op een standaard nieuwe asset class aanvraag.</p>
          </div>
          <div className="estimate-grid">
            <div className="estimate-card">
              <span className="estimate-label">Doorlooptijd</span>
              <strong className="estimate-value">3 weken</strong>
              <span className="estimate-note">Vanaf indienen aanvraag</span>
            </div>
            <div className="estimate-card">
              <span className="estimate-label">Geschatte kosten</span>
              <strong className="estimate-value">€ 2.500</strong>
              <span className="estimate-note">Per nieuwe asset class</span>
            </div>
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="section-number" aria-hidden="true">04</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Controle en verzending</h2>
            <p>De aanvraag wordt als &ldquo;submitted&rdquo; vastgelegd en doorlopen de goedkeuringsworkflow.</p>
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
              {pending ? "Aanvraag opslaan…" : "Nieuwe asset class aanvragen →"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
