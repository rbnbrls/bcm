import Link from "next/link";

import type { PublishedWorkflowCatalogItem } from "@/lib/workflow-studio/catalog";

function formatCost(item: PublishedWorkflowCatalogItem): string {
  const cost = item.definition.costModel ?? { baseCost: 0, currency: "EUR" };
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: cost.currency ?? "EUR",
    maximumFractionDigits: 2,
  }).format(cost.baseCost ?? 0);
}

export function WorkflowCatalog({ items }: { items: readonly PublishedWorkflowCatalogItem[] }) {
  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
        <p>Geen gepubliceerde workflows beschikbaar.</p>
      </div>
    );
  }

  return (
    <div className="change-type-catalog">
      {items.map((item) => (
        <article className="change-type-card" key={item.version.id} aria-label={item.definition.name}>
          <div className="change-type-card-header">
            <div>
              <span className="change-type-badge">{item.definition.category ?? "change"}</span>
              <h3>
                <Link href={`/change-catalog/${item.definition.slug}`} className="change-type-title-link">
                  {item.definition.name}
                </Link>
              </h3>
            </div>
            <span className="change-type-sla">v{item.version.versionNumber}</span>
          </div>
          <p className="change-type-desc">{item.definition.catalogDescription || item.definition.description}</p>
          <div className="change-type-cost">
            <span>Vanaf {formatCost(item)}</span>
            {item.definition.costModel?.perItemCost ? (
              <span className="change-type-cost-detail">
                + {formatCost({
                  ...item,
                  definition: {
                    ...item.definition,
                    costModel: {
                      ...item.definition.costModel,
                      baseCost: item.definition.costModel.perItemCost,
                    },
                  },
                })} per item
              </span>
            ) : null}
          </div>
          {item.version.contentHash ? (
            <code title={item.version.contentHash}>sha256:{item.version.contentHash.slice(0, 12)}...</code>
          ) : null}
          <div className="change-type-cta">
            {item.startHref ? (
              <Link href={item.startHref} className="button button-primary">
                Aanvragen
              </Link>
            ) : (
              <span className="button button-secondary" aria-disabled="true" title={item.blockedReason}>
                Niet startbaar
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
