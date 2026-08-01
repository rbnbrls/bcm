"use client";

import { useActionState, useMemo, useState } from "react";
import { createClientOnboardingChange, type ClientOnboardingFormState } from "@/app/changes/new/client-onboarding-actions";
import { UniqueCodeField } from "@/components/unique-code-field";
import type { UniquenessStatus } from "@/lib/use-code-uniqueness";
import type { ClientConfigAssetClass } from "@/lib/types";

/**
 * Client onboarding wizard — starts the lifecycle of a new pension fund
 * (legal entity) together with its first portfolio configuration row.
 *
 * Steps:
 *   1. Klantgegevens  — client code + client name
 *   2. Portfolio & eerste configuratieregel — portfolio name/code, asset class,
 *      allocation percentage
 *   3. Controleren en verzenden — review of all staged data + submit
 *
 * All collected data is staged in local state (per step) and carried into the
 * server action through hidden inputs, so nothing is lost when navigating
 * back and forth between steps.
 *
 * Uniqueness of client code and portfolio code is validated against the
 * backend (GET /api/validate-code-uniqueness) with inline error messages:
 * duplicate codes block the "Volgende →" button, unique codes pass.
 */

export type ClientOnboardingData = {
  clientCode: string;
  clientName: string;
  portfolioName: string;
  portfolioCode: string;
  assetClassCode: string;
  allocationPercentage: string;
};

type Props = {
  assetClasses: ClientConfigAssetClass[];
};

const initialState: ClientOnboardingFormState = {};

// Client code: 1-3 uppercase letters/digits (mirrors client_config.client CHECK).
const CLIENT_CODE_PATTERN = /^[A-Z0-9]{1,3}$/;
// Portfolio code: 2-15 uppercase letters/digits (mirrors client_config.portfolio CHECK).
const PORTFOLIO_CODE_PATTERN = /^[A-Z0-9]{2,15}$/;

