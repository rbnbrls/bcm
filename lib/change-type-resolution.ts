/**
 * Change type slug resolution with backward compatibility.
 *
 * The client-config lifecycle taxonomy replaces the legacy
 * `portfolio_addition` slug with three explicit slugs:
 *
 *   - portfolio_configuration_create  (CREATE)
 *   - portfolio_configuration_update  (UPDATE)
 *   - portfolio_configuration_retire  (RETIRE/DELETE)
 *
 * The new slugs are seeded into the change type catalog by a catalog
 * migration. Until a given explicit slug exists in the catalog, code that
 * stages client-config changes falls back to the legacy `portfolio_addition`
 * slug so existing flows and stored requests keep working unchanged.
 *
 * This module is the single place that encodes the fallback, so the
 * migration path is: once the new slug is seeded, the same code starts
 * staging under the explicit slug automatically — no further change needed.
 */

import { getChangeTypeBySlug } from "@/lib/db";

/** Legacy slug kept for backward compatibility. */
export const LEGACY_PORTFOLIO_SLUG = "portfolio_addition";

/** Slugs that render the portfolio create wizard (PortfolioAdditionForm). */
export const PORTFOLIO_CREATE_WIZARD_SLUGS = [
  LEGACY_PORTFOLIO_SLUG,
  "portfolio_configuration_create",
] as const;

/**
 * True when the slug is one of the slugs that render the portfolio create
 * wizard. Used by the create server action to reject unknown slugs while
 * still accepting the legacy slug.
 */
export function isPortfolioCreateWizardSlug(slug: string | undefined): slug is string {
  return slug !== undefined && (PORTFOLIO_CREATE_WIZARD_SLUGS as readonly string[]).includes(slug);
}

/**
 * Resolve the change type slug to use for staging a client-config change.
 *
 * Prefers the explicit lifecycle slug; falls back to the legacy
 * `portfolio_addition` slug when the explicit slug is not (yet) present in
 * the change type catalog. The returned slug is guaranteed to resolve to a
 * real catalog config (or the fallback slug when even that is missing —
 * callers must still handle a null config from getChangeTypeBySlug).
 *
 * @param preferredSlug The explicit lifecycle slug to use when available.
 * @param fallbackSlug  Legacy slug to fall back to (default portfolio_addition).
 */
export async function resolveChangeTypeSlugWithFallback(
  preferredSlug: string,
  fallbackSlug: string = LEGACY_PORTFOLIO_SLUG,
): Promise<string> {
  if (preferredSlug === fallbackSlug) return fallbackSlug;
  const config = await getChangeTypeBySlug(preferredSlug);
  return config && config.slug === preferredSlug ? preferredSlug : fallbackSlug;
}
