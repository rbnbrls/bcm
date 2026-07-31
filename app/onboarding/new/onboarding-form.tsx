"use client";

import { useActionState } from "react";
import { createCustomerOnboarding, type OnboardingFormState } from "../actions";
import type { WtpClassification, ClientConfigAssetClassAdmin, Manager, BenchmarkGroup } from "@/lib/types";

const initialState: OnboardingFormState = {};

export function OnboardingForm({
  wtpClassifications,
  assetClassRows,
  managers,
  benchmarkGroups,
}: {
  wtpClassifications: WtpClassification[];
  assetClassRows: ClientConfigAssetClassAdmin[];
  managers: Manager[];
  benchmarkGroups: BenchmarkGroup[];
}) {
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

      {/* Step 3: Asset class */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 3">03</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Asset class</h2>
            <p>Kies de asset class die van toepassing is op deze klant.</p>
          </div>
          <label className="field">
            <span>Asset class<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <select name="asset_class" required defaultValue="">
              <option value="" disabled>Selecteer een asset class…</option>
              <option value="CASH">Cash</option>
              <option value="ALTERNATIVES">Alternatives</option>
              <option value="EQUITIES">Equities</option>
              <option value="FIXED_INCOME">Fixed Income</option>
              <option value="REAL_ASSETS">Real Assets</option>
              <option value="OVERLAY">Overlay</option>
              <option value="MULTI_ASSETS">Multi Assets</option>
              <option value="IMPACT">Impact</option>
              <option value="OPBOUW">Opbouw</option>
              <option value="RENDEMENT">Rendement</option>
              <option value="RENTE">Rente</option>
              <option value="INFLATION">Inflation</option>
              <option value="MATCHING">Matching</option>
              <option value="COLLATERAL">Collateral</option>
              <option value="RESERVE">Reserve</option>
            </select>
            <small style={{ color: "var(--muted)" }}>
              De asset class bepaalt het type beleggingscategorie voor deze klant.
            </small>
          </label>
        </div>
      </section>

      {/* Step 4: Portfolio attribute fields — mandatory per-portfolio */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 4">04</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Portfolio attributen</h2>
            <p>Verplichte attributen die van toepassing zijn op alle portfolio&rsquo;s van deze klant.</p>
          </div>
          <div className="field-row">
            <label className="field">
              <span>WTP classificatie<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select name="wtp_classification_id" required defaultValue="">
                <option value="" disabled>Selecteer WTP classificatie…</option>
                {wtpClassifications.map((wtp) => (
                  <option key={wtp.id} value={wtp.id}>{wtp.name}</option>
                ))}
              </select>
              <small style={{ color: "var(--muted)" }}>
                WTP classificatie: Rendement, Matching of Opbouw.
              </small>
            </label>
            <label className="field">
              <span>Asset class (portefeuille)<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select name="asset_class_id" required defaultValue="">
                <option value="" disabled>Selecteer asset class…</option>
                {assetClassRows.map((ac) => (
                  <option key={ac.assetClassId} value={ac.assetClassId}>
                    {ac.assetClassCode} · {ac.assetClassName}
                  </option>
                ))}
              </select>
              <small style={{ color: "var(--muted)" }}>
                Bijv. Aandelen, Obligaties, Vastgoed.
              </small>
            </label>
          </div>
          <div className="field-row" style={{ marginTop: 16 }}>
            <label className="field">
              <span>Manager<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select name="manager_id" required defaultValue="">
                <option value="" disabled>Selecteer manager…</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <small style={{ color: "var(--muted)" }}>
                Eigen beheer of externe beheerder.
              </small>
            </label>
            <label className="field">
              <span>Benchmark<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
              <select name="benchmark_id" required defaultValue="">
                <option value="" disabled>Selecteer benchmark…</option>
                {benchmarkGroups.map((bg) => (
                  <option key={bg.id} value={bg.id}>{bg.name}</option>
                ))}
              </select>
              <small style={{ color: "var(--muted)" }}>
                Benchmarkgroep voor deze portefeuille(s).
              </small>
            </label>
          </div>
        </div>
      </section>

      {/* Step 5: Portfolio count */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 5">05</div>
        <div className="section-content">
          <div className="section-heading">
            <h2>Portfolio&rsquo;s</h2>
            <p>Geef aan hoeveel portfolio&rsquo;s de klant wil. Elke portfolio krijgt een automatisch gegenereerde naam.</p>
          </div>
          <label className="field">
            <span>Aantal portfolio&rsquo;s<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <input
              type="number"
              name="portfolio_count"
              required
              min="1"
              defaultValue="1"
              style={{ maxWidth: 120 }}
            />
            <small style={{ color: "var(--muted)" }}>
              Portfolio&rsquo;s worden aangemaakt met namen als &quot;Portefeuille 1&quot;, &quot;Portefeuille 2&quot;, etc.
            </small>
          </label>
        </div>
      </section>

      {/* Step 6: Submit */}
      <section className="form-section">
        <div className="section-number" aria-label="Stap 6">06</div>
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
