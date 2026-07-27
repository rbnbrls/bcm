/**
 * Portfolio field validation — assetClass / subAssetClass pair validation.
 *
 * Uses the authoritative hierarchy in @/lib/asset-classes to ensure that
 * sub-asset-class values are valid for their parent asset class.
 *
 * Exported functions:
 *   - validatePortfolioAssetClass(assetClass)      — asset class is required & known
 *   - validatePortfolioSubAssetClass(subAssetClass) — sub-asset-class is non-empty
 *   - validateAssetSubClassPair(assetClass, subAssetClass)
 *       — combined check that subAssetClass is valid for assetClass
 *   - validatePortfolioFields({assetClass, subAssetClass})
 *       — all-of-the-above, returns array of error strings
 */

import { getSubClasses, ASSET_CLASS_KEYS } from "@/lib/asset-classes";

export type ValidationResult = { valid: true } | { valid: false; errors: string[] };

/**
 * Validate that assetClass is a known, non-empty asset class key.
 */
export function validatePortfolioAssetClass(assetClass: string): ValidationResult {
  const trimmed = assetClass.trim();
  if (!trimmed) {
    return { valid: false, errors: ["Asset class is verplicht."] };
  }
  if (!ASSET_CLASS_KEYS.includes(trimmed as any)) {
    return {
      valid: false,
      errors: [
        `"${trimmed}" is geen geldige asset class. Kies een van: ${ASSET_CLASS_KEYS.join(", ")}.`,
      ],
    };
  }
  return { valid: true };
}

/**
 * Validate that subAssetClass is non-empty (format-level check).
 * Does NOT check against the asset class hierarchy; use
 * validateAssetSubClassPair for that.
 */
export function validatePortfolioSubAssetClass(subAssetClass: string): ValidationResult {
  if (!subAssetClass.trim()) {
    return { valid: false, errors: ["Sub asset class is verplicht."] };
  }
  return { valid: true };
}

/**
 * Validate that `subAssetClass` is one of the allowed sub-classes for
 * the given `assetClass`.  Assumes assetClass has already been validated
 * as a known key (call validatePortfolioAssetClass first).
 */
export function validateAssetSubClassPair(assetClass: string, subAssetClass: string): ValidationResult {
  const validSubs = getSubClasses(assetClass);
  if (!validSubs) {
    // assetClass not recognised — let the asset-class validator handle this
    return { valid: false, errors: [`"${assetClass}" is geen geldige asset class.`] };
  }
  if (!subAssetClass.trim()) {
    return { valid: false, errors: ["Sub asset class is verplicht."] };
  }
  if (!validSubs.includes(subAssetClass.trim())) {
    return {
      valid: false,
      errors: [
        `"${subAssetClass}" is geen geldige sub asset class voor "${assetClass}". ` +
        `Kies een van: ${[...validSubs].join(", ")}.`,
      ],
    };
  }
  return { valid: true };
}

/**
 * One-shot validation covering all portfolio field rules:
 *   1. assetClass is required and known
 *   2. subAssetClass is required
 *   3. subAssetClass is valid for the given assetClass
 *
 * Returns an array of error messages (empty array → valid).
 */
export function validatePortfolioFields(fields: {
  assetClass?: string | null;
  subAssetClass?: string | null;
}): string[] {
  const errors: string[] = [];

  const ac = fields.assetClass?.trim() ?? "";
  const sac = fields.subAssetClass?.trim() ?? "";

  // 1. assetClass required
  if (!ac) {
    errors.push("Asset class is verplicht.");
  } else if (!ASSET_CLASS_KEYS.includes(ac as any)) {
    errors.push(`"${ac}" is geen geldige asset class. Kies een van: ${ASSET_CLASS_KEYS.join(", ")}.`);
  }

  // 2. subAssetClass required
  if (!sac) {
    errors.push("Sub asset class is verplicht.");
  }

  // 3. Pair validation (only if both are provided and asset class is known)
  if (ac && sac && ASSET_CLASS_KEYS.includes(ac as any)) {
    const validSubs = getSubClasses(ac);
    if (validSubs && !validSubs.includes(sac)) {
      errors.push(
        `"${sac}" is geen geldige sub asset class voor "${ac}". ` +
        `Kies een van: ${[...validSubs].join(", ")}.`,
      );
    }
  }

  return errors;
}
