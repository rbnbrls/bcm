"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CHANGE_STATUS_LABELS, type ChangeRequestSummary, type ChangeStatus, type SlaStatus } from "@/lib/types";

const STATUS_ORDER: ChangeStatus[] = [
  "draft", "submitted", "accepted", "in_progress", "processed", "validated",
];

const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  draft: { bg: "#eef1ed", dot: "#5d6864" },
  submitted: { bg: "#dff4e9", dot: "#0f6d55" },
  accepted: { bg: "#e3eaf5", dot: "#28497c" },
  in_progress: { bg: "#fff3d6", dot: "#c8950c" },
  processed: { bg: "#e8f5e9", dot: "#2e7d32" },
  validated: { bg: "#dff4e9", dot: "#0a513f" },
};

const SLA_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  ok: { bg: "#dff4e9", color: "#0f6d55", label: "Op schema" },
  at_risk: { bg: "#fff3d6", color: "#c8950c", label: "Loopt risico" },
  overdue: { bg: "#fff0ed", color: "#a44032", label: "Overschreden" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 10px", borderRadius: 100, fontSize: 12,
        fontWeight: 700, letterSpacing: "-0.01em",
        background: style.bg, color: style.dot,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: style.dot, flexShrink: 0, display: "inline-block" }} />
      {CHANGE_STATUS_LABELS[status as ChangeStatus] || status}
    </span>
  );
}

function SlaBadge({ slaStatus }: { slaStatus: SlaStatus }) {
  const style = SLA_STATUS_STYLES[slaStatus];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 8px", borderRadius: 100, fontSize: 11.5,
        fontWeight: 700, letterSpacing: "-0.01em",
        background: style.bg, color: style.color,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: style.color, flexShrink: 0, display: "inline-block" }} />
      {style.label}
    </span>
  );
}

function SlaProgressBar({
  daysOpen,
  slaDays,
  slaStatus,
}: {
  daysOpen: number;
  slaDays: number;
  slaStatus: SlaStatus;
}) {
  const isOverdue = slaStatus === "overdue";
  const isAtRisk = slaStatus === "at_risk";

  const pct = slaDays > 0 ? Math.min((daysOpen / slaDays) * 100, 100) : 0;
  const barColor = isOverdue ? "#a44032" : isAtRisk ? "#c8950c" : "#0f6d55";
  const barBg = isOverdue ? "#fff0ed" : isAtRisk ? "#fff3d6" : "#dff4e9";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 160 }}>
      <div
        style={{
          flex: 1, height: 6, borderRadius: 3, background: barBg,
          overflow: "hidden", minWidth: 60,
        }}
        title={`${daysOpen}d / ${slaDays}d (${Math.round(pct)}%)`}
      >
        <div
          style={{
            width: `${pct}%`, height: "100%", borderRadius: 3,
            background: barColor, transition: "width 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
          color: barColor, whiteSpace: "nowrap",
        }}
      >
        {isOverdue ? (
          <span>⚠ +{daysOpen - slaDays}d</span>
        ) : (
          <span>{daysOpen}d / {slaDays}d</span>
        )}
      </span>
    </div>
  );
}

function ChangeType({ type }: { type: string }) {
  if (type === "new_benchmark") return <span>Nieuwe benchmark</span>;
  if (type === "benchmark_switch") return <span>Benchmarkwissel</span>;
  return <span>{type}</span>;
}

/** Fetch changes from the API with optional filters. */
async function fetchChangesFromApi(
  status: string,
  slaStatus: string
): Promise<{ changes: ChangeRequestSummary[] }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (slaStatus) params.set("sla_status", slaStatus);
  const url = `/api/changes${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Laden mislukt (${res.status})`);
  return res.json();
}