export function ClientOnboardingWizard({ assetClasses }: Props) {
  const [step, setStep] = useState(1);
  const [state, formAction, pending] = useActionState(createClientOnboardingChange, initialState);

  // ── Step 1: Klantgegevens ──
  const [clientCode, setClientCode] = useState("");
  const [clientName, setClientName] = useState("");

  // ── Step 2: Portfolio & eerste configuratieregel ──
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolioCode, setPortfolioCode] = useState("");
  const [assetClassCode, setAssetClassCode] = useState("");
  const [allocationPercentage, setAllocationPercentage] = useState("");

  // ── Uniqueness status from the backend (duplicate codes block submission) ──
  const [clientCodeStatus, setClientCodeStatus] = useState<UniquenessStatus>("idle");
  const [portfolioCodeStatus, setPortfolioCodeStatus] = useState<UniquenessStatus>("idle");

  // ── Per-field validation (required + format) ──
  const errors = useMemo(() => {
    const e: Record<string, string> = {};

    if (!clientCode.trim()) e.clientCode = "Klantcode is verplicht.";
    else if (!CLIENT_CODE_PATTERN.test(clientCode.trim().toUpperCase()))
      e.clientCode = "Klantcode bestaat uit 1-3 hoofdletters of cijfers (bijv. HOR).";

    if (!clientName.trim()) e.clientName = "Klantnaam is verplicht.";
    else if (clientName.trim().length < 2) e.clientName = "Klantnaam moet minimaal 2 tekens bevatten.";

    if (!portfolioName.trim()) e.portfolioName = "Portefeuillenaam is verplicht.";
    else if (portfolioName.trim().length < 2) e.portfolioName = "Portefeuillenaam moet minimaal 2 tekens bevatten.";

    if (!portfolioCode.trim()) e.portfolioCode = "Portefeuillecode is verplicht.";
    else if (!PORTFOLIO_CODE_PATTERN.test(portfolioCode.trim().toUpperCase()))
      e.portfolioCode = "Portefeuillecode bestaat uit 2-15 hoofdletters of cijfers (bijv. HOR-RP).";

    if (!assetClassCode) e.assetClassCode = "Kies een asset class.";

    const allocation = Number(allocationPercentage);
    if (!allocationPercentage.trim()) e.allocationPercentage = "Allocatiepercentage is verplicht.";
    else if (!Number.isFinite(allocation) || allocation < 0 || allocation > 100)
      e.allocationPercentage = "Allocatiepercentage moet tussen 0 en 100 liggen.";

    return e;
  }, [assetClassCode, allocationPercentage, clientCode, clientName, portfolioCode, portfolioName]);

  function isStep1Valid() {
    // Unique codes pass; duplicates (or unresolved checks) block the next step.
    return !errors.clientCode && !errors.clientName && clientCodeStatus !== "taken";
  }

  function isStep2Valid() {
    return (
      !errors.portfolioName &&
      !errors.portfolioCode &&
      !errors.assetClassCode &&
      !errors.allocationPercentage &&
      portfolioCodeStatus !== "taken"
    );
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1));
  }

  function handleNext() {
    setStep((s) => Math.min(3, s + 1));
  }

  const selectedAssetClass = useMemo(
    () => assetClasses.find((ac) => ac.assetClassCode === assetClassCode),
    [assetClassCode, assetClasses],
  );

  return (
    <form action={formAction} className="change-form">
      {/* Hidden inputs — carry all staged data into the server action */}
      <input type="hidden" name="clientCode" value={clientCode.trim().toUpperCase()} />
      <input type="hidden" name="clientName" value={clientName.trim()} />
      <input type="hidden" name="portfolioName" value={portfolioName.trim()} />
      <input type="hidden" name="portfolioCode" value={portfolioCode.trim().toUpperCase()} />
      <input type="hidden" name="assetClassCode" value={assetClassCode} />
      <input type="hidden" name="allocationPercentage" value={allocationPercentage.trim()} />

      {/* Step indicator */}
      <div className="step-indicator">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`step-dot ${step === s ? "active" : step > s ? "done" : ""}`}>
            <span className="step-number">{s}</span>
            <span className="step-label">
              {s === 1 ? "Klantgegevens" : s === 2 ? "Portfolio & configuratieregel" : "Controleren"}
            </span>
          </div>
        ))}
      </div>

      {/* ════════════ Step 1: Klantgegevens ════════════ */}
      {step === 1 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 1">01</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Klantgegevens</h2>
              <p>Basisgegevens van de nieuwe pensioenklant. Klantcode is uniek in de administratie.</p>
            </div>

            <div className="field-row">
              <UniqueCodeField
                kind="client"
                label="Klantcode"
                value={clientCode}
                onChange={setClientCode}
                placeholder="Bijv. HOR"
                required
                onStatusChange={setClientCodeStatus}
              />
              <small style={{ color: "var(--muted)", marginTop: -10 }}>
                Uniek in de administratie — dubbele codes worden geweigerd.
              </small>

              <label className="field">
                <span>Klantnaam<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Bijv. Pensioenfonds Horizon"
                  required
                  minLength={2}
                  maxLength={100}
                  aria-invalid={Boolean(errors.clientName)}
                />
                <small style={{ color: "var(--muted)" }}>Volledige naam van de pensioenklant.</small>
                {errors.clientName && <span className="field-error" role="alert">{errors.clientName}</span>}
              </label>
            </div>

            <div className="form-nav">
              <span></span>
              <button type="button" className="button button-primary" onClick={handleNext} disabled={!isStep1Valid()}>
                Volgende →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════ Step 2: Portfolio & eerste configuratieregel ════════════ */}
      {step === 2 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 2">02</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Portfolio &amp; eerste configuratieregel</h2>
              <p>Stel de eerste portefeuille van deze klant in en de eerste configuratieregel (asset class + allocatie).</p>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Portefeuillenaam<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input
                  type="text"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Bijv. Rendementsportefeuille"
                  required
                  minLength={2}
                  maxLength={100}
                  aria-invalid={Boolean(errors.portfolioName)}
                />
                {errors.portfolioName && <span className="field-error" role="alert">{errors.portfolioName}</span>}
              </label>

              <label className="field">
                <span>Portefeuillecode<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input
                  type="text"
                  value={portfolioCode}
                  onChange={(e) => setPortfolioCode(e.target.value.toUpperCase())}
                  placeholder="Bijv. HOR-RP"
                  required
                  minLength={2}
                  maxLength={15}
                  aria-invalid={Boolean(errors.portfolioCode)}
                />
                <small style={{ color: "var(--muted)" }}>Uniek binnen de administratie.</small>
                {errors.portfolioCode && <span className="field-error" role="alert">{errors.portfolioCode}</span>}
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Asset class<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <select
                  value={assetClassCode}
                  onChange={(e) => setAssetClassCode(e.target.value)}
                  required
                  aria-invalid={Boolean(errors.assetClassCode)}
                >
                  <option value="">Kies asset class</option>
                  {assetClasses.map((ac) => (
                    <option key={ac.assetClassId} value={ac.assetClassCode}>
                      {ac.assetClassCode} — {ac.assetClassName}
                    </option>
                  ))}
                </select>
                <small style={{ color: "var(--muted)" }}>Asset class van de eerste configuratieregel.</small>
                {errors.assetClassCode && <span className="field-error" role="alert">{errors.assetClassCode}</span>}
              </label>

              <label className="field">
                <span>Allocatiepercentage<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
                <input
                  type="number"
                  value={allocationPercentage}
                  onChange={(e) => setAllocationPercentage(e.target.value)}
                  placeholder="Bijv. 50"
                  required
                  min={0}
                  max={100}
                  step="0.01"
                  style={{ maxWidth: 140 }}
                  aria-invalid={Boolean(errors.allocationPercentage)}
                />
                <small style={{ color: "var(--muted)" }}>Percentage van de portefeuille in deze asset class (0-100).</small>
                {errors.allocationPercentage && <span className="field-error" role="alert">{errors.allocationPercentage}</span>}
              </label>
            </div>

            <div className="form-nav">
              <button type="button" className="button" onClick={handleBack}>← Vorige</button>
              <button type="button" className="button button-primary" onClick={handleNext} disabled={!isStep2Valid()}>
                Volgende →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ════════════ Step 3: Controleren en verzenden ════════════ */}
      {step === 3 && (
        <section className="form-section">
          <div className="section-number" aria-label="Stap 3">03</div>
          <div className="section-content">
            <div className="section-heading">
              <h2>Controleren en verzenden</h2>
              <p>Controleer alle gegevens voordat de onboarding-aanvraag wordt ingediend.</p>
            </div>

            <div className="review-section">
              <h3>Klantgegevens</h3>
              <table className="review-table">
                <tbody>
                  <tr><td>Klantcode</td><td><strong>{clientCode.trim().toUpperCase()}</strong></td></tr>
                  <tr><td>Klantnaam</td><td><strong>{clientName.trim()}</strong></td></tr>
                </tbody>
              </table>
            </div>

            <div className="review-section">
              <h3>Portfolio &amp; eerste configuratieregel</h3>
              <table className="review-table">
                <tbody>
                  <tr><td>Portefeuillenaam</td><td><strong>{portfolioName.trim()}</strong></td></tr>
                  <tr><td>Portefeuillecode</td><td><strong>{portfolioCode.trim().toUpperCase()}</strong></td></tr>
                  <tr>
                    <td>Asset class</td>
                    <td>
                      <strong>
                        {selectedAssetClass
                          ? `${selectedAssetClass.assetClassCode} — ${selectedAssetClass.assetClassName}`
                          : assetClassCode || "—"}
                      </strong>
                    </td>
                  </tr>
                  <tr><td>Allocatiepercentage</td><td><strong>{allocationPercentage.trim()}%</strong></td></tr>
                </tbody>
              </table>
            </div>

            {state.issues && (
              <div className="form-errors" role="alert" aria-live="polite">
                <b>Controleer de aanvraag</b>
                <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              </div>
            )}
            {state.message && !state.issues && (
              <div className="form-success" role="status">
                {state.message}
              </div>
            )}

            <div className="stakeholder-grid" style={{ marginTop: 16 }}>
              <div><b>Interne administratie</b><span>Wordt geïnformeerd bij submit</span></div>
              <div><b>Asset service provider</b><span>Voert de onboarding uit na accordering</span></div>
            </div>

            <div className="form-nav">
              <button type="button" className="button" onClick={handleBack}>← Vorige</button>
              <button className="button button-primary" disabled={pending} type="submit">
                {pending ? "Aanvraag opslaan…" : "Genereer change request →"}
              </button>
            </div>
          </div>
        </section>
      )}
    </form>
  );
}
