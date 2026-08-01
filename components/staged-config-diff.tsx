/**
 * StagedConfigDiff — renders staged change_portfolio_configuration rows
 * on the change detail page.
 *
 * For each staged row, shows:
 *   - Action type (Aanmaken / Wijzigen / Beëindigen)
 *   - Target row identity (primaryAccountId derived from dimension codes)
 *   - Field-level IST (current value) / SOLL (target value) columns
 *   - Apply outcome (status badge, error message, result) when the
 *     row has been processed via applyChangePortfolioConfigurations()
 *
 * Follows the existing diff-section layout pattern from the change detail page.
 */
import type { ReactNode } from "react";

type StagedPortfolioConfigRow = {
  id: number;
  changeRequestId: string;
  actionType: string;
  /** Original primary_account_id of the live row this change targets (null for CREATE). */
  targetPrimaryAccountId: string | null;
  clientCode: string;
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  applyStatus: string | null;
  applyError: string | null;
};

type Props = {
  rows: StagedPortfolioConfigRow[];
  /** Optional render function for per-row actions (e.g. edit buttons). */
  renderRowActions?: (row: StagedPortfolioConfigRow) => React.ReactNode;
};

/** Translate action type to a human-readable Dutch label. */
function actionLabel(actionType: string): { label: string; className: string } {
  switch (actionType) {
    case "CREATE":
      return { label: "Aanmaken", className: "staged-action-create" };
    case "UPDATE":
      return { label: "Wijzigen", className: "staged-action-update" };
    case "DELETE":
      return { label: "Beëindigen", className: "staged-action-delete" };
    default:
      return { label: actionType, className: "" };
  }
}

/** Build a display-ready primaryAccountId from the dimension codes. */
function buildDisplayIdentity(row: StagedPortfolioConfigRow): string {
  // Format: CLIENT-ASSETCLASS-SUBASSET-MANAGER (uppercase, hyphen-separated)
  const subs = row.subAssetClassCode && row.subAssetClassCode !== "" ? row.subAssetClassCode : "—";
  return `${row.clientCode}-${row.assetClassCode}-${subs}-${row.managerCode}`;
}

/**
 * Render an apply outcome badge showing the result of applyChangePortfolioConfigurations.
 * Returns null when the row has not yet been processed (applyStatus is null).
 */
function ApplyOutcomeBadge({ status, error }: { status: string; error: string | null }) {
  let label: string;
  let className: string;
  let icon: string;

  switch (status) {
    case "applied":
      label = "Toegepast";
      className = "apply-outcome-applied";
      icon = "✓";
      break;
    case "skipped":
      label = "Overgeslagen";
      className = "apply-outcome-skipped";
      icon = "⏭";
      break;
    case "failed":
      label = "Mislukt";
      className = "apply-outcome-failed";
      icon = "✗";
      break;
    default:
      return null;
  }

  return (
    <div className={`apply-outcome-badge ${className}`} role="status" aria-live="polite">
      <span className="apply-outcome-icon">{icon}</span>
      <span className="apply-outcome-label">{label}</span>
      {error && <span className="apply-outcome-error">{error}</span>}
    </div>
  );
}

/**
 * Define all dimension fields in display order, with labels and value
 * formatters. IST and SOLL are rendered per-field in columns.
 */
const DIMENSION_FIELDS: Array<{
  key: string;
  label: string;
  formatIst: (row: StagedPortfolioConfigRow) => string;
  formatSoll: (row: StagedPortfolioConfigRow) => string;
}> = [
  {
    key: "portfolio_code",
    label: "Portfolio",
    formatIst: () => "—",
    formatSoll: (r) => r.portfolioCode,
  },
  {
    key: "client_code",
    label: "Client",
    formatIst: () => "—",
    formatSoll: (r) => r.clientCode,
  },
  {
    key: "asset_class_code",
    label: "Asset class",
    formatIst: () => "—",
    formatSoll: (r) => `${r.assetClassCode}`,
  },
  {
    key: "sub_asset_class_code",
    label: "Sub asset class",
    formatIst: () => "—",
    formatSoll: (r) => r.subAssetClassCode || "—",
  },
  {
    key: "manager_code",
    label: "Manager",
    formatIst: () => "—",
    formatSoll: (r) => r.managerCode,
  },
  {
    key: "benchmark_code",
    label: "Benchmark",
    formatIst: () => "—",
    formatSoll: (r) => r.benchmarkCode || "—",
  },
  {
    key: "npc_classification_id",
    label: "NPC classificatie",
    formatIst: () => "—",
    formatSoll: (r) => String(r.npcClassificationId),
  },
  {
    key: "long_name",
    label: "Lange naam",
    formatIst: () => "—",
    formatSoll: (r) => r.longName,
  },
  {
    key: "short_name",
    label: "Korte naam",
    formatIst: () => "—",
    formatSoll: (r) => r.shortName,
  },
  {
    key: "effective_from",
    label: "Ingangsdatum",
    formatIst: () => "—",
    formatSoll: (r) => new Date(r.effectiveFrom).toLocaleDateString("nl-NL", { dateStyle: "long" }),
  },
  {
    key: "effective_until",
    label: "Einddatum",
    formatIst: () => "—",
    formatSoll: (r) =>
      r.effectiveUntil
        ? new Date(r.effectiveUntil).toLocaleDateString("nl-NL", { dateStyle: "long" })
        : "Onbepaald",
  },
];

export function StagedConfigDiff({ rows, renderRowActions }: Props) {
  if (rows.length === 0) return null;

  return (
    <section className="diff-section staged-config-section" aria-label="Client-configuratie wijzigingen">
      <div className="diff-heading">
        <div>
          <p className="eyebrow">CLIENT-CONFIGURATIE</p>
          <h2>IST / SOLL</h2>
        </div>
        <p>
          Gestagede wijzigingen op de portfolioconfiguratie. Deze worden pas
          doorgevoerd nadat de change is verwerkt.
        </p>
      </div>
      <div className="git-diff">
        <div className="diff-file">client-config/change.yaml</div>
        {rows.map((row) => {
          const { label: actionLabelText, className: actionClass } = actionLabel(row.actionType);
          const identity = buildDisplayIdentity(row);
          return (
            <div className="staged-row" key={row.id}>
              {/* Row header: action badge + target identity */}
              <div className="staged-row-header">
                <span className={`staged-action-badge ${actionClass}`}>{actionLabelText}</span>
                <code className="staged-identity">{identity}</code>
                <span className="staged-portfolio-label">{row.portfolioCode}</span>
                {renderRowActions && (
                  <span className="staged-row-actions">{renderRowActions(row)}</span>
                )}
              </div>

              {/* Apply outcome banner — shown on processed changes */}
              {row.applyStatus && (
                <ApplyOutcomeBadge status={row.applyStatus} error={row.applyError} />
              )}

              {/* Field-level IST / SOLL table */}
              <div className="staged-fields">
                {DIMENSION_FIELDS.map((field) => {
                  const istValue = field.formatIst(row);
                  const sollValue = field.formatSoll(row);
                  const hasDiff = istValue !== sollValue;

                  return (
                    <div className="staged-field-row" key={field.key}>
                      <span className="staged-field-label">{field.label}</span>
                      <div className="staged-field-values">
                        <div className={`staged-ist-value ${!hasDiff ? "staged-value-unchanged" : ""}`}>
                          {istValue}
                        </div>
                        <div className="staged-arrow">→</div>
                        <div className={`staged-soll-value ${hasDiff ? "staged-value-changed" : ""}`}>
                          {sollValue}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
