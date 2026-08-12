import Link from "next/link";
import { notFound } from "next/navigation";

import { sql } from "@/lib/db";
import { getIdentityContext } from "@/lib/identity/request";
import {
  fieldTypeLabel,
  loadPublishedWorkflowCatalogDetail,
} from "@/lib/workflow-studio/catalog";

type Props = {
  params: Promise<{ id: string }>;
};

function formatCost(baseCost: number, currency = "EUR"): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(baseCost);
}

export default async function ChangeCatalogDetailPage({ params }: Props) {
  if (!sql) notFound();
  const { id } = await params;
  const detail = await loadPublishedWorkflowCatalogDetail(sql, await getIdentityContext(), id);
  if (!detail) notFound();

  const cost = detail.definition.costModel ?? { baseCost: 0, currency: "EUR", description: "" };
  const forms = detail.startModel?.forms ?? [];
  const nodes = [...detail.nodes].sort((left, right) => left.positionX - right.positionX || left.positionY - right.positionY);

  return (
    <div className="page-shell">
      <div className="page-intro" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>HOME</Link>
            {" · "}
            <Link href="/change-catalog" style={{ color: "inherit", textDecoration: "none" }}>CHANGE CATALOGUS</Link>
            {" · WORKFLOW"}
          </p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "-.05em", lineHeight: 1.1, margin: "8px 0 4px" }}>
            {detail.definition.name}
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 680, margin: 0 }}>
            {detail.definition.catalogDescription || detail.definition.description}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, margin: "32px 0" }}>
        <article className="cost-card">
          <p className="cost-card-type">Categorie</p>
          <p className="cost-card-detail">{detail.definition.category ?? "change"}</p>
        </article>
        <article className="cost-card">
          <p className="cost-card-type">Kosten</p>
          <p className="cost-card-detail">
            Vanaf {formatCost(cost.baseCost ?? 0, cost.currency)}
            {cost.perItemCost ? ` + ${formatCost(cost.perItemCost, cost.currency)} per item` : ""}
          </p>
          {cost.description ? <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>{cost.description}</p> : null}
        </article>
        <article className="cost-card">
          <p className="cost-card-type">Versie</p>
          <p className="cost-card-detail">v{detail.version.versionNumber}</p>
          {detail.version.contentHash ? <small>sha256:{detail.version.contentHash.slice(0, 12)}...</small> : null}
        </article>
        <article className="cost-card">
          <p className="cost-card-type">Status</p>
          <p className="cost-card-detail">{detail.startable ? "Startbaar" : "Niet startbaar"}</p>
        </article>
      </div>

      {forms.length > 0 ? (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: "0 0 16px" }}>
            Vereiste gegevens
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {forms.flatMap((form) => form.configuration.fields.map((field) => (
              <div key={`${form.nodeKey}.${field.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#fbfcfa", border: "1px solid var(--line)", borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{field.label}</strong>
                    <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--panel)", padding: "1px 8px", borderRadius: 100 }}>
                      {fieldTypeLabel(field)}
                    </span>
                  </div>
                  {field.helpText ? <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>{field.helpText}</p> : null}
                </div>
                <span style={{ fontSize: 11, color: field.required ? "var(--accent-deep)" : "var(--muted)", background: field.required ? "var(--mint)" : "var(--panel)", padding: "2px 8px", borderRadius: 100 }}>
                  {field.required ? "Verplicht" : "Optioneel"}
                </span>
              </div>
            )))}
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, letterSpacing: "-.03em", margin: "0 0 16px" }}>Processtappen</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {nodes.map((node, index) => (
            <article key={node.id} style={{ background: "#fbfcfa", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 20px" }}>
              <strong>{index + 1}. {node.nodeKey}</strong>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>{node.blockType}</p>
            </article>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", marginTop: 32, padding: "24px 32px", background: "var(--panel)", borderRadius: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <strong style={{ fontSize: 15 }}>{detail.definition.name}</strong>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>
            Start een nieuwe aanvraag via de gepubliceerde workflow-runtime.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {detail.startHref ? (
            <Link className="button button-primary" href={detail.startHref}>
              Aanvragen
            </Link>
          ) : (
            <Link className="button button-secondary" href="/workflow-studio">
              Open Workflow Studio
            </Link>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Link className="button button-ghost" href="/change-catalog">
          Terug naar change catalogus
        </Link>
      </div>
    </div>
  );
}
