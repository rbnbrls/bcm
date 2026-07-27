/**
 * Static configuration for asset class and sub asset class hierarchy.
 *
 * This file is the single source of truth for validation and UI dropdowns.
 * The hierarchy below was provided by domain experts and maps each asset class
 * to its valid sub asset classes.
 *
 * Usage:
 *   import { ASSET_CLASS_SUB_CLASSES, isSubClassValid, getSubClasses } from "@/lib/asset-classes";
 */

// ── Asset class keys (the 8 domain-standard classes) ────────────────────────

export type AssetClassKey =
  | "CASH"
  | "EQUITIES"
  | "ALTERNATIVES"
  | "REAL_ASSETS"
  | "FIXED_INCOME"
  | "MULTI_ASSETS"
  | "OVERLAY"
  | "IMPACT";

/** Ordered list of all asset class keys. */
export const ASSET_CLASS_KEYS: AssetClassKey[] = [
  "CASH",
  "EQUITIES",
  "ALTERNATIVES",
  "REAL_ASSETS",
  "FIXED_INCOME",
  "MULTI_ASSETS",
  "OVERLAY",
  "IMPACT",
];

// ── Sub asset class union type ──────────────────────────────────────────────

export type CashSubClass = "CASH" | "FUNDS" | "LIQUIDITIES";
export type EquitiesSubClass =
  | "DEVELOPED MARKETS"
  | "DEVELOPED MARKETS FACTOR"
  | "DEVELOPED MARKETS SMALL CAP"
  | "EMERGING MARKETS"
  | "AC WORLD"
  | "EUROPE"
  | "JAPAN"
  | "ASIA EX-JAPAN"
  | "UNITED STATES"
  | "NORTH AMERICA"
  | "DUURZAAM"
  | "MILIEU & WATER"
  | "BIODIVERSITY"
  | "FUNDS"
  | "EMERGING MARKETS FACTOR"
  | "AC WORLD FACTOR";
export type AlternativesSubClass =
  | "PRIVATE EQUITY"
  | "HEDGE FUNDS"
  | "PRIVATE EQUITY IMPACT"
  | "HEDGE FUNDS CTA"
  | "HEDGE FUNDS GLOBAL MACRO"
  | "INFLATION LINKED SECURITIES"
  | "GOLD"
  | "RISK PARITY"
  | "RISK PREMIA";
export type RealAssetsSubClass =
  | "AGRICULTURE"
  | "COMMODITIES"
  | "INFRASTRUCTURE"
  | "REALESTATE LISTED"
  | "REALESTATE DIRECT"
  | "REALESTATE NON-LISTED NETHERLANDS"
  | "REALESTATE NON-LISTED INTERNATIONAL"
  | "REALESTATE NON-LISTED EUROPE"
  | "REALESTATE NON-LISTED ASIA PACIFIC"
  | "REALESTATE NON-LISTED NORTH AMERICA"
  | "FORESTRY";
export type FixedIncomeSubClass =
  | "ASSET BACKED SECURITIES"
  | "BANKLOANS"
  | "BIODIVERSITY"
  | "CONVERTABLES"
  | "CLO (COLLATERALIZED LOAN OBLIGATION)"
  | "CORPORATES EUROPE"
  | "CREDITS EUROPE"
  | "CREDITS GLOBAL"
  | "CREDITS USA"
  | "DEBT HY MICRO FINANCIERING"
  | "DEBT IG ECA LOANS"
  | "DEBT IG WSW LOANS"
  | "DUURZAAM"
  | "EMERGING MARKETS BLEND"
  | "EMERGING MARKETS HC"
  | "EMERGING MARKETS LC"
  | "FUNDS"
  | "GREENBONDS"
  | "HIGH YIELD EUROPE"
  | "HIGH YIELD GLOBAL"
  | "HIGH YIELD USA"
  | "INFLATION LINKED BONDS EUROPE"
  | "INFLATION LINKED BONDS GLOBAL"
  | "LDI"
  | "LIQUID INVESTMENTS (MONEY MARKET)"
  | "LIQUIDITIES"
  | "MORTGAGES"
  | "OVERLAYFUNDS"
  | "PRIVATE LOANS"
  | "SECURITIZED"
  | "SOCIAL"
  | "SOVEREIGN EUROPE"
  | "SOVEREIGN GLOBAL";
export type MultiAssetsSubClass =
  | "DEFENSIVE"
  | "VERY DEFENSIVE"
  | "NEUTRAL"
  | "OFFENSIVE"
  | "VERY OFFENSIVE"
  | "MIX";
export type OverlaySubClass =
  | "INTEREST"
  | "CURRENCY"
  | "INFLATION"
  | "EQUITY"
  | "FUNDS";
export type ImpactSubClass =
  | "EQUITIES"
  | "FIXED INCOME DEBT"
  | "PRIVATE EQUITY"
  | "REALESTATE"
  | "AGRICULTURE"
  | "INFRASTRUCTURE"
  | "CLIMATE"
  | "FORESTRY";

export type SubAssetClass =
  | CashSubClass
  | EquitiesSubClass
  | AlternativesSubClass
  | RealAssetsSubClass
  | FixedIncomeSubClass
  | MultiAssetsSubClass
  | OverlaySubClass
  | ImpactSubClass;

