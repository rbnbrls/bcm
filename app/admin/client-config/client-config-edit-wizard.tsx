"use client";

/**
 * ClientConfigEditWizard — the update wizard opened by the per-row edit
 * affordance in the /admin/client-config table.
 *
 * t_bad2c8ad (edit affordance) delivered this component as the wizard HOST:
 * it receives the selected row's stable identity (primaryAccountId — the
 * PK of client_config.portfolio_configuration) as part of the full `row`
 * object.
 *
 * t_cb7f89f2 (this task) turns the host into a PREFILLED UPDATE WIZARD:
 * every mutable field (portfolio_code, asset_class_code,
 * sub_asset_class_code, manager_code, benchmark_code, npc_classification_id,
 * long_name, short_name, effective_from) renders as an editable input seeded
 * with the row's current values as initial state (IST). The operator may
 * change any field; 'Submit Change Request' stages a governed UPDATE change
 * request via updateClientConfigRowAction (never a direct write).
 *
 * The open/close contract (row + onClose props, .config-edit-wizard shell)
 * is unchanged from the host version.
 */
import { useActionState } from "react";
import {
  updateClientConfigRowAction,
  type UpdateClientConfigRowState,
} from "./actions";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

type Props = {
  /** The full row the user chose to edit. `row.primaryAccountId` is the stable identity. */
  row: ClientConfigPortfolioConfigurationRow;
  /** Close the wizard without submitting. */
  onClose: () => void;
};

const initialState: UpdateClientConfigRowState = {};

/**
 * The mutable fields the update wizard must expose (issue #274). `key` is the
 * row property used to seed the initial state (IST); `name` is the form field
 * name the server action reads. effectiveFrom submits as `effectiveDate`
 * (the change request's effective date becomes the row's new effective_from).
 */
const MUTABLE_FIELDS: {
  key: keyof ClientConfigPortfolioConfigurationRow;
  name: string;
  label: string;
  type: "text" | "number" | "date";
}[] = [
  {
    key: "portfolioCode",
    name: "portfolioCode",
    label: "Portefeuille",
    type: "text",
  },
  {
    key: "assetClassCode",
    name: "assetClassCode",
    label: "Asset class",
    type: "text",
  },
  {
    key: "subAssetClassCode",
    name: "subAssetClassCode",
    label: "Sub asset class",
    type: "text",
  },
  { key: "managerCode", name: "managerCode", label: "Manager", type: "text" },
  {
    key: "benchmarkCode",
    name: "benchmarkCode",
    label: "Benchmark",
    type: "text",
  },
  {
    key: "npcClassificationId",
    name: "npcClassificationId",
    label: "NPC classificatie",
    type: "number",
  },
  { key: "longName", name: "longName", label: "Lange naam", type: "text" },
  { key: "shortName", name: "shortName", label: "Korte naam", type: "text" },
  {
    key: "effectiveFrom",
    name: "effectiveDate",
    label: "Geldig vanaf",
    type: "date",
  },
];

export default function ClientConfigEditWizard({ row, onClose }: Props) {
  const [state, formAction, pending] = useActionState(
    updateClientConfigRowAction,
    initialState,
  );

  return (
    <section
      className="config-edit-wizard"
      aria-label={`Wijzig client config rij ${row.primaryAccountId}`}
    >
      <header className="config-edit-wizard__header">
        <div>
          <p className="eyebrow">CLIENT CONFIG</p>
          <h2>Wijzig rij</h2>
          <p className="config-edit-wizard__identity">
            Primary account <b>{row.primaryAccountId}</b> —{" "}
            {row.clientName ?? row.clientCode}
          </p>
        </div>
        <button
          type="button"
          className="config-edit-wizard__close"
          onClick={onClose}
          aria-label="Sluit wijzig wizard"
        >
          Sluiten
        </button>
      </header>

      <form className="config-edit-wizard__form" action={formAction}>
        <input
          type="hidden"
          name="primaryAccountId"
          value={row.primaryAccountId}
        />

        {/* Editable fields, seeded from the row's current values (IST) */}
        <div className="config-edit-wizard__fields">
          {MUTABLE_FIELDS.map((field) => {
            const fieldError = state?.fieldErrors?.[field.name];
            return (
              <label
                className="config-edit-wizard__field"
                key={field.key}
                data-has-error={fieldError ? "true" : undefined}
              >
                <span className="config-edit-wizard__label">{field.label}</span>
                <input
                  type={field.type}
                  name={field.name}
                  defaultValue={String(row[field.key] ?? "")}
                  data-testid={`ist-field-${field.key}`}
                  aria-label={field.label}
                  aria-invalid={fieldError ? true : undefined}
                  disabled={pending}
                />
                {fieldError && (
                  <span
                    className="field-error"
                    role="alert"
                    data-testid={`field-error-${field.name}`}
                  >
                    {fieldError}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="config-edit-wizard__meta">
          <label className="field">
            <span>Aanvrager</span>
            <input
              name="requestedBy"
              required
              placeholder="Naam van de aanvrager"
              defaultValue="Ruben Verboon"
              aria-label="Aanvrager"
              disabled={pending}
            />
          </label>

          <label className="field">
            <span>Reden van wijziging</span>
            <textarea
              name="rationale"
              required
              minLength={10}
              placeholder="Licht de reden van de wijziging toe (minimaal 10 tekens)"
              rows={4}
              disabled={pending}
            />
          </label>
        </div>

        {state && !state.success && (state.error || state.issues) && (() => {
          // Field-keyed errors render inline next to their input; the general
          // block only shows remaining (non-field) problems.
          const inlineMessages = new Set(Object.values(state.fieldErrors ?? {}));
          const generalIssues = (state.issues ?? (state.error ? [state.error] : [])).filter(
            (issue) => !inlineMessages.has(issue),
          );
          if (generalIssues.length === 0) return null;
          return (
            <div className="form-errors" role="alert">
              <b>Er is een probleem:</b>
              <ul>
                {generalIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          );
        })()}

        <div className="config-edit-wizard__actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={pending}
          >
            Annuleren
          </button>
          <button
            type="submit"
            className="button button-primary"
            data-testid="submit-change-request"
            disabled={pending}
          >
            {pending ? "Verzenden…" : "Verstuur wijzigingsverzoek"}
          </button>
        </div>
      </form>

      <p className="config-edit-wizard__note">
        Wijzigingen worden via een change request doorgevoerd — er wordt niets
        direct aangepast.
      </p>
    </section>
  );
}
