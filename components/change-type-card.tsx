"use client";

import Link from "next/link";
import type { ChangeTypeConfig } from "@/lib/types";
import {
  generateMermaidFlowchart,
  formatCurrency,
  formatLeadDays,
  formatCategoryLabel,
} from "@/lib/change-type-catalog";
import { MermaidRenderer } from "@/components/mermaid-renderer";

type Props = {
  config: ChangeTypeConfig;
  startHref?: string;
};

/**
 * A change type catalog card.
 *
 * Shows the change type name, description, category, cost, SLA,
 * stakeholder info, and an embedded mermaid process flow diagram.
 * Click "Start" to initiate a change of this type.
 */
export function ChangeTypeCard({ config, startHref = `/changes/new?type=${config.slug}` }: Props) {
  const mermaidDefinition = generateMermaidFlowchart(config);
  const hasCostInfo = config.cost.baseCost > 0 || (config.cost.perItemCost ?? 0) > 0;

  return (
    <article
      className="change-type-card"
      aria-label={config.name}
    >
      {/* Header */}
      <div className="change-type-card-header">
        <div>
          <span className="change-type-badge">{formatCategoryLabel(config.category)}</span>
          <h3>
            <Link href={`/change-catalog/${config.slug}`} className="change-type-title-link">
              {config.name}
            </Link>
          </h3>
        </div>
        <span className="change-type-sla">{formatLeadDays(config.defaultLeadDays)}</span>
      </div>

      {/* Description */}
      <p className="change-type-desc">{config.description}</p>

      {/* Cost info */}
      {hasCostInfo && (
        <div className="change-type-cost">
          <span>Vanaf {formatCurrency(config.cost.baseCost, config.cost.costCurrency)}</span>
          {config.cost.perItemCost && (
            <span className="change-type-cost-detail">
              + {formatCurrency(config.cost.perItemCost, config.cost.costCurrency)} per portefeuille
            </span>
          )}
        </div>
      )}

      {/* Stakeholders */}
      {config.stakeholders.length > 0 && (
        <div className="change-type-stakeholders">
          <span className="change-type-stakeholder-label">Betrokkenen:</span>
          <div className="change-type-stakeholder-chips">
            {config.stakeholders.map((s) => (
              <span key={s.id} className="stakeholder-chip">
                {s.mandatory ? "" : "opt. "}{s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mermaid process flow */}
      <div className="change-type-flowchart">
        <MermaidRenderer definition={mermaidDefinition} />
      </div>

      {/* CTA button */}
      <div className="change-type-cta">
        <Link
          href={startHref}
          className="button button-primary"
        >
          Start {config.name.toLowerCase()} →
        </Link>
      </div>
    </article>
  );
}
