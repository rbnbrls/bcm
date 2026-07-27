import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangeTypeById } from "@/lib/db";
import {
  generateStakeholderFlowMermaid,
  formatCurrency,
  formatLeadDays,
  formatCategoryLabel,
} from "@/lib/change-type-catalog";
import { MermaidRenderer } from "@/components/mermaid-renderer";
import type { FlowStep } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ChangeCatalogDetailPage({ params }: Props) {
  const { id } = await params;
  const changeType = await getChangeTypeById(id);

  if (!changeType || !changeType.active) {
    notFound();
  }

  const flow: FlowStep[] = changeType.processFlow ?? [];
  const hasFlow = flow.length > 0;
  const mermaidDefinition = hasFlow
    ? generateStakeholderFlowMermaid(flow, changeType.name)
    : "";
  const hasExplanation = !!changeType.extendedExplanation;
  const sortedSteps = [...flow].sort((a, b) => a.stepOrder - b.stepOrder);

  return (
    <div className="page-shell">
      {/* Breadcrumb */}
      <div className="page-intro" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
              HOME
            </Link>
            {" · "}
            <Link
              href="/change-catalog"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              CHANGE CATALOGUS
            </Link>
            {" · DETAIL"}
          </p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "-.05em", lineHeight: 1.1, margin: "8px 0 4px" }}>
            {changeType.name}
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 600, margin: 0 }}>
            {changeType.description}
          </p>
        </div>
      </div>

      {/* Key info grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          margin: "32px 0",
        }}
      >
        <article className="cost-card">
          <p className="cost-card-type">Categorie</p>
          <p className="cost-card-detail">{formatCategoryLabel(changeType.category)}</p>
        </article>
        <article className="cost-card">
          <p className="cost-card-type">Kosten</p>
          <p className="cost-card-detail">
            Vanaf {formatCurrency(changeType.cost.baseCost, changeType.cost.costCurrency)}
            {changeType.cost.perItemCost
              ? ` + ${formatCurrency(changeType.cost.perItemCost, changeType.cost.costCurrency)} per item`
              : ""}
          </p>
          {changeType.cost.description && (
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
              {changeType.cost.description}
            </p>
          )}
        </article>
        <article className="cost-card">
          <p className="cost-card-type">Doorlooptijd</p>
          <p className="cost-card-detail">{formatLeadDays(changeType.defaultLeadDays)}</p>
        </article>
        <article className="cost-card">
          <p className="cost-card-type">Betrokkenen</p>
          <p className="cost-card-detail">
            {changeType.stakeholders.length > 0
              ? `${changeType.stakeholders.length} partij${changeType.stakeholders.length !== 1 ? "en" : ""}`
              : "Geen"}
          </p>
        </article>
      </div>

      {/* Extended explanation — Hoe werkt het */}
      {hasExplanation && (
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "32px 28px",
            marginBottom: 40,
          }}
        >
          <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: "0 0 16px" }}>
            Hoe werkt het
          </h2>
          {changeType.extendedExplanation!.split("\n\n").map((paragraph, i) => (
            <p
              key={i}
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--text)",
                maxWidth: 680,
                margin: i > 0 ? "16px 0 0" : 0,
              }}
            >
              {paragraph.split("\n").map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
          ))}
        </section>
      )}

      {/* Required data (fields/inputs) */}
      {changeType.fields.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: "0 0 16px" }}>
            Vereiste gegevens
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", maxWidth: 600 }}>
            Bij het aanvragen van deze change moeten de volgende gegevens worden opgegeven.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {changeType.fields.map((field) => (
              <div
                key={field.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "#fbfcfa",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{field.label}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        background: "var(--panel)",
                        padding: "1px 8px",
                        borderRadius: 100,
                      }}
                    >
                      {field.type === "select"
                        ? "Keuzelijst"
                        : field.type === "text"
                          ? "Tekst"
                          : field.type === "longtext"
                            ? "Lange tekst"
                            : field.type === "number"
                              ? "Getal"
                              : field.type === "currency"
                                ? "Bedrag"
                                : field.type === "date"
                                  ? "Datum"
                                  : field.type === "benchmark"
                                    ? "Benchmark"
                                    : field.type === "boolean"
                                      ? "Ja/Nee"
                                      : field.type}
                    </span>
                  </div>
                  {field.helpText && (
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
                      {field.helpText}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: field.required ? "var(--accent-deep)" : "var(--muted)",
                    background: field.required ? "var(--mint)" : "var(--panel)",
                    padding: "2px 8px",
                    borderRadius: 100,
                  }}
                >
                  {field.required ? "Verplicht" : "Optioneel"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stakeholders detail */}
      {changeType.stakeholders.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: "0 0 16px" }}>
            Betrokken partijen
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", maxWidth: 600 }}>
            Overzicht van de partijen die betrokken zijn bij dit change proces en op welk moment zij worden ge&iuml;nformeerd.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {changeType.stakeholders.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "#fbfcfa",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>{s.name}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>
                    {s.role}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {s.notifyOn.map((trigger) => (
                    <span
                      key={trigger}
                      style={{
                        fontSize: 10,
                        color: "var(--accent-deep)",
                        background: "var(--mint)",
                        padding: "2px 8px",
                        borderRadius: 100,
                      }}
                    >
                      {trigger === "on_submit"
                        ? "Bij aanvraag"
                        : trigger === "on_approval"
                          ? "Na goedkeuring"
                          : "Bij gereedmelding"}
                    </span>
                  ))}
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      background: "var(--panel)",
                      padding: "2px 8px",
                      borderRadius: 100,
                    }}
                  >
                    {s.mandatory ? "Verplicht" : "Optioneel"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step-by-step process breakdown */}
      {sortedSteps.length > 0 && (
        <section aria-label="Stap-voor-stap procesbeschrijving" style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: "0 0 16px" }}>
            Processtappen
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", maxWidth: 600 }}>
            Gedetailleerd overzicht van alle stappen in het change proces, met verantwoordelijke partij, doorlooptijd en beschrijving.
          </p>
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
          <div
            style={{
              marginTop: 16,
              padding: "14px 20px",
              background: "var(--panel)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            <strong style={{ color: "var(--ink)" }}>Totale doorlooptijd:</strong>{" "}
            {formatLeadDays(changeType.defaultLeadDays)}{" "}
            (standaard)
          </div>
        </section>
      )}

      {/* Stakeholder-only process flow diagram */}
      {hasFlow && (
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: 0 }}>
              Procesflow
            </h2>
            <span
              style={{
                fontSize: 11,
                color: "var(--muted)",
                background: "var(--panel)",
                padding: "2px 10px",
                borderRadius: 100,
                whiteSpace: "nowrap",
              }}
            >
              Alleen stakeholder stappen
            </span>
          </div>
          <MermaidRenderer definition={mermaidDefinition} />
          <div style={{ marginTop: 16 }}>
            <Link
              href={`/change-types/${changeType.slug}`}
              style={{
                fontSize: 13,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              Bekijk volledige procesflow met systeemstappen →
            </Link>
          </div>
        </section>
      )}

      {/* CTA */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 32,
          padding: "24px 32px",
          background: "var(--panel)",
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong style={{ fontSize: 15 }}>{changeType.name}</strong>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>
            Start een nieuwe change van dit type
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button button-primary" href={`/changes/new?type=${changeType.slug}`}>
            Start {changeType.name.toLowerCase()} →
          </Link>
        </div>
      </div>

      {/* Back link */}
      <div style={{ marginTop: 24 }}>
        <Link className="button button-ghost" href="/change-catalog">
          ← Terug naar change catalogus
        </Link>
      </div>
    </div>
  );
}