// ── Hierarchy map ──────────────────────────────────────────────────────────

/**
 * Maps each asset class to its valid sub asset classes.
 * This is the authoritative reference for validation and UI dropdowns.
 */
export const ASSET_CLASS_SUB_CLASSES: Record<AssetClassKey, readonly string[]> = {
  CASH: ["CASH", "FUNDS", "LIQUIDITIES"],
  EQUITIES: [
    "DEVELOPED MARKETS",
    "DEVELOPED MARKETS FACTOR",
    "DEVELOPED MARKETS SMALL CAP",
    "EMERGING MARKETS",
    "AC WORLD",
    "EUROPE",
    "JAPAN",
    "ASIA EX-JAPAN",
    "UNITED STATES",
    "NORTH AMERICA",
    "DUURZAAM",
    "MILIEU & WATER",
    "BIODIVERSITY",
    "FUNDS",
    "EMERGING MARKETS FACTOR",
    "AC WORLD FACTOR",
  ],
  ALTERNATIVES: [
    "PRIVATE EQUITY",
    "HEDGE FUNDS",
    "PRIVATE EQUITY IMPACT",
    "HEDGE FUNDS CTA",
    "HEDGE FUNDS GLOBAL MACRO",
    "INFLATION LINKED SECURITIES",
    "GOLD",
    "RISK PARITY",
    "RISK PREMIA",
  ],
  REAL_ASSETS: [
    "AGRICULTURE",
    "COMMODITIES",
    "INFRASTRUCTURE",
    "REALESTATE LISTED",
    "REALESTATE DIRECT",
    "REALESTATE NON-LISTED NETHERLANDS",
    "REALESTATE NON-LISTED INTERNATIONAL",
    "REALESTATE NON-LISTED EUROPE",
    "REALESTATE NON-LISTED ASIA PACIFIC",
    "REALESTATE NON-LISTED NORTH AMERICA",
    "FORESTRY",
  ],
  FIXED_INCOME: [
    "ASSET BACKED SECURITIES",
    "BANKLOANS",
    "BIODIVERSITY",
    "CONVERTABLES",
    "CLO (COLLATERALIZED LOAN OBLIGATION)",
    "CORPORATES EUROPE",
    "CREDITS EUROPE",
    "CREDITS GLOBAL",
    "CREDITS USA",
    "DEBT HY MICRO FINANCIERING",
    "DEBT IG ECA LOANS",
    "DEBT IG WSW LOANS",
    "DUURZAAM",
    "EMERGING MARKETS BLEND",
    "EMERGING MARKETS HC",
    "EMERGING MARKETS LC",
    "FUNDS",
    "GREENBONDS",
    "HIGH YIELD EUROPE",
    "HIGH YIELD GLOBAL",
    "HIGH YIELD USA",
    "INFLATION LINKED BONDS EUROPE",
    "INFLATION LINKED BONDS GLOBAL",
    "LDI",
    "LIQUID INVESTMENTS (MONEY MARKET)",
    "LIQUIDITIES",
    "MORTGAGES",
    "OVERLAYFUNDS",
    "PRIVATE LOANS",
    "SECURITIZED",
    "SOCIAL",
    "SOVEREIGN EUROPE",
    "SOVEREIGN GLOBAL",
  ],
  MULTI_ASSETS: [
    "DEFENSIVE",
    "VERY DEFENSIVE",
    "NEUTRAL",
    "OFFENSIVE",
    "VERY OFFENSIVE",
    "MIX",
  ],
  OVERLAY: [
    "INTEREST",
    "CURRENCY",
    "INFLATION",
    "EQUITY",
    "FUNDS",
  ],
  IMPACT: [
    "EQUITIES",
    "FIXED INCOME DEBT",
    "PRIVATE EQUITY",
    "REALESTATE",
    "AGRICULTURE",
    "INFRASTRUCTURE",
    "CLIMATE",
    "FORESTRY",
  ],
} as const;

// ── Helper types & functions ───────────────────────────────────────────────

/** All sub asset class values flattened into a sorted array. */
export const ALL_SUB_ASSET_CLASSES: readonly string[] = Object.values(
  ASSET_CLASS_SUB_CLASSES,
).flat();

/**
 * Returns the valid sub asset classes for a given asset class, or undefined if
 * the asset class is unknown.
 */
export function getSubClasses(
  assetClass: string,
): readonly string[] | undefined {
  return ASSET_CLASS_SUB_CLASSES[assetClass as AssetClassKey];
}

/**
 * Checks whether `subClass` is a valid sub asset class for the given `assetClass`.
 * Returns false if the asset class is unknown.
 */
export function isSubClassValid(
  assetClass: string,
  subClass: string,
): boolean {
  const valid = getSubClasses(assetClass);
  if (!valid) return false;
  return valid.includes(subClass);
}

/**
 * Finds which asset class(es) a sub asset class value belongs to.
 * A sub class may belong to exactly one asset class in the standard hierarchy,
 * but this function returns an array for safety.
 */
export function findAssetClassForSubClass(
  subClass: string,
): AssetClassKey[] {
  const result: AssetClassKey[] = [];
  for (const [key, subClasses] of Object.entries(ASSET_CLASS_SUB_CLASSES)) {
    if (subClasses.includes(subClass)) {
      result.push(key as AssetClassKey);
    }
  }
  return result;
}