export default function ChangesDashboardClient({
  initialData,
  initialStatus,
  initialSlaStatus,
}: {
  initialData: ChangeRequestSummary[];
  initialStatus: string;
  initialSlaStatus: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [changes, setChanges] = useState<ChangeRequestSummary[]>(initialData);
  const [error, setError] = useState<string | null>(null);

  const status = searchParams.get("status") || initialStatus || "";
  const slaStatus = searchParams.get("sla_status") || initialSlaStatus || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const href = `/changes${params.toString() ? `?${params.toString()}` : ""}`;

    // Optimistically update local state, then re-fetch in transition
    setError(null);
    startTransition(async () => {
      try {
        const data = await fetchChangesFromApi(
          key === "status" ? value : status,
          key === "sla_status" ? value : slaStatus
        );
        setChanges(data.changes ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Onbekende fout");
        setChanges([]);
      }
    });

    router.push(href, { scroll: false });
  };

  const totalPending = changes.filter(
    (c) => c.status === "submitted" || c.status === "accepted" || c.status === "in_progress"
  ).length;

  const slaAtRisk = changes.filter(
    (c) => c.slaStatus !== "ok" && c.status !== "validated" && c.status !== "processed"
  ).length;

  return (
    <div className="page-shell">
      <section className="page-intro" role="region" aria-label="Change overzicht">
        <p className="eyebrow">DASHBOARD</p>
        <h1>Change overzicht</h1>
        <p className="hero-copy">
          Alle change requests met status en SLA-bewaking. Van concept tot validatie.
        </p>
      </section>

      {/* Stats cards */}
      <section className="changes-stats" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 12, marginBottom: 32,
      }}>
        <article className="stat-card" style={{ padding: 16, background: "#fbfcfa", border: "1px solid var(--line)", borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>Totaal</p>
          <strong style={{ fontSize: 28, letterSpacing: "-.04em" }}>{changes.length}</strong>
          <span style={{ fontSize: 11, color: "var(--muted)", display: "block" }}>change{changes.length !== 1 ? "s" : ""}</span>
        </article>
        <article className="stat-card" style={{ padding: 16, background: "#fbfcfa", border: "1px solid var(--line)", borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>In behandeling</p>
          <strong style={{ fontSize: 28, letterSpacing: "-.04em", color: "var(--accent)" }}>{totalPending}</strong>
          <span style={{ fontSize: 11, color: "var(--muted)", display: "block" }}>openstaand</span>
        </article>
        <article className="stat-card" style={{ padding: 16, background: "#fbfcfa", border: "1px solid var(--line)", borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>SLA risico</p>
          <strong style={{ fontSize: 28, letterSpacing: "-.04em", color: slaAtRisk > 0 ? "var(--danger)" : "var(--accent)" }}>{slaAtRisk}</strong>
          <span style={{ fontSize: 11, color: "var(--muted)", display: "block" }}>{slaAtRisk === 1 ? "change loopt uit" : "lopen uit"}</span>
        </article>
      </section>

      {/* Workflow visualization */}
      <section style={{ marginBottom: 24, background: "#fbfcfa", border: "1px solid var(--line)", borderRadius: 10, padding: 20 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>WORKFLOW</p>
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {STATUS_ORDER.map((s, i) => {
            const count = changes.filter((c) => c.status === s).length;
            const style = STATUS_STYLES[s] ?? STATUS_STYLES.draft;
            const isActive = count > 0;
            return (
              <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 0 }}>
                <div style={{
                  flex: 1, textAlign: "center", padding: "8px 4px",
                  background: isActive ? style.bg : "transparent",
                  borderRadius: i === 0 ? "8px 0 0 8px" : i === STATUS_ORDER.length - 1 ? "0 8px 8px 0" : 0,
                  borderTop: `2px solid ${isActive ? style.dot : "var(--line)"}`,
                  borderBottom: `2px solid ${isActive ? style.dot : "var(--line)"}`,
                  borderLeft: i === 0 ? `2px solid ${isActive ? style.dot : "var(--line)"}` : "none",
                  borderRight: i === STATUS_ORDER.length - 1 ? `2px solid ${isActive ? style.dot : "var(--line)"}` : "none",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 750, color: isActive ? style.dot : "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>
                    {CHANGE_STATUS_LABELS[s]}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: isActive ? style.dot : "var(--muted)", letterSpacing: "-.03em" }}>
                    {count}
                  </div>
                </div>
                {i < STATUS_ORDER.length - 1 && (
                  <div style={{ width: 16, height: 2, background: "var(--line)", flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Filters */}
      <section className="changes-filters" style={{
        display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="filter-status" style={{ fontSize: 12, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            Status
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setFilter("status", e.target.value)}
            style={{
              padding: "6px 12px", border: "1px solid var(--line)", borderRadius: 8,
              background: "#fbfcfa", font: "inherit", fontSize: 13, fontWeight: 600,
              color: "var(--ink)", cursor: "pointer", minWidth: 120,
            }}
          >
            <option value="">Alle statussen</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{CHANGE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="filter-sla" style={{ fontSize: 12, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            SLA status
          </label>
          <select
            id="filter-sla"
            value={slaStatus}
            onChange={(e) => setFilter("sla_status", e.target.value)}
            style={{
              padding: "6px 12px", border: "1px solid var(--line)", borderRadius: 8,
              background: "#fbfcfa", font: "inherit", fontSize: 13, fontWeight: 600,
              color: "var(--ink)", cursor: "pointer", minWidth: 120,
            }}
          >
            <option value="">Alle SLA-statussen</option>
            <option value="ok">Op schema</option>
            <option value="at_risk">Loopt risico</option>
            <option value="overdue">Overschreden</option>
          </select>
        </div>

        {(status || slaStatus) && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const data = await fetchChangesFromApi("", "");
                  setChanges(data.changes ?? []);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Onbekende fout");
                  setChanges([]);
                }
              });
              router.push("/changes");
            }}
            style={{
              padding: "6px 14px", border: "1px solid var(--line)", borderRadius: 8,
              background: "#fbfcfa", font: "inherit", fontSize: 12, fontWeight: 600,
              color: "var(--muted)", cursor: "pointer", transition: "all .15s",
            }}
          >
            Filters wissen
          </button>
        )}

        {isPending && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="pill-spinner" style={{ width: 12, height: 12, display: "inline-block" }} />
            Laden...
          </span>
        )}
      </section>

      {/* Changes table */}
      {error ? (
        <div className="empty-state" style={{ textAlign: "center", padding: 48, color: "var(--danger)" }}>
          <p>{error}</p>
          <button
            className="button button-primary"
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const data = await fetchChangesFromApi(status, slaStatus);
                  setChanges(data.changes ?? []);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Onbekende fout");
                  setChanges([]);
                }
              });
            }}
            style={{ marginTop: 16 }}
          >
            Opnieuw proberen
          </button>
        </div>
      ) : changes.length === 0 ? (
        <div className="empty-state" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
          <p>{status || slaStatus ? "Geen changes gevonden voor deze filters." : "Nog geen change requests."}</p>
          {!status && !slaStatus && (
            <>
              <Link className="button button-primary" href="/changes/new" style={{ marginTop: 16, display: "inline-flex" }}>
                Nieuwe change aanvragen
              </Link>
              <Link className="button button-secondary" href="/verwerkt" style={{ marginTop: 8, display: "inline-flex" }}>
                Service provider →
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="changes-table-wrapper" style={{
          overflowX: "auto", border: "1px solid var(--line)",
          borderRadius: 10, background: "#fbfcfa",
        }}>
          <table className="changes-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, lineHeight: 1.5 }}>
            <caption style={{ display: "none" }}>Overzicht van change requests</caption>
            <thead>
              <tr style={{ background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Referentie</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Klant</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Type</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Status</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>SLA</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Doorlooptijd</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Laatste update</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => {
                const slaDays = change.slaLeadWeeks * 7;
                return (
                  <tr key={change.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <Link href={`/changes/${change.id}`} style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
                        {change.reference}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--ink)" }}>{change.clientName}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5 }}><ChangeType type={change.changeType} /></td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={change.status} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      <SlaBadge slaStatus={change.slaStatus} />
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <SlaProgressBar
                        daysOpen={change.daysOpen}
                        slaDays={slaDays}
                        slaStatus={change.slaStatus}
                      />
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {(() => {
                        const updated = new Date(change.statusUpdatedAt);
                        const now = new Date();
                        const diffDays = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays === 0) return "Vandaag";
                        if (diffDays === 1) return "Gisteren";
                        return `${diffDays} dagen geleden`;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
