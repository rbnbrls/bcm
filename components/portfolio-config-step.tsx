"use client";

import { useEffect, useMemo } from "react";
import type { ClientConfigAssetClass } from "@/lib/types";

/**
 * Portfolio metadata + first configuration row step for the client onboarding
 * wizard (task t_4ed84e67).
 *
 * Self-contained, data-driven step form:
 *  - `value` / `onChange` — controlled value
 *    ({ portfolioName, portfolioCode, assetClass, allocationPercentage })
 *  - `onValidationChange` — callback receiving the current errors + validity so
 *    the parent wizard shell can gate "Volgende →" / submit
 *  - `showErrors` — when true, inline field-level errors render (the parent
 *    flips this after the user tries to proceed with invalid values)
 *
 * A pure `validatePortfolioConfigStep(value)` helper is exported so the parent
 * can compute errors/validity without rendering the component.
 *
 * Intentionally contains no navigation and no wizard-level state — the shell
 * (task t_60c3573f) owns step switching and staged data.
 */

export type PortfolioConfigStepValue = {
  portfolioName: string;
  portfolioCode: string;
  assetClass: string;
  allocationPercentage: string;
};

export type PortfolioConfigStepErrors = Partial<Record<keyof PortfolioConfigStepValue, string>>;

// Portfolio code: 2-15 uppercase letters/digits (mirrors client_config.portfolio CHECK).
export const PORTFOLIO_CODE_PATTERN = /^[A-Z0-9]{2,15}$/;

/**
 * Pure validation for the portfolio step.
 * Required on every field; portfolio code must be 2-15 alphanumeric characters;
 * allocation percentage must be a finite number in [0, 100].
 */
export function validatePortfolioConfigStep(value: PortfolioConfigStepValue): PortfolioConfigStepErrors {
  const e: PortfolioConfigStepErrors = {};

  if (!value.portfolioName.trim()) e.portfolioName = "Portefeuillenaam is verplicht.";
  else if (value.portfolioName.trim().length < 2) e.portfolioName = "Portefeuillenaam moet minimaal 2 tekens bevatten.";

  if (!value.portfolioCode.trim()) e.portfolioCode = "Portefeuillecode is verplicht.";
  else if (!PORTFOLIO_CODE_PATTERN.test(value.portfolioCode.trim().toUpperCase()))
    e.portfolioCode = "Portefeuillecode bestaat uit 2-15 hoofdletters of cijfers (bijv. HOR-RP).";

  if (!value.assetClass) e.assetClass = "Kies een asset class.";

  const allocation = Number(value.allocationPercentage);
  if (!value.allocationPercentage.trim()) e.allocationPercentage = "Allocatiepercentage is verplicht.";
  else if (!Number.isFinite(allocation) || allocation < 0 || allocation > 100)
    e.allocationPercentage = "Allocatiepercentage moet tussen 0 en 100 liggen.";

  return e;
}

export function isPortfolioConfigStepValid(value: PortfolioConfigStepValue): boolean {
  return Object.keys(validatePortfolioConfigStep(value)).length === 0;
}

type Props = {
  value: PortfolioConfigStepValue;
  onChange: (value: PortfolioConfigStepValue) => void;
  assetClasses: ClientConfigAssetClass[];
  /** Render inline field errors (set after the user tries to proceed). */
  showErrors?: boolean;
  /** Live validation report so the parent shell can gate navigation/submit. */
  onValidationChange?: (errors: PortfolioConfigStepErrors, isValid: boolean) => void;
};

export function PortfolioConfigStep({ value, onChange, assetClasses, showErrors = false, onValidationChange }: Props) {
  const errors = useMemo(() => validatePortfolioConfigStep(value), [value]);

  const isValid = Object.keys(errors).length === 0;

  useEffect(() => {
    onValidationChange?.(errors, isValid);
  }, [errors, isValid, onValidationChange]);

  function updateField(key: keyof PortfolioConfigStepValue, fieldValue: string) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
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
              value={value.portfolioName}
              onChange={(e) => updateField("portfolioName", e.target.value)}
              placeholder="Bijv. Rendementsportefeuille"
              required
              minLength={2}
              maxLength={100}
              aria-invalid={Boolean(errors.portfolioName)}
            />
            {showErrors && errors.portfolioName && (
              <span className="field-error" role="alert">{errors.portfolioName}</span>
            )}
          </label>

          <label className="field">
            <span>Portefeuillecode<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <input
              type="text"
              value={value.portfolioCode}
              onChange={(e) => updateField("portfolioCode", e.target.value.toUpperCase())}
              placeholder="Bijv. HOR-RP"
              required
              minLength={2}
              maxLength={15}
              aria-invalid={Boolean(errors.portfolioCode)}
            />
            <small style={{ color: "var(--muted)" }}>Uniek binnen de administratie.</small>
            {showErrors && errors.portfolioCode && (
              <span className="field-error" role="alert">{errors.portfolioCode}</span>
            )}
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Asset class<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <select
              value={value.assetClass}
              onChange={(e) => updateField("assetClass", e.target.value)}
              required
              aria-invalid={Boolean(errors.assetClass)}
            >
              <option value="">Kies asset class</option>
              {assetClasses.map((ac) => (
                <option key={ac.assetClassId} value={ac.assetClassCode}>
                  {ac.assetClassCode} — {ac.assetClassName}
                </option>
              ))}
            </select>
            <small style={{ color: "var(--muted)" }}>Asset class van de eerste configuratieregel.</small>
            {showErrors && errors.assetClass && (
              <span className="field-error" role="alert">{errors.assetClass}</span>
            )}
          </label>

          <label className="field">
            <span>Allocatiepercentage<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <input
              type="number"
              value={value.allocationPercentage}
              onChange={(e) => updateField("allocationPercentage", e.target.value)}
              placeholder="Bijv. 50"
              required
              min={0}
              max={100}
              step="0.01"
              style={{ maxWidth: 140 }}
              aria-invalid={Boolean(errors.allocationPercentage)}
            />
            <small style={{ color: "var(--muted)" }}>Percentage van de portefeuille in deze asset class (0-100).</small>
            {showErrors && errors.allocationPercentage && (
              <span className="field-error" role="alert">{errors.allocationPercentage}</span>
            )}
          </label>
        </div>
      </div>
    </section>
  );
}
