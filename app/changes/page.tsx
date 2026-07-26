import Link from "next/link";
import { getAllChangeRequests, getChangeTypes } from "@/lib/db";
import { CHANGE_STATUS_LABELS, type ChangeStatus } from "@/lib/types";

const STATUS_ORDER: ChangeStatus[] = [
  "draft",
  "submitted",
  "accepted",
  "in_progress",
  "processed",
  "validated",
];

const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  draft: { bg: "#eef1ed", dot: "#5d6864" },
  submitted: { bg: "#dff4e9", dot: "#0f6d55" },
  accepted: { bg: "#e3eaf5", dot: "#28497c" },
  in_progress: { bg: "#fff3d6", dot: "#c8950c" },
  processed: { bg: "#e8f5e9", dot: "#2e7d32" },
  validated: { bg: "#dff4e9", dot: "#0a513f" },
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

function SlaIndicator({ createdAt, slaWeeks }: { createdAt: string; slaWeeks: number }) {
  const created = new Date(createdAt);
  const now = new Date();
  const daysRunning = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const slaDays = slaWeeks * 7;
  const remaining = slaDays - daysRunning;
  const atRisk = remaining <= 0;
  const warning = remaining > 0 && remaining <= Math.ceil(slaDays * 0.25);

  let color = "var(--accent)";
  let bg = "var(--mint)";
  if (atRisk) { color = "var(--danger)"; bg = "var(--danger-bg)"; }
  else if (warning) { color = "#c8950c"; bg = "#fff3d6"; }

  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 8px", borderRadius: 6, fontSize: 11.5,
        fontWeight: 700, letterSpacing: "-0.01em",
        background: bg, color,
        whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
      }}
      title={`Ingediend: ${created.toLocaleDateString("nl-NL")}\nSLA: ${slaWeeks} week${slaWeeks !== 1 ? "en" : ""}\n${atRisk ? "SLA OVERSCHREDEN" : warning ? "SLA bijna overschreden" : `Nog ${remaining} dag${remaining !== 1 ? "en" : ""} resterend`}`}
    >
      <span>{daysRunning}d</span>
      {slaWeeks > 0 && (
        <>
          <span style={{ opacity: 0.4 }}>/</span>
          <span>{slaDays}d</span>
        </>
      )}
      {atRisk && <span>⚠</span>}
    </span>
  );
}

function ChangeType({ type, configName }: { type: string; configName?: string }) {
  // Use the config name if available, otherwise fall back to a human-readable slug
  if (configName) return <span>{configName}</span>;
  if (type === "new_benchmark") return <span>Nieuwe benchmark</span>;
  if (type === "benchmark_switch") return <span>Benchmarkwissel</span>;
  return <span>{type}</span>;
}

export default async function ChangesOverviewPage() {
  const [changes, changeTypes] = await Promise.all([
    getAllChangeRequests(),
    getChangeTypes(),
  ]);
  const typeNameMap = new Map(changeTypes.map((ct) => [ct.slug, ct.name]));
  const now = new Date();

  const totalPending = changes.filter(
    (c) => c.status === "submitted" || c.status === "accepted" || c.status === "in_progress"
  ).length;

  const slaAtRisk = changes.filter((c) => {
    const created = new Date(c.createdAt);
    const daysRunning = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return daysRunning > c.slaLeadWeeks * 7 && (c.status !== "validated" && c.status !== "processed");
  }).length;

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
      <section style={{ marginBottom: 32, background: "#fbfcfa", border: "1px solid var(--line)", borderRadius: 10, padding: 20 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>WORKFLOW</p>
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {STATUS_ORDER.map((status, i) => {
            const count = changes.filter((c) => c.status === status).length;
            const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
            const isActive = count > 0;
            return (
              <div key={status} style={{ flex: 1, display: "flex", alignItems: "center", gap: 0 }}>
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
                    {CHANGE_STATUS_LABELS[status]}
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

      {/* Changes list grouped by status */}
      {changes.length === 0 ? (
        <div className="empty-state" style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
          <p>Nog geen change requests.</p>
          <Link className="button button-primary" href="/changes/new" style={{ marginTop: 16, display: "inline-flex" }}>
            Nieuwe change aanvragen
          </Link>
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
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Doorlooptijd</th>
                <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Ingediend</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => {
                const created = new Date(change.createdAt);
                const daysRunning = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <tr key={change.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <Link href={`/changes/${change.id}`} style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
                        {change.reference}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--ink)" }}>{change.clientName}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12.5 }}><ChangeType type={change.changeType} configName={typeNameMap.get(change.changeType)} /></td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={change.status} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      <SlaIndicator createdAt={change.createdAt} slaWeeks={change.slaLeadWeeks} />
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {daysRunning === 0 ? "Vandaag" : `${daysRunning} dag${daysRunning !== 1 ? "en" : ""} geleden`}
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
