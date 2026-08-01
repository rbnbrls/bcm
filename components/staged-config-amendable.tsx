"use client";

/**
 * AmendableStagedConfig — wraps StagedConfigDiff with inline editing
 * for submitted/accepted change requests.
 *
 * Shows an "Edit" button per staged row. Clicking it transforms SOLL
 * values into editable input fields with Save/Cancel controls.
 * Uses the amendPortfolioConfig server action to persist changes.
 */
import { useActionState, useState, useCallback, useEffect, useRef } from "react";
import { StagedConfigDiff } from "@/components/staged-config-diff";
import { amendPortfolioConfig, type AmendConfigState } from "@/app/changes/actions";

type StagedRow = {
  id: number;
  changeRequestId: string;
  actionType: string;
  clientCode: string;
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

/** Which statuses allow editing. */
const EDITABLE_STATUSES = new Set(["submitted", "accepted"]);

type Props = {
  rows: StagedRow[];
  changeRequestId: string;
  changeStatus: string;
};

// ── Field metadata for inline editing ────────────────────────────────────

type FieldDef = {
  key: string;
  label: string;
  /** Extract the current SOLL value from a row. */
  getValue: (row: StagedRow) => string;
};

const AMENDABLE_FIELDS: FieldDef[] = [
  { key: "portfolio_code", label: "Portfolio", getValue: (r) => r.portfolioCode },
  { key: "client_code", label: "Client", getValue: (r) => r.clientCode },
  { key: "asset_class_code", label: "Asset class", getValue: (r) => r.assetClassCode },
  { key: "sub_asset_class_code", label: "Sub asset class", getValue: (r) => r.subAssetClassCode || "" },
  { key: "manager_code", label: "Manager", getValue: (r) => r.managerCode },
  { key: "benchmark_code", label: "Benchmark", getValue: (r) => r.benchmarkCode || "" },
  { key: "npc_classification_id", label: "NPC classificatie", getValue: (r) => String(r.npcClassificationId) },
  { key: "long_name", label: "Lange naam", getValue: (r) => r.longName },
  { key: "short_name", label: "Korte naam", getValue: (r) => r.shortName },
  { key: "effective_from", label: "Ingangsdatum", getValue: (r) => r.effectiveFrom },
  { key: "effective_until", label: "Einddatum", getValue: (r) => r.effectiveUntil ?? "" },
];

const initialAmendState: AmendConfigState = { success: false, message: "" };

// ── Component ────────────────────────────────────────────────────────────

export function AmendableStagedConfig({ rows, changeRequestId, changeStatus }: Props) {
  const [state, formAction, isPending] = useActionState(amendPortfolioConfig, initialAmendState);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const isEditable = EDITABLE_STATUSES.has(changeStatus);

  // After a successful save, exit edit mode
  useEffect(() => {
    if (state.success && editingRowId !== null) {
      setEditingRowId(null);
      setEditValues({});
    }
  }, [state.success, state.message]);

  const startEditing = useCallback(
    (row: StagedRow) => {
      const values: Record<string, string> = {};
      for (const field of AMENDABLE_FIELDS) {
        values[field.key] = field.getValue(row);
      }
      setEditValues(values);
      setEditingRowId(row.id);
    },
    [],
  );

  const cancelEditing = useCallback(() => {
    setEditingRowId(null);
    setEditValues({});
  }, []);

  const handleFieldChange = useCallback((fieldKey: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [fieldKey]: value }));
  }, []);

  if (!isEditable || rows.length === 0) {
    return <StagedConfigDiff rows={rows} />;
  }

  return (
    <div>
      <StagedConfigDiff
        rows={rows}
        renderRowActions={(row: StagedRow) =>
          editingRowId === row.id ? null : (
            <button
              type="button"
              className="staged-edit-btn"
              onClick={() => startEditing(row)}
              aria-label={`Wijzig staged configuratie rij ${row.id}`}
            >
              Wijzig
            </button>
          )
        }
      />

      {/* Inline edit form for the selected row */}
      {editingRowId !== null && (
        <form ref={formRef} action={formAction} className="staged-edit-form">
          <input type="hidden" name="stagedRowId" value={editingRowId} />
          <input type="hidden" name="changeRequestId" value={changeRequestId} />

          <div className="staged-edit-header">
            <span className="staged-edit-title">Wijzig waarden</span>
            <span className="staged-edit-row-id">Rij #{editingRowId}</span>
          </div>

          <div className="staged-edit-fields">
            {AMENDABLE_FIELDS.map((field) => (
              <div className="staged-edit-field-row" key={field.key}>
                <label className="staged-edit-label" htmlFor={`edit-${field.key}`}>
                  {field.label}
                </label>
                <input
                  id={`edit-${field.key}`}
                  className="staged-edit-input"
                  name={`field_${field.key}`}
                  type="text"
                  value={editValues[field.key] ?? ""}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="staged-edit-actions">
            <button
              type="submit"
              className="button button-primary staged-save-btn"
              disabled={isPending}
            >
              {isPending ? "Opslaan..." : "Opslaan"}
            </button>
            <button
              type="button"
              className="button button-secondary staged-cancel-btn"
              onClick={cancelEditing}
              disabled={isPending}
            >
              Annuleren
            </button>
          </div>

          {state.message && (
            <p className={`staged-edit-feedback ${state.success ? "staged-edit-success" : "staged-edit-error"}`}>
              {state.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
