"use client";

/**
 * ClientConfigEditWizard — the update wizard opened by the per-row edit
 * affordance in the /admin/client-config table.
 *
 * t_bad2c8ad (edit affordance) delivers this component as the wizard HOST:
 * it receives the selected row's stable identity (primaryAccountId — the
 * PK of client_config.portfolio_configuration) as part of the full `row`
 * object and renders the wizard shell with the row's current values as a
 * read-only IST preview.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NEXT TASK (t_cb7f89f2 — "Build prefilled update wizard with IST state"):
 * Replace the read-only IST preview below with editable inputs for every
 * mutable field (portfolio_code, asset_class_code, sub_asset_class_code,
 * manager_code, benchmark_code, npc_classification_id, long_name,
 * short_name, effective_from), seeded from `row` as initial state, plus a
 * 'Submit Change Request' button wired to the staging server action. The
 * open/close contract (row + onClose props, .config-edit-wizard shell)
 * stays as-is.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

type Props = {
  /** The full row the user chose to edit. `row.primaryAccountId` is the stable identity. */
  row: ClientConfigPortfolioConfigurationRow;
  /** Close the wizard without submitting. */
  onClose: () => void;
};

/** The mutable fields the update wizard must expose (issue #274). */
const MUTABLE_FIELD_LABELS: { key: keyof ClientConfigPortfolioConfigurationRow; label: string }[] = [
  { key: "portfolioCode", label: "Portefeuille" },
  { key: "assetClassCode", label: "Asset class" },
  { key: "subAssetClassCode", label: "Sub asset class" },
  { key: "managerCode", label: "Manager" },
  { key: "benchmarkCode", label: "Benchmark" },
  { key: "npcClassificationId", label: "NPC classificatie" },
  { key: "longName", label: "Lange naam" },
  { key: "shortName", label: "Korte naam" },
  { key: "effectiveFrom", label: "Geldig vanaf" },
];

export default function ClientConfigEditWizard({ row, onClose }: Props) {
  return (
    <section className="config-edit-wizard" aria-label={`Wijzig client config rij ${row.primaryAccountId}`}>
      <header className="config-edit-wizard__header">
        <div>
          <p className="eyebrow">CLIENT CONFIG</p>
          <h2>Wijzig rij</h2>
          <p className="config-edit-wizard__identity">
            Primary account <b>{row.primaryAccountId}</b> — {row.clientName ?? row.clientCode}
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

      {/* IST preview — t_cb7f89f2 replaces this with editable fields */}
      <div className="config-edit-wizard__fields">
        {MUTABLE_FIELD_LABELS.map((field) => (
          <div className="config-edit-wizard__field" key={field.key}>
            <span className="config-edit-wizard__label">{field.label}</span>
            <span className="config-edit-wizard__value" data-testid={`ist-field-${field.key}`}>
              {String(row[field.key] ?? "—")}
            </span>
          </div>
        ))}
      </div>

      <p className="config-edit-wizard__note">
        Wijzigingen worden via een change request doorgevoerd — er wordt niets direct aangepast.
      </p>
    </section>
  );
}
