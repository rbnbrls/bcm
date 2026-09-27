"use client";

import { useEffect, useMemo } from "react";
import { validateCodeFormat } from "@/lib/portfolio-metadata-validation";
import { UniqueCodeField } from "@/components/unique-code-field";

/**
 * Portfolio metadata step for the client onboarding wizard (task t_4fbdd465).
 *
 * Self-contained, data-driven step form collecting the optional parent-account
 * metadata of the new portfolio:
 *  - `parentAccountCode`     — optional; when filled, a new parent account is
 *    created through the change request (staged via stagePortfolioMetadataChange).
 *  - `msaParentAccountCode`  — optional MSA code for that parent account.
 *
 * Follows the exact contract of the other wizard steps:
 *  - `value` / `onChange` — controlled value
 *  - `onValidationChange` — callback receiving the current errors + validity so
 *    the parent wizard shell can gate navigation / submit
 *  - `showErrors` — when true, inline field-level errors render
 *
 * A pure `validateParentAccountMetadataStep(value)` helper is exported so the
 * parent can compute errors/validity without rendering the component.
 *
 * The parent-account code uses {@link UniqueCodeField} (kind `parent_account`)
 * for live uniqueness feedback against /api/validate-code-uniqueness; the
 * server action remains the authoritative gate (stagePortfolioMetadataChange
 * rejects duplicates with a Dutch issue).
 *
 * Intentionally contains no navigation and no wizard-level state — the shell
 * (task t_60c3573f) owns step switching and staged data.
 */

export type ParentAccountMetadataStepValue = {
  parentAccountCode: string;
  msaParentAccountCode: string;
};

export type ParentAccountMetadataStepErrors = Partial<
  Record<keyof ParentAccountMetadataStepValue, string>
>;

/**
 * Pure format validation for the parent-account metadata step.
 *
 * Both fields are optional; when filled they must match the
 * client_config.parent_account CHECK pattern (1-16 uppercase letters,
 * digits and underscores, no leading/trailing underscore sequences).
 */
export function validateParentAccountMetadataStep(
  value: ParentAccountMetadataStepValue,
): ParentAccountMetadataStepErrors {
  const e: ParentAccountMetadataStepErrors = {};

  const parentCode = value.parentAccountCode.trim().toUpperCase();
  if (parentCode) {
    const parentError = validateCodeFormat(parentCode, "parent_account");
    if (parentError) e.parentAccountCode = parentError;
  }

  const msaCode = value.msaParentAccountCode.trim().toUpperCase();
  if (msaCode) {
    const msaError = validateCodeFormat(msaCode, "parent_account");
    if (msaError) e.msaParentAccountCode = msaError;
  }

  return e;
}

export function isParentAccountMetadataStepValid(
  value: ParentAccountMetadataStepValue,
): boolean {
  return Object.keys(validateParentAccountMetadataStep(value)).length === 0;
}

type Props = {
  value: ParentAccountMetadataStepValue;
  onChange: (value: ParentAccountMetadataStepValue) => void;
  /** Render inline field errors (set after the user tries to proceed). */
  showErrors?: boolean;
  /** Live validation report so the parent shell can gate navigation/submit. */
  onValidationChange?: (
    errors: ParentAccountMetadataStepErrors,
    isValid: boolean,
  ) => void;
};

export function ParentAccountMetadataStep({
  value,
  onChange,
  showErrors = false,
  onValidationChange,
}: Props) {
  const errors = useMemo(() => validateParentAccountMetadataStep(value), [value]);

  const isValid = Object.keys(errors).length === 0;

  useEffect(() => {
    onValidationChange?.(errors, isValid);
  }, [errors, isValid, onValidationChange]);

  function updateField(key: keyof ParentAccountMetadataStepValue, fieldValue: string) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <section className="form-section">
      <div className="section-number" aria-label="Stap 3">03</div>
      <div className="section-content">
        <div className="section-heading">
          <h2>Portfolio metadata (ouderaccount)</h2>
          <p>
            Optioneel: koppel de nieuwe portefeuille aan een ouderaccount. Een nieuwe
            ouderaccount wordt via de change request aangemaakt.
          </p>
        </div>

        <div className="field-row">
          <UniqueCodeField
            kind="parent_account"
            label="Ouderaccount code"
            value={value.parentAccountCode}
            onChange={(v) => updateField("parentAccountCode", v)}
            placeholder="Bijv. ADP_MAIN"
            hint="Laat leeg als de portefeuille geen ouderaccount nodig heeft."
            error={showErrors ? errors.parentAccountCode ?? null : null}
          />

          <label className="field">
            <span>MSA ouderaccount code</span>
            <input
              type="text"
              value={value.msaParentAccountCode}
              onChange={(e) => updateField("msaParentAccountCode", e.target.value.toUpperCase())}
              placeholder="Bijv. ADP_MSA_01"
              maxLength={16}
              aria-invalid={Boolean(errors.msaParentAccountCode)}
            />
            <small style={{ color: "var(--muted)" }}>Optionele MSA-code van de ouderaccount.</small>
            {showErrors && errors.msaParentAccountCode && (
              <span className="field-error" role="alert">{errors.msaParentAccountCode}</span>
            )}
          </label>
        </div>
      </div>
    </section>
  );
}
