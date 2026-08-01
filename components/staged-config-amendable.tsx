"use client";

/**
 * AmendableStagedConfig — wraps StagedConfigDiff with inline editing
 * for submitted/accepted change requests and delete functionality for
 * draft/submitted/accepted changes.
 *
 * Shows:
 *  - "Verwijder" (delete) button for draft, submitted, and accepted statuses
 *  - "Wijzig" (edit) button for submitted and accepted statuses
 *  - Clicking edit transforms SOLL values into editable input fields
 *  - Deleting prompts a confirmation before removing the staged row
 */
import { useActionState, useState, useCallback, useEffect, useRef } from "react";
import { StagedConfigDiff } from "@/components/staged-config-diff";
import {
  amendPortfolioConfig,
  deletePortfolioConfig,
  type AmendConfigState,
  type DeleteConfigState,
} from "@/app/changes/actions";

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
  applyStatus: string | null;
  applyError: string | null;
};

/** Which statuses allow editing (inline amend form). */
const EDITABLE_STATUSES = new Set(["submitted", "accepted"]);
/** Which statuses allow deleting a staged row. */
const DELETE_ALLOWED_STATUSES = new Set(["draft", "submitted", "accepted"]);

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
const initialDeleteState: DeleteConfigState = { success: false, message: "" };

// ── Component ────────────────────────────────────────────────────────────

export function AmendableStagedConfig({ rows, changeRequestId, changeStatus }: Props) {
  const [amendState, formAction, isAmendPending] = useActionState(amendPortfolioConfig, initialAmendState);
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(deletePortfolioConfig, initialDeleteState);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isEditable = EDITABLE_STATUSES.has(changeStatus);
  const isDeletable = DELETE_ALLOWED_STATUSES.has(changeStatus);

  // After a successful save, exit edit mode — track previous pending state
  const prevAmendPending = useRef(isAmendPending);
  useEffect(() => {
    if (prevAmendPending.current && !isAmendPending && amendState.success) {
      setEditingRowId(null);
      setEditValues({});
    }
    prevAmendPending.current = isAmendPending;
    // Only re-run when isAmendPending toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAmendPending]);

  // After a successful delete, clear confirmation state
  const prevDeletePending = useRef(isDeletePending);
  useEffect(() => {
    if (prevDeletePending.current && !isDeletePending && deleteState.success) {
      setDeleteConfirmId(null);
    }
    prevDeletePending.current = isDeletePending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeletePending]);

  const startEditing = useCallback(
    (row: StagedRow) => {
      const values: Record<string, string> = {};
      for (const field of AMENDABLE_FIELDS) {
        values[field.key] = field.getValue(row);
      }
      setEditValues(values);
      setEditingRowId(row.id);
      setDeleteConfirmId(null); // Close any pending delete confirmation
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

  const requestDelete = useCallback((rowId: number) => {
    setDeleteConfirmId(rowId);
    setEditingRowId(null); // Close any pending edit form
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirmId(null);
  }, []);

  if (rows.length === 0) return null;

  if (!isDeletable && !isEditable) {
    return <StagedConfigDiff rows={rows} />;
  }

  return (
    <div>
      <StagedConfigDiff
        rows={rows}
        renderRowActions={(row: StagedRow) => (
          <>
            {/* Edit button for amending — shown for submitted/accepted */}
            {isEditable && editingRowId !== row.id && (
              <button
                type="button"
                className="staged-edit-btn"
                onClick={() => startEditing(row)}
                aria-label={`Wijzig staged configuratie rij ${row.id}`}
              >
                Wijzig
              </button>
            )}

            {/* Delete button / confirmation — shown for draft/submitted/accepted */}
            {isDeletable && deleteConfirmId !== row.id && editingRowId !== row.id && (
              <button
                type="button"
                className="staged-delete-btn"
                onClick={() => requestDelete(row.id)}
                aria-label={`Verwijder staged configuratie rij ${row.id}`}
              >
                Verwijder
              </button>
            )}

            {/* Delete confirmation prompt */}
            {isDeletable && deleteConfirmId === row.id && (
              <span className="staged-delete-confirm">
                <form
                  action={deleteFormAction}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <input type="hidden" name="stagedRowId" value={row.id} />
                  <input type="hidden" name="changeRequestId" value={changeRequestId} />
                  <button
                    type="submit"
                    className="staged-delete-confirm-btn"
                    disabled={isDeletePending}
                    aria-label={`Bevestig verwijderen van rij ${row.id}`}
                  >
                    {isDeletePending ? "Bezig..." : "Weet je het zeker?"}
                  </button>
                  <button
                    type="button"
                    className="staged-delete-cancel-btn"
                    onClick={cancelDelete}
                    disabled={isDeletePending}
                    aria-label="Annuleer verwijderen"
                  >
                    Annuleren
                  </button>
                </form>
              </span>
            )}
          </>
        )}
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
              disabled={isAmendPending}
            >
              {isAmendPending ? "Opslaan..." : "Opslaan"}
            </button>
            <button
              type="button"
              className="button button-secondary staged-cancel-btn"
              onClick={cancelEditing}
              disabled={isAmendPending}
            >
              Annuleren
            </button>
          </div>

          {amendState.message && (
            <p className={`staged-edit-feedback ${amendState.success ? "staged-edit-success" : "staged-edit-error"}`}>
              {amendState.message}
            </p>
          )}
        </form>
      )}

      {/* Delete feedback message */}
      {deleteState.message && (
        <p className={`staged-edit-feedback ${deleteState.success ? "staged-edit-success" : "staged-edit-error"}`}>
          {deleteState.message}
        </p>
      )}
    </div>
  );
}
