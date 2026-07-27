import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { MermaidRenderer } from "@/components/mermaid-renderer";
import { generateFlowMermaid, flowStepDescriptions } from "@/lib/change-type-catalog";
import type { FlowStep } from "@/lib/types";

type FlowResponse = {
  changeType: {
    id: string;
    slug: string;
    name: string;
    description: string;
    defaultLeadDays: number;
  };
  flow: FlowStep[];
};

/**
 * Build an absolute base URL for API calls in server components.
 * Uses NEXT_PUBLIC_BASE_URL if set, otherwise derives from request headers.
 */
async function resolveBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const hostHeader = h.get("host") ?? "localhost:3000";
    return `${proto}://${hostHeader}`;
  } catch {
    return "http://localhost:3000";
  }
}

export default async function ChangeTypeFlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const host = await resolveBaseUrl();

  // Fetch flow data from the API endpoint
  let response: Response;
  try {
    response = await fetch(
      `${host}/api/change-types/${encodeURIComponent(id)}/flow`,
      { next: { revalidate: 60 } }
    );
  } catch {
    return (
      <div className="page-shell empty-state" role="alert">
        <p className="eyebrow">FOUT</p>
        <h1>Kan procesflow niet laden</h1>
        <p>De procesflow voor dit change type kon niet worden opgehaald. Probeer het later nog eens.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link className="button button-secondary" href="/">Naar home</Link>
        </div>
      </div>
    );
  }

  if (!response.ok) {
    // 404 — either change type not found or no flow defined
    if (response.status === 404) {
      const body = await response.json().catch(() => ({}));
      const changeTypeInfo = body.changeType;

      return (
        <div className="page-shell empty-state" role="alert">
          <p className="eyebrow">PROCESFLOW</p>
          {changeTypeInfo ? (
            <>
              <h1>{changeTypeInfo.name}</h1>
              <p>Voor dit change type is nog geen procesflow gedefinieerd.</p>
            </>
          ) : (
            <>
              <h1>Change type niet gevonden</h1>
              <p>Het change type &quot;{id}&quot; bestaat niet of is niet beschikbaar.</p>
            </>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <Link className="button button-secondary" href="/">Naar home</Link>
          </div>
        </div>
      );
    }

    return (
      <div className="page-shell empty-state" role="alert">
        <p className="eyebrow">FOUT</p>
        <h1>Kan procesflow niet laden</h1>
        <p>Er is een fout opgetreden bij het ophalen van de procesflow. Probeer het later nog eens.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link className="button button-secondary" href="/">Naar home</Link>
        </div>
      </div>
    );
  }

  const data: FlowResponse = await response.json();
  const { changeType, flow } = data;

  if (!flow || flow.length === 0) {
    return (
      <div className="page-shell empty-state" role="alert">
        <p className="eyebrow">PROCESFLOW</p>
        <h1>{changeType.name}</h1>
        <p>Voor dit change type is nog geen procesflow gedefinieerd.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link className="button button-secondary" href="/">Naar home</Link>
        </div>
      </div>
    );
  }

  const mermaidDefinition = generateFlowMermaid(flow, changeType.name);
  const sortedSteps = flowStepDescriptions(flow);

  return (
    <div className="page-shell">
      {/* Breadcrumb / header */}
      <div className="page-intro" style={{ marginBottom: 32 }}>
        <p className="eyebrow">
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>HOME</Link>
          {" · "}
          <Link href="/changes/new" style={{ color: "inherit", textDecoration: "none" }}>CHANGE CATALOGUS</Link>
          {" · PROCESFLOW"}
        </p>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "-.05em", lineHeight: 1.1, margin: "8px 0 4px" }}>
          {changeType.name}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 600, margin: 0 }}>
          {changeType.description}
        </p>
      </div>

      {/* ── Mermaid flowchart — full width ── */}
      <section
        aria-label="Procesflow diagram"
        style={{
          background: "#fbfcfa",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "32px 24px",
          marginBottom: 40,
          overflowX: "auto",
        }}
      >
        <MermaidRenderer definition={mermaidDefinition} />
      </section>

      {/* ── Step-by-step description ── */}
      <section aria-label="Stap-voor-stap beschrijving">
        <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: "0 0 20px" }}>
          Stapsgewijze toelichting
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedSteps.map((step) => (
            <article
              key={step.stepOrder}
              style={{
                background: "#fbfcfa",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "16px 20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                {/* Step number badge */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--mint)",
                    color: "var(--accent-deep)",
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {step.stepOrder}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Step action + lead time */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        margin: 0,
                        letterSpacing: "-.01em",
                      }}
                    >
                      {step.action}
                    </h3>
                    {step.leadTime && step.leadTime !== "—" && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ⏱ {step.leadTime}
                      </span>
                    )}
                  </div>

                  {/* Stakeholder */}
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--accent)",
                      margin: "0 0 6px",
                    }}
                  >
                    Uitgevoerd door: {step.stakeholder}
                  </p>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: 13.5,
                      color: "var(--ink)",
                      margin: 0,
                      lineHeight: 1.55,
                    }}
                  >
                    {step.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Total lead time summary */}
        {sortedSteps.length > 0 && (
          <div
            style={{
              marginTop: 20,
              padding: "14px 20px",
              background: "var(--panel)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            <strong style={{ color: "var(--ink)" }}>Totale doorlooptijd:</strong>{" "}
            {changeType.defaultLeadDays}{" "}
            {changeType.defaultLeadDays === 1 ? "werkdag" : "werkdagen"}{" "}
            (standaard)
          </div>
        )}
      </section>

      {/* Back link */}
      <div style={{ marginTop: 40 }}>
        <Link
          className="button button-ghost"
          href="/changes/new"
        >
          ← Terug naar change catalogus
        </Link>
      </div>
    </div>
  );
}
