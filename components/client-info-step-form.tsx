"use client";

import { useEffect, useMemo } from "react";
import { CLIENT_CODE_PATTERN } from "@/lib/validation-rules";

/**
 * Client info step for the client onboarding wizard (task t_a3fe436e).
 *
 * Self-contained, data-driven step form:
 *  - `value` / `onChange` — controlled value
 *    ({ clientCode, clientName })
 *  - `onValidationChange` — callback receiving the current errors + validity so
 *    the parent wizard shell can gate "Volgende →" / submit
 *  - `showErrors` — when true, inline field-level errors render (the parent
 *    flips this after the user tries to proceed with invalid values)
 *
 * A pure `validateClientInfoStep(value)` helper is exported so the parent
 * can compute errors/validity without rendering the component.
 *
 * Intentionally contains no navigation and no wizard-level state — the shell
 * (task t_60c3573f) owns step switching and staged data.
 */

export type ClientInfoStepValue = {
  clientCode: string;
  clientName: string;
};

export type ClientInfoStepErrors = Partial<Record<keyof ClientInfoStepValue, string>>;

/**
 * Pure validation for the client info step.
 * Both fields are required; client code must be a non-empty alphanumeric
 * string (1-3 uppercase letters/digits, mirroring the client_config.client
 * CHECK constraint). Hyphens/underscores are intentionally NOT allowed in
 * client codes — the DB CHECK constrains them to [A-Z0-9]{1,3}, and the code
 * is used inside account ids.
 */
export function validateClientInfoStep(value: ClientInfoStepValue): ClientInfoStepErrors {
  const e: ClientInfoStepErrors = {};

  if (!value.clientCode.trim()) e.clientCode = "Klantcode is verplicht.";
  else if (!CLIENT_CODE_PATTERN.test(value.clientCode.trim().toUpperCase()))
    e.clientCode = "Klantcode bestaat uit 1-3 hoofdletters of cijfers (bijv. HOR).";

  if (!value.clientName.trim()) e.clientName = "Klantnaam is verplicht.";
  else if (value.clientName.trim().length < 2) e.clientName = "Klantnaam moet minimaal 2 tekens bevatten.";

  return e;
}

export function isClientInfoStepValid(value: ClientInfoStepValue): boolean {
  return Object.keys(validateClientInfoStep(value)).length === 0;
}

type Props = {
  value: ClientInfoStepValue;
  onChange: (value: ClientInfoStepValue) => void;
  /** Render inline field errors (set after the user tries to proceed). */
  showErrors?: boolean;
  /** Live validation report so the parent shell can gate navigation/submit. */
  onValidationChange?: (errors: ClientInfoStepErrors, isValid: boolean) => void;
};

export function ClientInfoStepForm({ value, onChange, showErrors = false, onValidationChange }: Props) {
  const errors = useMemo(() => validateClientInfoStep(value), [value]);

  const isValid = Object.keys(errors).length === 0;

  useEffect(() => {
    onValidationChange?.(errors, isValid);
  }, [errors, isValid, onValidationChange]);

  function updateField(key: keyof ClientInfoStepValue, fieldValue: string) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <section className="form-section">
      <div className="section-number" aria-label="Stap 1">01</div>
      <div className="section-content">
        <div className="section-heading">
          <h2>Klantgegevens</h2>
          <p>Basisgegevens van de nieuwe pensioenklant. Klantcode is uniek in de administratie.</p>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Klantcode<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <input
              type="text"
              value={value.clientCode}
              onChange={(e) => updateField("clientCode", e.target.value.toUpperCase())}
              placeholder="Bijv. HOR"
              required
              maxLength={3}
              aria-invalid={Boolean(errors.clientCode)}
            />
            <small style={{ color: "var(--muted)" }}>1-3 hoofdletters of cijfers. Wordt gebruikt in account-id&rsquo;s.</small>
            {showErrors && errors.clientCode && (
              <span className="field-error" role="alert">{errors.clientCode}</span>
            )}
          </label>

          <label className="field">
            <span>Klantnaam<span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span></span>
            <input
              type="text"
              value={value.clientName}
              onChange={(e) => updateField("clientName", e.target.value)}
              placeholder="Bijv. Pensioenfonds Horizon"
              required
              minLength={2}
              maxLength={100}
              aria-invalid={Boolean(errors.clientName)}
            />
            <small style={{ color: "var(--muted)" }}>Volledige naam van de pensioenklant.</small>
            {showErrors && errors.clientName && (
              <span className="field-error" role="alert">{errors.clientName}</span>
            )}
          </label>
        </div>
      </div>
    </section>
  );
}
