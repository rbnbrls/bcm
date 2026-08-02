import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

/**
 * Edit-permission rules for rows in the /admin/client-config table.
 *
 * The admin client-config page is the operator-facing read view over
 * client_config.portfolio_configuration. All mutations go through the BCM
 * change-management workflow (stage → approve → apply), never directly.
 *
 * A row is editable when the operator has permission to open the update
 * wizard for it. In the absence of a user/role system the permission is
 * data-driven:
 *
 *   - `activeInd === true` — the row is the operative configuration line
 *     (effective_until is null). Editing targets the ACTIVE row and produces
 *     a successor row via an UPDATE change request. Inactive rows are
 *     closed-out history and must not be edited.
 *
 * Callers may pass a stronger per-user predicate into the table via the
 * `canEditRow` prop (e.g. once an auth/role layer exists); this helper is
 * the default rule and the single source of truth for the base rule.
 */
export function canEditClientConfigRow(
  row: Pick<ClientConfigPortfolioConfigurationRow, "activeInd">,
): boolean {
  return row.activeInd === true;
}
