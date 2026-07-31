/**
 * Static configuration for asset class and sub asset class hierarchy.
 *
 * This file is the single source of truth for validation, seed data and UI
 * dropdowns. Values are copied exactly from the supplied domain source data.
 */

export type AssetClassHierarchyRecord = {
  assetClass: string;
  subAssetClass: string | null;
  sortOrder: number | null;
};

export const ASSET_CLASS_HIERARCHY = [
  { assetClass: "CASH", subAssetClass: "CASH", sortOrder: 1 },
  { assetClass: "CASH", subAssetClass: "FUNDS", sortOrder: 2 },
  { assetClass: "CASH", subAssetClass: "LIQUIDITIES", sortOrder: 3 },
  { assetClass: "ALTERNATIVES", subAssetClass: "PRIVATE EQUITY", sortOrder: 1 },
  { assetClass: "ALTERNATIVES", subAssetClass: "HEDGE FUNDS", sortOrder: 2 },
  { assetClass: "ALTERNATIVES", subAssetClass: "PRIVATE EQUITY IMPACT", sortOrder: 3 },
  { assetClass: "ALTERNATIVES", subAssetClass: "HEDGE FUNDS CTA", sortOrder: 4 },
  { assetClass: "ALTERNATIVES", subAssetClass: "HEDGE FUNDS GLOBAL MACRO", sortOrder: 5 },
  { assetClass: "ALTERNATIVES", subAssetClass: "INFLATION LINKED SECURITIES", sortOrder: 6 },
  { assetClass: "ALTERNATIVES", subAssetClass: "GOLD", sortOrder: 7 },
  { assetClass: "ALTERNATIVES", subAssetClass: "RISK PARITY", sortOrder: 8 },
  { assetClass: "ALTERNATIVES", subAssetClass: "RISK PREMIA", sortOrder: 9 },
  { assetClass: "EQUITIES", subAssetClass: "DEVELOPED MARKETS", sortOrder: 1 },
  { assetClass: "EQUITIES", subAssetClass: "DEVELOPED MARKETS FACTOR", sortOrder: 2 },
  { assetClass: "EQUITIES", subAssetClass: "DEVELOPED MARKETS SMALL CAP", sortOrder: 3 },
  { assetClass: "EQUITIES", subAssetClass: "EMERGING MARKETS", sortOrder: 4 },
  { assetClass: "EQUITIES", subAssetClass: "AC WORLD", sortOrder: 5 },
  { assetClass: "EQUITIES", subAssetClass: "EUROPE", sortOrder: 6 },
  { assetClass: "EQUITIES", subAssetClass: "JAPAN", sortOrder: 7 },
  { assetClass: "EQUITIES", subAssetClass: "ASIA EX-JAPAN", sortOrder: 8 },
  { assetClass: "EQUITIES", subAssetClass: "UNITED STATES", sortOrder: 9 },
  { assetClass: "EQUITIES", subAssetClass: "NORTH AMERICA", sortOrder: 10 },
  { assetClass: "EQUITIES", subAssetClass: "DUURZAAM", sortOrder: 11 },
  { assetClass: "EQUITIES", subAssetClass: "MILIEU & WATER", sortOrder: 12 },
  { assetClass: "EQUITIES", subAssetClass: "BIODIVERSITY", sortOrder: 13 },
  { assetClass: "EQUITIES", subAssetClass: "FUNDS", sortOrder: 14 },
  { assetClass: "EQUITIES", subAssetClass: "EMERGING MARKETS FACTOR", sortOrder: 15 },
  { assetClass: "EQUITIES", subAssetClass: "AC WORLD FACTOR", sortOrder: 16 },
  { assetClass: "FIXED_INCOME", subAssetClass: "ASSET BACKED SECURITIES", sortOrder: 1 },
  { assetClass: "FIXED_INCOME", subAssetClass: "BANKLOANS", sortOrder: 2 },
  { assetClass: "FIXED_INCOME", subAssetClass: "BIODIVERSITY", sortOrder: 3 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CONVERTABLES", sortOrder: 4 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CLO (COLLATERALIZED LOAN OBLIGATION)", sortOrder: 5 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CORPORATES EUROPE", sortOrder: 6 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CREDITS EUROPE", sortOrder: 7 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CREDITS GLOBAL", sortOrder: 8 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CREDITS USA", sortOrder: 9 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DEBT HY MICRO FINANCIERING", sortOrder: 10 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DEBT IG ECA LOANS", sortOrder: 11 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DEBT IG WSW LOANS", sortOrder: 12 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DUURZAAM", sortOrder: 13 },
  { assetClass: "FIXED_INCOME", subAssetClass: "EMERGING MARKETS BLEND", sortOrder: 14 },
  { assetClass: "FIXED_INCOME", subAssetClass: "EMERGING MARKETS HC", sortOrder: 15 },
  { assetClass: "FIXED_INCOME", subAssetClass: "EMERGING MARKETS LC", sortOrder: 16 },
  { assetClass: "FIXED_INCOME", subAssetClass: "FUNDS", sortOrder: 17 },
  { assetClass: "FIXED_INCOME", subAssetClass: "GREENBONDS", sortOrder: 18 },
  { assetClass: "FIXED_INCOME", subAssetClass: "HIGH YIELD EUROPE", sortOrder: 19 },
  { assetClass: "FIXED_INCOME", subAssetClass: "HIGH YIELD GLOBAL", sortOrder: 20 },
  { assetClass: "FIXED_INCOME", subAssetClass: "HIGH YIELD USA", sortOrder: 21 },
  { assetClass: "FIXED_INCOME", subAssetClass: "INFLATION LINKED BONDS EUROPE", sortOrder: 22 },
  { assetClass: "FIXED_INCOME", subAssetClass: "INFLATION LINKED BONDS GLOBAL", sortOrder: 23 },
  { assetClass: "FIXED_INCOME", subAssetClass: "LDI", sortOrder: 24 },
  { assetClass: "FIXED_INCOME", subAssetClass: "LIQUID INVESTMENTS (MONEY MARKET)", sortOrder: 25 },
  { assetClass: "FIXED_INCOME", subAssetClass: "LIQUIDITIES", sortOrder: 26 },
  { assetClass: "FIXED_INCOME", subAssetClass: "MORTGAGES", sortOrder: 27 },
  { assetClass: "FIXED_INCOME", subAssetClass: "OVERLAYFUNDS", sortOrder: 28 },
  { assetClass: "FIXED_INCOME", subAssetClass: "PRIVATE LOANS", sortOrder: 29 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SECURITIZED", sortOrder: 30 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SOCIAL", sortOrder: 31 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SOVEREIGN EUROPE", sortOrder: 32 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SOVEREIGN GLOBAL", sortOrder: 33 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CORPORATES GLOBAL", sortOrder: 34 },
  { assetClass: "FIXED_INCOME", subAssetClass: "CORPORATES USA", sortOrder: 35 },
  { assetClass: "FIXED_INCOME", subAssetClass: "COVERED BONDS EUROPE", sortOrder: 36 },
  { assetClass: "FIXED_INCOME", subAssetClass: "COVERED BONDS GLOBAL", sortOrder: 37 },
  { assetClass: "FIXED_INCOME", subAssetClass: "COVERED BONDS USA", sortOrder: 38 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DEBT HY DIRECT LOANS", sortOrder: 39 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DEBT HY INFRASTRUCTURE", sortOrder: 40 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DEBT IG OVERIG", sortOrder: 41 },
  { assetClass: "FIXED_INCOME", subAssetClass: "DEBT IG PRIVATE PLACEMENTS", sortOrder: 42 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SOVEREIGN SHORT BONDS", sortOrder: 43 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SOVEREIGN USA", sortOrder: 44 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SSA EUROPE (SOVEREIGN, SUPRANATIONAL, AGENCY)", sortOrder: 45 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SSA GLOBAL  (SOVEREIGN, SUPRANATIONAL, AGENCY)", sortOrder: 46 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SSA GREEN BONDS EUR  (SOVEREIGN, SUPRANATIONAL, AGENCY)", sortOrder: 47 },
  { assetClass: "FIXED_INCOME", subAssetClass: "SSA USA", sortOrder: 48 },
  { assetClass: "REAL_ASSETS", subAssetClass: "AGRICULTURE", sortOrder: 1 },
  { assetClass: "REAL_ASSETS", subAssetClass: "COMMODITIES", sortOrder: 2 },
  { assetClass: "REAL_ASSETS", subAssetClass: "INFRASTRUCTURE", sortOrder: 3 },
  { assetClass: "REAL_ASSETS", subAssetClass: "REALESTATE LISTED", sortOrder: 4 },
  { assetClass: "REAL_ASSETS", subAssetClass: "REALESTATE DIRECT", sortOrder: 5 },
  { assetClass: "REAL_ASSETS", subAssetClass: "REALESTATE NON-LISTED NETHERLANDS", sortOrder: 6 },
  { assetClass: "REAL_ASSETS", subAssetClass: "REALESTATE NON-LISTED INTERNATIONAL", sortOrder: 7 },
  { assetClass: "REAL_ASSETS", subAssetClass: "REALESTATE NON-LISTED EUROPE", sortOrder: 8 },
  { assetClass: "REAL_ASSETS", subAssetClass: "REALESTATE NON-LISTED ASIA PACIFIC", sortOrder: 9 },
  { assetClass: "REAL_ASSETS", subAssetClass: "REALESTATE NON-LISTED NORTH AMERICA", sortOrder: 10 },
  { assetClass: "REAL_ASSETS", subAssetClass: "FORESTRY", sortOrder: 11 },
  { assetClass: "MULTI_ASSETS", subAssetClass: "DEFENSIVE", sortOrder: 1 },
  { assetClass: "MULTI_ASSETS", subAssetClass: "VERY DEFENSIVE", sortOrder: 2 },
  { assetClass: "MULTI_ASSETS", subAssetClass: "NEUTRAL", sortOrder: 3 },
  { assetClass: "MULTI_ASSETS", subAssetClass: "OFFENSIVE", sortOrder: 4 },
  { assetClass: "MULTI_ASSETS", subAssetClass: "VERY OFFENSIVE", sortOrder: 5 },
  { assetClass: "MULTI_ASSETS", subAssetClass: "MIX", sortOrder: 6 },
  { assetClass: "OVERLAY", subAssetClass: "INTEREST", sortOrder: 1 },
  { assetClass: "OVERLAY", subAssetClass: "CURRENCY", sortOrder: 2 },
  { assetClass: "OVERLAY", subAssetClass: "INFLATION", sortOrder: 3 },
  { assetClass: "OVERLAY", subAssetClass: "EQUITY", sortOrder: 4 },
  { assetClass: "OVERLAY", subAssetClass: "FUNDS", sortOrder: 5 },
  { assetClass: "IMPACT", subAssetClass: "IMPACT", sortOrder: 1 },
  { assetClass: "IMPACT", subAssetClass: "EQUITIES", sortOrder: 2 },
  { assetClass: "IMPACT", subAssetClass: "FIXED INCOME DEBT", sortOrder: 3 },
  { assetClass: "IMPACT", subAssetClass: "PRIVATE EQUITY", sortOrder: 4 },
  { assetClass: "IMPACT", subAssetClass: "REALESTATE", sortOrder: 5 },
  { assetClass: "IMPACT", subAssetClass: "AGRICULTURE", sortOrder: 6 },
  { assetClass: "IMPACT", subAssetClass: "INFRASTRUCTURE", sortOrder: 7 },
  { assetClass: "IMPACT", subAssetClass: "CLIMATE", sortOrder: 8 },
  { assetClass: "IMPACT", subAssetClass: "FORESTRY", sortOrder: 9 },
  { assetClass: "OPBOUW", subAssetClass: null, sortOrder: null },
  { assetClass: "RENDEMENT", subAssetClass: null, sortOrder: null },
  { assetClass: "RENTE", subAssetClass: null, sortOrder: null },
  { assetClass: "INFLATION", subAssetClass: null, sortOrder: null },
  { assetClass: "MATCHING", subAssetClass: null, sortOrder: null },
  { assetClass: "COLLATERAL", subAssetClass: null, sortOrder: null },
  { assetClass: "RESERVE", subAssetClass: null, sortOrder: null },
] as const satisfies readonly AssetClassHierarchyRecord[];

export type AssetClassKey = (typeof ASSET_CLASS_HIERARCHY)[number]["assetClass"];
export type SubAssetClass = Exclude<(typeof ASSET_CLASS_HIERARCHY)[number]["subAssetClass"], null>;

export const ASSET_CLASS_KEYS = Array.from(
  new Set(ASSET_CLASS_HIERARCHY.map((record) => record.assetClass)),
) as [AssetClassKey, ...AssetClassKey[]];

export const ASSET_CLASS_VALUES = ASSET_CLASS_KEYS;
export const PARENT_ONLY_ASSET_CLASSES = ASSET_CLASS_HIERARCHY
  .filter((record) => record.subAssetClass === null)
  .map((record) => record.assetClass) as AssetClassKey[];

export type AssetClassCode = string;

export const ASSET_CLASS_CODES: Record<AssetClassKey, AssetClassCode> = {
  CASH: "CS",
  ALTERNATIVES: "AL",
  EQUITIES: "EQ",
  FIXED_INCOME: "FI",
  REAL_ASSETS: "RA",
  MULTI_ASSETS: "MA",
  OVERLAY: "OV",
  IMPACT: "IM",
  OPBOUW: "OP",
  RENDEMENT: "RD",
  RENTE: "RT",
  INFLATION: "IF",
  MATCHING: "MT",
  COLLATERAL: "CL",
  RESERVE: "RV",
} as const;

export const ASSET_CLASS_SUB_CLASSES = ASSET_CLASS_KEYS.reduce(
  (result, assetClass) => {
    result[assetClass] = ASSET_CLASS_HIERARCHY
      .filter((record) => record.assetClass === assetClass && record.subAssetClass !== null)
      .map((record) => record.subAssetClass as SubAssetClass);
    return result;
  },
  {} as Record<AssetClassKey, SubAssetClass[]>,
);

export const SUB_ASSET_CLASS_CODES: Record<AssetClassKey, Record<string, string>> = {
  CASH: { CASH: "CAS", FUNDS: "FUN", LIQUIDITIES: "LIQ" },
  ALTERNATIVES: {
    "PRIVATE EQUITY": "PRI", "HEDGE FUNDS": "HED", "PRIVATE EQUITY IMPACT": "PEI",
    "HEDGE FUNDS CTA": "HFC", "HEDGE FUNDS GLOBAL MACRO": "HFG", "INFLATION LINKED SECURITIES": "ILS",
    GOLD: "GOL", "RISK PARITY": "RIS", "RISK PREMIA": "RIP",
  },
  EQUITIES: {
    "DEVELOPED MARKETS": "DEV", "DEVELOPED MARKETS FACTOR": "DMF", "DEVELOPED MARKETS SMALL CAP": "DMS",
    "EMERGING MARKETS": "EME", "AC WORLD": "ACX", EUROPE: "EUR", JAPAN: "JAP", "ASIA EX-JAPAN": "AEJ",
    "UNITED STATES": "UNI", "NORTH AMERICA": "NOR", DUURZAAM: "DUU", "MILIEU & WATER": "MIL",
    BIODIVERSITY: "BIO", FUNDS: "FUN", "EMERGING MARKETS FACTOR": "EMF", "AC WORLD FACTOR": "AWF",
  },
  FIXED_INCOME: {
    "ASSET BACKED SECURITIES": "ABS", BANKLOANS: "BAN", BIODIVERSITY: "BIO", CONVERTABLES: "CON",
    "CLO (COLLATERALIZED LOAN OBLIGATION)": "CCL", "CORPORATES EUROPE": "COR", "CREDITS EUROPE": "CRE",
    "CREDITS GLOBAL": "CRG", "CREDITS USA": "CRU", "DEBT HY MICRO FINANCIERING": "DHM", "DEBT IG ECA LOANS": "DIE",
    "DEBT IG WSW LOANS": "DIW", DUURZAAM: "DUU", "EMERGING MARKETS BLEND": "EMB", "EMERGING MARKETS HC": "EMH",
    "EMERGING MARKETS LC": "EML", FUNDS: "FUN", GREENBONDS: "GRE", "HIGH YIELD EUROPE": "HYE",
    "HIGH YIELD GLOBAL": "HYG", "HIGH YIELD USA": "HYU", "INFLATION LINKED BONDS EUROPE": "ILB",
    "INFLATION LINKED BONDS GLOBAL": "INL", LDI: "LDI", "LIQUID INVESTMENTS (MONEY MARKET)": "LIM", LIQUIDITIES: "LIQ",
    MORTGAGES: "MOR", OVERLAYFUNDS: "OVE", "PRIVATE LOANS": "PRI", SECURITIZED: "SEC", SOCIAL: "SOC",
    "SOVEREIGN EUROPE": "SOV", "SOVEREIGN GLOBAL": "SOG", "CORPORATES GLOBAL": "COG", "CORPORATES USA": "COU",
    "COVERED BONDS EUROPE": "CBE", "COVERED BONDS GLOBAL": "CBG", "COVERED BONDS USA": "CBU",
    "DEBT HY DIRECT LOANS": "DHD", "DEBT HY INFRASTRUCTURE": "DHI", "DEBT IG OVERIG": "DIO",
    "DEBT IG PRIVATE PLACEMENTS": "DIP", "SOVEREIGN SHORT BONDS": "SSB", "SOVEREIGN USA": "SOU",
    "SSA EUROPE (SOVEREIGN, SUPRANATIONAL, AGENCY)": "SSE", "SSA GLOBAL  (SOVEREIGN, SUPRANATIONAL, AGENCY)": "SSG",
    "SSA GREEN BONDS EUR  (SOVEREIGN, SUPRANATIONAL, AGENCY)": "SGB", "SSA USA": "SSU",
  },
  REAL_ASSETS: {
    AGRICULTURE: "AGR", COMMODITIES: "COM", INFRASTRUCTURE: "INF", "REALESTATE LISTED": "REA",
    "REALESTATE DIRECT": "RED", "REALESTATE NON-LISTED NETHERLANDS": "RNL",
    "REALESTATE NON-LISTED INTERNATIONAL": "REN", "REALESTATE NON-LISTED EUROPE": "RNA",
    "REALESTATE NON-LISTED ASIA PACIFIC": "RNB", "REALESTATE NON-LISTED NORTH AMERICA": "RNC", FORESTRY: "FOR",
  },
  MULTI_ASSETS: { DEFENSIVE: "DEF", "VERY DEFENSIVE": "VER", NEUTRAL: "NEU", OFFENSIVE: "OFF", "VERY OFFENSIVE": "VEO", MIX: "MIX" },
  OVERLAY: { INTEREST: "INT", CURRENCY: "CUR", INFLATION: "INF", EQUITY: "EQU", FUNDS: "FUN" },
  IMPACT: { IMPACT: "IMP", EQUITIES: "EQU", "FIXED INCOME DEBT": "FID", "PRIVATE EQUITY": "PRI", REALESTATE: "REA", AGRICULTURE: "AGR", INFRASTRUCTURE: "INF", CLIMATE: "CLI", FORESTRY: "FOR" },
  OPBOUW: {}, RENDEMENT: {}, RENTE: {}, INFLATION: {}, MATCHING: {}, COLLATERAL: {}, RESERVE: {},
};

export type AssetSubAssetOption = {
  assetClass: AssetClassKey;
  assetClassCode: AssetClassCode;
  subAssetClass: SubAssetClass;
  subAssetClassCode: string;
  sortOrder: number;
};

export const ASSET_SUB_ASSET_OPTIONS: readonly AssetSubAssetOption[] = ASSET_CLASS_HIERARCHY
  .filter((record): record is Extract<(typeof ASSET_CLASS_HIERARCHY)[number], { subAssetClass: string; sortOrder: number }> =>
    record.subAssetClass !== null && record.sortOrder !== null,
  )
  .map((record) => ({
    assetClass: record.assetClass,
    assetClassCode: ASSET_CLASS_CODES[record.assetClass],
    subAssetClass: record.subAssetClass,
    subAssetClassCode: SUB_ASSET_CLASS_CODES[record.assetClass][record.subAssetClass],
    sortOrder: record.sortOrder,
  }));

export const ALL_SUB_ASSET_CLASSES: readonly string[] = ASSET_SUB_ASSET_OPTIONS.map(
  (option) => option.subAssetClass,
);

export function getSubClasses(assetClass: string): readonly string[] | undefined {
  return ASSET_CLASS_SUB_CLASSES[assetClass as AssetClassKey];
}

export function isSubClassValid(assetClass: string, subClass: string): boolean {
  const valid = getSubClasses(assetClass);
  if (!valid) return false;
  return valid.includes(subClass);
}

export function findAssetClassForSubClass(subClass: string): AssetClassKey[] {
  const result: AssetClassKey[] = [];
  for (const [key, subClasses] of Object.entries(ASSET_CLASS_SUB_CLASSES)) {
    if ((subClasses as readonly string[]).includes(subClass)) {
      result.push(key as AssetClassKey);
    }
  }
  return result;
}
