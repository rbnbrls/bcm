/**
 * Retirement-intent helpers for the change request detail view, audit trail
 * and PDF export.
 *
 * A retirement (beëindiging) change is a governed DELETE change request on a
 * portfolio configuration: `deletePortfolioConfigurationAction` stages a
 * DELETE row on `client_config.change_portfolio_configuration` (change type
 * slug `portfolio_configuration_retire`) and the live row is only
 * deactivated (`active_ind = false`, `effective_until` set) once the change
 * is approved and processed. These helpers let every surface that renders a
 * change request detect that intent and display it unambiguously —
 * including the audit sentence "Portefeuilleconfiguratie X beëindigd per Y"
 * (acceptance: audit logs show "Retired portfolio configuration X effective Y").
 */
import type { ChangeRequest } from "@/lib/types";

export const RETIRE_CHANGE_TYPE_SLUG = "portfolio_configuration_retire";
export const RETIRE_ACTION_TYPE = "DELETE";
/** Dutch title used on the change detail header for a retirement change. */
export const RETIRE_TITLE = "Portefeuilleconfiguratie beëindigen";

export type RetirementRow = NonNullable<
  ChangeRequest["changePortfolioConfigurations"]
>[number];

/** The subset of ChangeRequest the retirement helpers operate on. */
export type RetirementRequest = Pick<
  ChangeRequest,
  "changeType" | "changePortfolioConfigurations" | "fields" | "effectiveDate"
>;

/**
 * True when the change request is a retirement: either staged under the
 * dedicated `portfolio_configuration_retire` slug or carrying a staged
 * DELETE row (backward compatible with the legacy `portfolio_addition` slug).
 */
export function isRetirementChange(request: RetirementRequest): boolean {
  return (
    request.changeType === RETIRE_CHANGE_TYPE_SLUG ||
    (request.changePortfolioConfigurations ?? []).some(
      (row) => row.actionType === RETIRE_ACTION_TYPE,
    )
  );
}

/**
 * The staged row this retirement targets: the DELETE row when present, else
 * the first staged row (fallback for legacy data), else null.
 */
export function getRetirementRow(
  request: RetirementRequest,
): RetirementRow | null {
  const rows = request.changePortfolioConfigurations ?? [];
  return rows.find((row) => row.actionType === RETIRE_ACTION_TYPE) ?? rows[0] ?? null;
}

/**
 * Human-readable identity of the target portfolio configuration, e.g.
 * `HOR-EQ-DEV-EIG` (CLIENT-ASSETCLASS-SUBASSET-MANAGER — the same identity
 * the staged-config diff renders). Falls back to the staged generic fields
 * (portfolio_code / long_name) and finally to "—".
 */
export function formatRetirementTarget(request: RetirementRequest): string {
  const row = getRetirementRow(request);
  if (row) {
    const subs =
      row.subAssetClassCode && row.subAssetClassCode !== ""
        ? row.subAssetClassCode
        : "—";
    return `${row.clientCode}-${row.assetClassCode}-${subs}-${row.managerCode}`;
  }
  const fields = request.fields ?? [];
  const portfolioCode = fields.find((f) => f.fieldKey === "portfolio_code")?.sollValue;
  const longName = fields.find((f) => f.fieldKey === "long_name")?.sollValue;
  const fallback = portfolioCode ?? longName;
  return fallback != null ? String(fallback) : "—";
}

/** Portfolio code of the target configuration (or "—" when unavailable). */
export function getRetirementPortfolioCode(request: RetirementRequest): string {
  const row = getRetirementRow(request);
  if (row?.portfolioCode) return row.portfolioCode;
  const fields = request.fields ?? [];
  const portfolioCode = fields.find((f) => f.fieldKey === "portfolio_code")?.sollValue;
  return portfolioCode != null ? String(portfolioCode) : "—";
}

/** Long display name of the target configuration (or "—"). */
export function getRetirementLongName(request: RetirementRequest): string {
  const row = getRetirementRow(request);
  if (row?.longName) return row.longName;
  const fields = request.fields ?? [];
  const longName = fields.find((f) => f.fieldKey === "long_name")?.sollValue;
  return longName != null ? String(longName) : "—";
}

/** Format an ISO date string as a long Dutch date (same convention as the detail page). */
export function formatRetirementDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(
      new Date(dateStr),
    );
  } catch {
    return dateStr;
  }
}

/**
 * The audit sentence for a retirement change:
 * "Portefeuilleconfiguratie X beëindigd per Y" (Dutch UI rendering of the
 * acceptance phrase "Retired portfolio configuration X effective Y").
 */
export function formatRetirementAuditMessage(
  request: RetirementRequest,
): string {
  return `Portefeuilleconfiguratie ${formatRetirementTarget(
    request,
  )} beëindigd per ${formatRetirementDate(request.effectiveDate)}`;
}
