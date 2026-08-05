"use client";

import { useActionState, useState } from "react";
import { approveChange, rejectChange } from "@/app/actions/approval-actions";
import type { ApprovalState } from "@/app/actions/approval-actions";
import { getActiveProfileFromCookie } from "@/lib/active-profile-client";
import { roleHasPermission } from "@/lib/rbac";

export function ApprovalPanel({ changeRequestId }: { changeRequestId: string }) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [activeProfile] = useState(() => getActiveProfileFromCookie());
  const approverName = activeProfile.fullName;
  const canApprove = roleHasPermission(activeProfile.id, "changes:approve");
  const [approveState, approveAction, approvePending] = useActionState<ApprovalState, FormData>(
    approveChange,
    { message: undefined }
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ApprovalState, FormData>(
    rejectChange,
    { message: undefined }
  );

  const submitApprove = async (formData: FormData) => {
    formData.set("changeRequestId", changeRequestId);
    approveAction(formData);
  };

  const submitReject = async (formData: FormData) => {
    formData.set("changeRequestId", changeRequestId);
    rejectAction(formData);
  };

  return (
    <div className="approval-panel">
      <div className={canApprove ? "role-hint role-hint--ok" : "role-hint"} role="note">
        <b>Actief profiel: {activeProfile.label}</b>
        <span>
          {canApprove
            ? `Besluiten worden vastgelegd op naam van ${approverName}.`
            : "Alleen het profiel Account manager kan de beslissing definitief indienen."}
        </span>
      </div>

      {!mode && (
        <div className="approval-actions">
          <button
            className="button button-primary"
            onClick={() => setMode("approve")}
            type="button"
          >
            Change accorderen
          </button>
          <button
            className="button button-danger"
            onClick={() => setMode("reject")}
            type="button"
          >
            Change afwijzen
          </button>
        </div>
      )}

      {mode === "approve" && (
        <form action={submitApprove} className="approval-form">
          <div className="field">
            <span>Naam accordeur</span>
            <input
              type="text"
              name="approver"
              aria-label="Naam accordeur"
              required
              minLength={2}
              defaultValue={approverName}
              placeholder="Vul uw volledige naam in"
            />
          </div>
          <div className="field">
            <span>Opmerkingen (optioneel)</span>
            <textarea
              name="remarks"
              rows={2}
              placeholder="Eventuele toelichting bij goedkeuring"
            />
          </div>
          {approveState?.message && approveState.success === false && (
            <div className="form-errors" role="alert">
              <b>Fout bij goedkeuren</b>
              <p>{approveState.message}</p>
            </div>
          )}
          {approveState?.success && (
            <div className="approval-success" role="alert">
              <b>Change goedgekeurd ✓</b>
              <p>De change kan nu worden geëxporteerd en gedeeld met stakeholders.</p>
            </div>
          )}
          <div className="approval-form-actions">
            <button type="submit" className="button button-primary" disabled={!canApprove || approvePending || approveState?.success === true}>
              {approvePending ? "Verwerken..." : "Bevestig goedkeuring"}
            </button>
            <button type="button" className="button button-ghost" onClick={() => setMode(null)}>
              Annuleren
            </button>
          </div>
        </form>
      )}

      {mode === "reject" && (
        <form action={submitReject} className="approval-form">
          <div className="field">
            <span>Naam afwijzer</span>
            <input
              type="text"
              name="approver"
              aria-label="Naam afwijzer"
              required
              minLength={2}
              defaultValue={approverName}
              placeholder="Vul uw volledige naam in"
            />
          </div>
          <div className="field">
            <span>Reden van afwijzing *</span>
            <textarea
              name="remarks"
              rows={3}
              required
              minLength={10}
              placeholder="Geef een duidelijke toelichting waarom deze change wordt afgewezen"
            />
          </div>
          {rejectState?.message && rejectState.success === false && (
            <div className="form-errors" role="alert">
              <b>Fout bij afwijzen</b>
              <p>{rejectState.message}</p>
            </div>
          )}
          {rejectState?.success && (
            <div className="approval-error" role="alert">
              <b>Change afgewezen ✗</b>
              <p>De change is afgewezen en teruggestuurd voor aanpassing.</p>
            </div>
          )}
          <div className="approval-form-actions">
            <button type="submit" className="button button-danger" disabled={!canApprove || rejectPending || rejectState?.success === true}>
              {rejectPending ? "Verwerken..." : "Bevestig afwijzing"}
            </button>
            <button type="button" className="button button-ghost" onClick={() => setMode(null)}>
              Annuleren
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
