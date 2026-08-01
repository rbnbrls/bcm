import Link from "next/link";
import { getAllChangeRequests } from "@/lib/db";
import { CHANGE_STATUS_LABELS, type ChangeStatus } from "@/lib/types";
import { ProviderFeedbackForm } from "./provider-feedback-form";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  draft: { bg: "#eef1ed", dot: "#5d6864" },
  submitted: { bg: "#dff4e9", dot: "#0f6d55" },
  accepted: { bg: "#e3eaf5", dot: "#28497c" },
  in_progress: { bg: "#fff3d6", dot: "#c8950c" },
  processed: { bg: "#e8f5e9", dot: "#2e7d32" },
  validated: { bg: "#dff4e9", dot: "#0a513f" },
};

/** Compute days between a date string and now. Defined outside component to satisfy purity rule. */
function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = new Date().getTime();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export default async function VerwerktPage() {
  let allChanges = await getAllChangeRequests();

  const inProgress = allChanges.filter((c) => c.status === "in_progress");
  const recentProcessed = allChanges
    .filter((c) => c.status === "processed")
    .sort(
      (a, b) =>
        new Date(b.statusUpdatedAt).getTime() -
        new Date(a.statusUpdatedAt).getTime()
    )
    .slice(0, 5);

  return (
    <div className="page-shell">
      <section className="page-intro" role="region" aria-label="Verwerkt">
        <p className="eyebrow">SERVICE PROVIDER</p>
        <h1>Changes verwerken</h1>
        <p className="hero-copy">
          Markeer changes als verwerkt en werk de IST-configuratie bij. Na
          verwerking wordt de portfolioconfiguratie gesynchroniseerd.
        </p>
      </section>

      {/* In progress changes */}
      <section
        style={{
          background: "#fbfcfa",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 24,
          marginBottom: 32,
        }}
      >
        <p className="eyebrow" style={{ marginBottom: 16 }}>
          OPENSTAANDE VERWERKINGEN
        </p>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, letterSpacing: "-.03em" }}>
          Changes gereed voor verwerking
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            margin: "0 0 20px",
          }}
        >
          {inProgress.length === 0
            ? "Er zijn geen changes die verwerkt moeten worden."
            : `${inProgress.length} change${inProgress.length !== 1 ? "s" : ""} ${
                inProgress.length === 1 ? "wacht" : "wachten"
              } op verwerking.`}
        </p>

        {inProgress.length === 0 ? (
          <div
            className="empty-state"
            style={{
              textAlign: "center",
              padding: 48,
              color: "var(--muted)",
            }}
          >
            <span style={{ fontSize: 32, display: "block", marginBottom: 8 }}>
              ✓
            </span>
            <p>Alle changes zijn verwerkt.</p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {inProgress.map((change) => {
              const style =
                STATUS_STYLES[change.status] ?? STATUS_STYLES.draft;
              const daysAgo = daysSince(change.statusUpdatedAt);
              return (
                <div
                  key={change.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: 16,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <Link
                        href={`/changes/${change.id}`}
                        style={{
                          fontWeight: 600,
                          color: "var(--accent)",
                          textDecoration: "none",
                          fontSize: 15,
                        }}
                      >
                        {change.reference}
                      </Link>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          marginLeft: 8,
                        }}
                      >
                        {change.clientName}
                      </span>
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        borderRadius: 100,
                        fontSize: 11,
                        fontWeight: 700,
                        background: style.bg,
                        color: style.dot,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: style.dot,
                          display: "inline-block",
                        }}
                      />
                      {CHANGE_STATUS_LABELS[change.status as ChangeStatus] ??
                        change.status}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      fontSize: 12,
                      color: "var(--muted)",
                      marginBottom: 12,
                    }}
                  >
                    <span>
                      Open sinds {daysAgo === 0 ? "vandaag" : `${daysAgo} dagen`}
                    </span>
                    <span>
                      {change.changeType === "new_benchmark"
                        ? "Nieuwe benchmark"
                        : change.changeType === "new_asset_class"
                          ? "Nieuwe asset class"
                          : change.changeType === "new_sub_asset_class"
                            ? "Nieuwe sub asset class"
                            : "Benchmarkwissel"}
                    </span>
                  </div>

                  <ProviderFeedbackForm
                    changeId={change.id}
                    reference={change.reference}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recently processed */}
      {recentProcessed.length > 0 && (
        <section
          style={{
            background: "#fbfcfa",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <p className="eyebrow" style={{ marginBottom: 16 }}>
            ONLANGS VERWERKT
          </p>
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: 18,
              letterSpacing: "-.03em",
            }}
          >
            Recent verwerkte changes
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {recentProcessed.map((change) => (
              <div
                key={change.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#e8f5e9",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <div>
                  <Link
                    href={`/changes/${change.id}`}
                    style={{
                      fontWeight: 600,
                      color: "var(--accent-deep)",
                      textDecoration: "none",
                    }}
                  >
                    {change.reference}
                  </Link>
                  <span
                    style={{
                      color: "var(--muted)",
                      marginLeft: 8,
                    }}
                  >
                    {change.clientName}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "var(--accent-deep)" }}>
                  ✓ Verwerkt
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div
        style={{ marginTop: 24, textAlign: "center" }}
      >
        <Link className="button button-ghost" href="/changes">
          ← Alle changes
        </Link>
      </div>
    </div>
  );
}
