"use client";

import { useEffect } from "react";
import { useCodeUniqueness, type CodeKind, type UniquenessStatus } from "@/lib/use-code-uniqueness";

interface UniqueCodeFieldProps {
  kind: CodeKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  /** Format/required error from the parent form (rendered as .field-error). */
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** Called whenever the uniqueness status changes so the parent form can gate the submit button. */
  onStatusChange?: (status: UniquenessStatus) => void;
}

/**
 * A text input for a client or portfolio code with built-in uniqueness
 * validation against the backend.
 *
 * Shows an inline error when the code is already taken (duplicate codes show
 * validation errors) and a success hint when the code is free (unique codes
 * pass). Used by the client onboarding wizard for the client_code and
 * portfolio_code fields.
 */
export function UniqueCodeField({
  kind,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
  onStatusChange,
}: UniqueCodeFieldProps) {
  const { status, message } = useCodeUniqueness(kind, value);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const invalid = Boolean(error) || status === "taken";

  return (
    <label className="field">
      <span>
        {label}
        {required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${kind}-code-error` : undefined}
        className={invalid ? "input-invalid" : undefined}
      />
      {hint && <small style={{ color: "var(--muted)" }}>{hint}</small>}
      {error && (
        <span className="field-error" role="alert" id={`${kind}-code-error`}>
          {error}
        </span>
      )}
      {!error && status === "taken" && (
        <small id={`${kind}-code-error`} role="alert" style={{ color: "var(--danger)" }}>
          {message ?? "Deze code is al in gebruik."}
        </small>
      )}
      {status === "checking" && (
        <small style={{ color: "var(--muted)" }} aria-live="polite">
          Controleren…
        </small>
      )}
      {status === "available" && (
        <small style={{ color: "var(--accent)" }} aria-live="polite">
          Code is beschikbaar.
        </small>
      )}
    </label>
  );
}
