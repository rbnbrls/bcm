"use client";

import { useActionState } from "react";
import { updateStatus, sendNotifications } from "@/app/changes/actions";
import { CHANGE_STATUS_LABELS, CHANGE_STATUS_PREV, type ChangeStatus } from "@/lib/types";
import { getStatusFlowForChangeType } from "@/lib/change-type-registry";
import { ProviderDetailFeedbackForm } from "./provider-detail-feedback-form";

const STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  draft: { bg: "#eef1ed", dot: "#5d6864", text: "#5d6864" },
  submitted: { bg: "#dff4e9", dot: "#0f6d55", text: "#0a513f" },
  accepted: { bg: "#e3eaf5", dot: "#28497c", text: "#1a3460" },
  in_progress: { bg: "#fff3d6", dot: "#c8950c", text: "#926d0a" },
  processed: { bg: "#e8f5e9", dot: "#2e7d32", text: "#1b5e20" },
  validated: { bg: "#dff4e9", dot: "#0a513f", text: "#0a513f" },
};

type Props = {
  changeId: string;
  currentStatus: string;
  createdAt: string;
  processedAt: string | null;
  processedBy: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  notificationSent: boolean;
  changeType?: string;
};

export function ChangeStatusSection({
  changeId,
  currentStatus,
  processedAt,
  processedBy,
  validatedAt,
  validatedBy,
  notificationSent,
  changeType,
}: Props) {
  const status = currentStatus as ChangeStatus;
  const nextStatus = getStatusFlowForChangeType(changeType)[status];
  const prevStatus = CHANGE_STATUS_PREV[status];
  const [statusState, statusAction, statusPending] = useActionState(updateStatus, { success: false, message: "" });
  const [notifState, notifAction, notifPending] = useActionState(sendNotifications, { success: false, message: "" });

  return (
    <section className="admin-section" style={{
      marginTop: 24, background: "#fbfcfa", border: "1px solid var(--line)",
      borderRadius: 12, padding: 24,
    }}>
      <p className="eyebrow">ADMINISTRATIE</p>
      <h2 style={{ margin: "0 0 16px", fontSize: 18, letterSpacing: "-.03em" }}>Uitvoering & terugkoppeling</h2>

      {/* Provider feedback form — shown prominently when in_progress */}
      {status === "in_progress" && (
        <div
          style={{
            background: "#fff3d6",
            border: "1px solid #c8950c",
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 750,
              margin: "0 0 4px",
              color: "#926d0a",
            }}
          >
            Service provider terugkoppeling
          </p>
          <p style={{ fontSize: 12, color: "#926d0a", margin: "0 0 12px" }}>
            Deze change is klaar om te worden verwerkt. Geef aan op welke datum
            de verwerking heeft plaatsgevonden. De IST-configuratie wordt
            automatisch bijgewerkt.
          </p>
          <ProviderDetailFeedbackForm changeId={changeId} />
        </div>
      )}

      {/* Status actions */}
      <div className="admin-status-row" style={{
        display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16,
      }}>
        {nextStatus && nextStatus !== "validated" && (
          <form action={statusAction}>
            <input type="hidden" name="id" value={changeId} />
            <input type="hidden" name="status" value={nextStatus} />
            <button
              type="submit"
              disabled={statusPending}
              className="button button-primary"
              style={{ fontSize: 13 }}
            >
              {statusPending ? "Bezig…" : `Markeer als: ${CHANGE_STATUS_LABELS[nextStatus]}`}
            </button>
          </form>
        )}

        {nextStatus === "validated" && (
          <form action={statusAction}>
            <input type="hidden" name="id" value={changeId} />
            <input type="hidden" name="status" value="validated" />
            <button
              type="submit"
              disabled={statusPending}
              className="button button-primary"
              style={{ fontSize: 13, background: "var(--accent-deep)" }}
            >
              {statusPending ? "Bezig…" : "Valideren & afronden ✓"}
            </button>
          </form>
        )}

        {/* Notification trigger */}
        {!notificationSent && (status === "submitted" || status === "accepted") && (
          <form action={notifAction}>
            <input type="hidden" name="id" value={changeId} />
            <button
              type="submit"
              disabled={notifPending}
              className="button button-secondary"
              style={{ fontSize: 13 }}
            >
              {notifPending ? "Verzenden…" : "Notificaties versturen"}
            </button>
          </form>
        )}

        {prevStatus && (
          <form action={statusAction}>
            <input type="hidden" name="id" value={changeId} />
            <input type="hidden" name="status" value={prevStatus} />
            <button
              type="submit"
              disabled={statusPending}
              className="button button-ghost"
              style={{ fontSize: 13, color: "var(--muted)" }}
            >
              ← Terug naar {CHANGE_STATUS_LABELS[prevStatus]}
            </button>
          </form>
        )}
      </div>

      {/* Status feedback messages */}
      {statusState.message && (
        <div className={`form-errors ${statusState.success ? "form-success" : ""}`} role="alert" style={{
          ...(statusState.success ? { background: "var(--mint)", borderColor: "var(--accent)", color: "var(--accent-deep)" } : {}),
        }}>
          <p>{statusState.message}</p>
        </div>
      )}

      {notifState.message && (
        <div className={`form-errors ${notifState.success ? "form-success" : ""}`} role="alert" style={{
          marginTop: 8,
          ...(notifState.success ? { background: "var(--mint)", borderColor: "var(--accent)", color: "var(--accent-deep)" } : {}),
        }}>
          <p style={{ whiteSpace: "pre-line" }}>{notifState.message}</p>
        </div>
      )}

      {/* Processing feedback history */}
      <div className="admin-history" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {notificationSent && (
          <div className="admin-history-item" style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", background: "var(--mint)",
            borderRadius: 8, fontSize: 13,
          }}>
            <span style={{ fontSize: 16 }}>📬</span>
            <div>
              <strong>Notificaties verstuurd</strong>
              <span style={{ color: "var(--muted)", display: "block", fontSize: 12 }}>
                Naar eigen administratie, asset service provider, FactSet
              </span>
            </div>
          </div>
        )}

        {processedAt && (
          <div className="admin-history-item" style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", background: "#e8f5e9",
            borderRadius: 8, fontSize: 13,
          }}>
            <span style={{ fontSize: 16 }}>🔄</span>
            <div>
              <strong>Verwerkt</strong>
              <span style={{ color: "var(--muted)", display: "block", fontSize: 12 }}>
                {processedBy ? `Door ${processedBy}` : ""} — {new Date(processedAt + "T00:00:00").toLocaleDateString("nl-NL", { dateStyle: "long" })}
              </span>
            </div>
          </div>
        )}

        {validatedAt && (
          <div className="admin-history-item" style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", background: "var(--mint)",
            borderRadius: 8, fontSize: 13,
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div>
              <strong>Gevalideerd</strong>
              <span style={{ color: "var(--muted)", display: "block", fontSize: 12 }}>
                {validatedBy ? `Door ${validatedBy}` : ""} — {validatedAt ? new Date(validatedAt + "T00:00:00").toLocaleDateString("nl-NL", { dateStyle: "long" }) : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
