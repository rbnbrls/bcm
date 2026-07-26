"use client";

import { useActionState } from "react";
import { createCustomerOnboarding, type OnboardingFormState } from "../actions";

const initialState: OnboardingFormState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createCustomerOnboarding, initialState);

  return (
    <form action={formAction} className="change-form">
      {/* Step 1: Customer details */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 1">01</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Klantgegevens</h2>
            <p>Basisgegevens van de nieuwe klant.</p>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Klantnaam<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <input name="customer_name" required placeholder="Bijv. Pensioenfonds Voorbeeld" />
            </label>
            <label className="field">
              <span>Extern referentienummer<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <input name="external_reference" required placeholder="Bijv. PF-VRB-001" />
            </label>
          </div>
        </div>
      </section>

      {/* Step 2: Regeling */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 2">02</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Regeling</h2>
            <p>Kies het type premieregeling voor deze klant.</p>
          </div>
          <div className="field-row">
            <fieldset className="field">
              <span>Regeling<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "12px 16px", border: "2px solid var(--border)", borderRadius: 8, flex: 1 }}>
                  <input type="radio" name="regeling_type" value="FPR" defaultChecked />
                  <div>
                    <b>FPR</b>
                    <br />
                    <small>Flexibele Premieregeling</small>
                  </div>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "12px 16px", border: "2px solid var(--border)", borderRadius: 8, flex: 1 }}>
                  <input type="radio" name="regeling_type" value="SPR" />
                  <div>
                    <b>SPR</b>
                    <br />
                    <small>Solidaire Premieregeling</small>
                  </div>
                </label>
              </div>
              <small style={{ color: "var(--muted)", marginTop: 4, display: "block" }}>
                FPR biedt flexibiliteit in premie-inleg; SPR is een vaste premie met collectieve risicodeling.
              </small>
            </fieldset>
          </div>
        </div>
      </section>

      {/* Step 3: Portfolio count */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 3">03</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Portfolio's</h2>
            <p>Geef aan hoeveel portfolio's de klant wil. Elke portfolio krijgt een automatisch gegenereerde naam.</p>
          </div>
          <label className="field">
            <span>Aantal portfolio's<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <input
              type="number"
              name="portfolio_count"
              required
              min="1"
              defaultValue="1"
              style={{ maxWidth: 120 }}
            />
            <small style={{ color: "var(--muted)" }}>
              Portfolio's worden aangemaakt met namen als &quot;Portefeuille 1&quot;, &quot;Portefeuille 2&quot;, etc.
            </small>
          </label>
        </div>
      </section>

      {/* Step 4: Submit */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 4">04</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Controleren en opslaan</h2>
            <p>Het request wordt vastgelegd als change request en is direct zichtbaar in het dashboard.</p>
          </div>
          {state.issues && (
            <div className="form-errors" role="alert" aria-live="polite">
              <b>Controleer de gegevens</b>
              <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}
          <div className="submit-row">
            <button className="button button-primary" disabled={pending} type="submit">
              {pending ? "Klant onboarden…" : "Klant onboarden →"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
