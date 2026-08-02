"use client";

/**
 * RetirePortfolioModal — governed retirement of an active portfolio
 * configuration row.
 *
 * Opens from the row-level "Beëindigen" button in the admin client-config
 * table. Collects requester, rationale and effective retirement date and
 * stages a DELETE change request via deletePortfolioConfigurationAction.
 * No direct database mutation happens here — the change goes through the
 * governed change-management workflow.
 */
import { useActionState, useEffect, useRef } from "react";
import {
  deletePortfolioConfigurationAction,
  type DeletePortfolioConfigurationState,
} from "@/app/admin/client-config/actions";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";
import { getTodayDateString } from "@/lib/change-form-utils";

const initialState: DeletePortfolioConfigurationState = {};

type Props = {
  row: ClientConfigPortfolioConfigurationRow;
  onClose: () => void;
};

export function RetirePortfolioModal({ row, onClose }: Props) {
  const [state, formAction, pending] = useActionState(
    deletePortfolioConfigurationAction,
    initialState,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const today = getTodayDateString();

  // Focus the close button on open (first focusable element in the modal)
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Close on Escape key
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <>
      <div className="retire-backdrop" onClick={onClose} />

      <div
        className="retire-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Portfolio configuratie ${row.primaryAccountId} beëindigen`}
        onKeyDown={handleKeyDown}
      >
        <div className="retire-modal-header">
          <h3>Portefeuille beëindigen</h3>
          <button
            ref={closeButtonRef}
            className="retire-close"
            onClick={onClose}
            aria-label="Sluiten"
            type="button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="retire-target">
          <b>{row.clientName ?? row.clientCode}</b>
          <span>
            {row.portfolioCode} · {row.primaryAccountId} ·{" "}
            {row.assetClassName ?? row.assetClassCode}
          </span>
          <small>
            Geldig vanaf {row.effectiveFrom}. De rij wordt na verwerking
            gedeactiveerd in de actieve configuratie; de historie blijft
            bewaard.
          </small>
        </div>

        <form className="retire-form" action={formAction}>
          <input type="hidden" name="primaryAccountId" value={row.primaryAccountId} />

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
            <span>Reden van beëindiging</span>
            <textarea
              name="rationale"
              required
              minLength={10}
              placeholder="Licht de reden van de beëindiging toe (minimaal 10 tekens)"
              rows={4}
              disabled={pending}
            />
          </label>

          <label className="field">
            <span>Ingangsdatum beëindiging</span>
            <input
              name="effectiveDate"
              type="date"
              required
              min={today}
              aria-label="Ingangsdatum beëindiging"
              disabled={pending}
            />
          </label>

          {state && !state.success && (state.error || state.issues) && (
            <div className="form-errors" role="alert">
              <b>Er is een probleem:</b>
              <ul>
                {(state.issues ?? (state.error ? [state.error] : [])).map(
                  (issue, i) => (
                    <li key={i}>{issue}</li>
                  ),
                )}
              </ul>
            </div>
          )}

          <div className="retire-submit-row">
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
              className="button button-danger"
              disabled={pending}
            >
              {pending ? "Verzenden…" : "Beëindig via change verzoek"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
