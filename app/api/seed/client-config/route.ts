/**
 * Seed API Endpoint — Client Config 3NF Schema
 *
 * POST /api/seed/client-config
 *
 * Populates the client_config (3NF) schema tables with reference data and
 * portfolio configurations so the admin client-config page displays records.
 *
 * The endpoint seeds:
 *   1. client_config.manager         — manager lookup table
 *   2. client_config.benchmark       — benchmark lookup table
 *   3. client_config.npc_classification — NPC classification lookup table
 *   4. client_config.portfolio       — portfolio lookup table
 *   5. client_config.parent_account  — parent account lookup table
 *   6. client_config.portfolio_configuration — live configuration table
 *      (uses SET LOCAL app.change_process_bypass = 'true' to bypass the
 *       change-process enforcement trigger)
 *
 * Idempotent — uses INSERT … ON CONFLICT DO NOTHING throughout.
 *
 * Security: protected by SEED_API_KEY env var (same as the broader seed endpoint).
 * Returns JSON with seed summary.
 */
import { NextResponse } from "next/server";
import postgres from "postgres";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

// ── Manager mapping ──────────────────────────────────────────────────────
// 3-char codes for client_config.manager (manager_code is char(3))
const MANAGERS: Array<{ code: string; name: string }> = [
  { code: "EIG", name: "Eigen Beheer" },
  { code: "EXA", name: "Extern A" },
  { code: "EXB", name: "Extern B" },
];

// ── Benchmark catalog ────────────────────────────────────────────────────
const BENCHMARK_CATALOG: Array<{ code: string; name: string; rimesCode: string | null }> = [
  { code: "MSCI-WORLD-NR",         name: "MSCI World Net Return",                    rimesCode: null },
  { code: "MSCI-ACWI-NR",          name: "MSCI ACWI Net Return",                     rimesCode: null },
  { code: "BLOOMBERG-EU-AGG",      name: "Bloomberg Euro Aggregate",                 rimesCode: null },
  { code: "ICE-BOFA-EU-CORP",      name: "ICE BofA Euro Corporate",                  rimesCode: null },
  { code: "CUSTOM-ESG-NL",         name: "Duurzame NL Benchmark",                     rimesCode: null },
  { code: "RIMES-PRIVATE-EQ",      name: "Rimes Private Equity Index",               rimesCode: null },
  { code: "EURO-GOVT-1-3Y",        name: "Euro Government 1-3 Year",                  rimesCode: null },
  { code: "GLOBAL-REIT-NR",        name: "Global REIT Net Return",                    rimesCode: null },
  { code: "MSCI-EM-NR",            name: "MSCI Emerging Markets Net Return",          rimesCode: null },
  { code: "BLOOMBERG-GL-AGG",      name: "Bloomberg Global Aggregate",                rimesCode: null },
  { code: "HFRX-GL-HEDGE",         name: "HFRX Global Hedge Fund Index",             rimesCode: null },
  { code: "S&P-500-NR",            name: "S&P 500 Net Return",                        rimesCode: null },
  { code: "S&P-GSCI",              name: "S&P GSCI Commodity Total Return",           rimesCode: null },
  { code: "MSCI-WORLD-INFRA",      name: "MSCI World Infrastructure Net Return",     rimesCode: null },
  { code: "BLOOMBERG-GL-HY",       name: "Bloomberg Global High Yield",               rimesCode: null },
  { code: "FTSE-EPRA-NAREIT-DEV",  name: "FTSE EPRA Nareit Developed",                rimesCode: null },
  { code: "MSCI-WORLD-HEALTH",     name: "MSCI World Health Care Net Return",         rimesCode: null },
];

// ── NPC classifications ─────────────────────────────────────────────────
const NPC_CLASSIFICATIONS: Array<{ name: string }> = [
  { name: "Match" },
  { name: "Return" },
  { name: "Opbouw" },
];

// ── Manager key → 3-char code ────────────────────────────────────────────
const MANAGER_KEY_MAP: Record<string, string> = {
  EigenBeheer: "EIG",
  ExternA:     "EXA",
  ExternB:     "EXB",
};

// ── Asset class name → code ─────────────────────────────────────────────
const AC_NAME_TO_CODE: Record<string, string> = {
  CASH:          "CS",
  EQUITIES:      "EQ",
  ALTERNATIVES:  "AL",
  REAL_ASSETS:   "RA",
  FIXED_INCOME:  "FI",
  MULTI_ASSETS:  "MA",
  OVERLAY:       "OV",
  IMPACT:        "IM",
};

// ── Sub asset class name → code ─────────────────────────────────────────
const SUB_AC_NAME_TO_CODE: Record<string, string> = {
  "CASH":                          "CAS",
  "FUNDS":                         "FUN",
  "LIQUIDITIES":                   "LIQ",
  "DEVELOPED MARKETS":             "DEV",
  "DEVELOPED MARKETS FACTOR":      "DMF",
  "DEVELOPED MARKETS SMALL CAP":   "DMS",
  "EMERGING MARKETS":              "EME",
  "AC WORLD":                      "ACX",
  "EUROPE":                        "EUR",
  "JAPAN":                         "JAP",
  "ASIA EX-JAPAN":                 "AEJ",
  "UNITED STATES":                 "UNI",
  "NORTH AMERICA":                 "NOR",
  "DUURZAAM":                      "DUU",
  "MILIEU & WATER":                "MIL",
  "BIODIVERSITY":                  "BIO",
  "EMERGING MARKETS FACTOR":       "EMF",
  "AC WORLD FACTOR":               "AWF",
  "PRIVATE EQUITY":                "PRI",
  "HEDGE FUNDS":                   "HED",
  "PRIVATE EQUITY IMPACT":         "PEI",
  "HEDGE FUNDS CTA":               "HFC",
  "HEDGE FUNDS GLOBAL MACRO":      "HFG",
  "INFLATION LINKED SECURITIES":   "ILS",
  "GOLD":                          "GOL",
  "RISK PARITY":                   "RIS",
  "RISK PREMIA":                   "RIP",
  "AGRICULTURE":                   "AGR",
  "COMMODITIES":                   "COM",
  "INFRASTRUCTURE":                "INF",
  "REALESTATE LISTED":             "REA",
  "REALESTATE DIRECT":             "RED",
  "REALESTATE NON-LISTED NETHERLANDS":  "RNL",
  "REALESTATE NON-LISTED INTERNATIONAL": "REN",
  "REALESTATE NON-LISTED EUROPE":       "RNA",
  "REALESTATE NON-LISTED ASIA PACIFIC": "RNB",
  "REALESTATE NON-LISTED NORTH AMERICA": "RNC",
  "FORESTRY":                      "FOR",
  "ASSET BACKED SECURITIES":        "ABS",
  "BANKLOANS":                     "BAN",
  "CONVERTABLES":                  "CON",
  "CLO (COLLATERALIZED LOAN OBLIGATION)": "CCL",
  "CORPORATES EUROPE":             "COR",
  "CREDITS EUROPE":                "CRE",
  "CREDITS GLOBAL":                "CRG",
  "CREDITS USA":                   "CRU",
  "DEBT HY MICRO FINANCIERING":    "DHM",
  "DEBT IG ECA LOANS":             "DIE",
  "DEBT IG WSW LOANS":             "DIW",
  "EMERGING MARKETS BLEND":        "EMB",
  "EMERGING MARKETS HC":           "EMH",
  "EMERGING MARKETS LC":           "EML",
  "GREENBONDS":                    "GRE",
  "HIGH YIELD EUROPE":             "HYE",
  "HIGH YIELD GLOBAL":             "HYG",
  "HIGH YIELD USA":                "HYU",
  "INFLATION LINKED BONDS EUROPE": "ILB",
  "INFLATION LINKED BONDS GLOBAL": "INL",
  "LDI":                           "LDI",
  "LIQUID INVESTMENTS (MONEY MARKET)": "LIM",
  "MORTGAGES":                     "MOR",
  "OVERLAYFUNDS":                  "OVE",
  "PRIVATE LOANS":                 "PRI",
  "SECURITIZED":                   "SEC",
  "SOCIAL":                        "SOC",
  "SOVEREIGN EUROPE":              "SOV",
  "SOVEREIGN GLOBAL":              "SOG",
  "DEFENSIVE":                     "DEF",
  "VERY DEFENSIVE":                "VER",
  "NEUTRAL":                       "NEU",
  "OFFENSIVE":                     "OFF",
  "VERY OFFENSIVE":                "VEO",
  "MIX":                           "MIX",
  "INTEREST":                      "INT",
  "CURRENCY":                      "CUR",
  "INFLATION":                     "INF",
  "EQUITY":                        "EQU",
  "IMPACT":                        "IMP",
  "CLIMATE":                       "CLI",
};

// ── WTP key → NPC classification name ───────────────────────────────────
const WTP_TO_NPC: Record<string, string> = {
  Rendement: "Return",
  Matching:  "Match",
  Opbouw:    "Opbouw",
};

// ── Benchmark catalog key → code ────────────────────────────────────────
const BM_KEY_TO_CODE: Record<string, string> = {
  MSCI_WORLD:   "MSCI-WORLD-NR",
  MSCI_ACWI:    "MSCI-ACWI-NR",
  BLOOMBERG_EU: "BLOOMBERG-EU-AGG",
  ICE_BOFA:     "ICE-BOFA-EU-CORP",
  CUSTOM_ESG:   "CUSTOM-ESG-NL",
  RIMES_PE:     "RIMES-PRIVATE-EQ",
  EURO_GOVT:    "EURO-GOVT-1-3Y",
  GLOBAL_REIT:  "GLOBAL-REIT-NR",
  MSCI_EM:      "MSCI-EM-NR",
  BLOOMBERG_GL: "BLOOMBERG-GL-AGG",
  HFRX_GL:      "HFRX-GL-HEDGE",
  SP500:        "S&P-500-NR",
  SP_GSCI:      "S&P-GSCI",
  WORLD_INFRA:  "MSCI-WORLD-INFRA",
  BLOOMBERG_HY: "BLOOMBERG-GL-HY",
  FTSE_EPRA:    "FTSE-EPRA-NAREIT-DEV",
  MSCI_HEALTH:  "MSCI-WORLD-HEALTH",
};

// ── Portfolio configuration definitions ──────────────────────────────────
// [portfolioCode, portfolioName, wtpKey, acName, subAcName, mgrKey, bmKey]
type PfDef = [string, string, string, string, string, string, string];

const CLIENTS: Array<{
  externalReference: string;
  portfolios: PfDef[];
}> = [
  {
    externalReference: "MET",
    portfolios: [
      ["MET-RP", "Rendementsportefeuille", "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "MSCI_WORLD"],
      ["MET-MP", "Matchingportefeuille",  "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "BLOOMBERG_EU"],
      ["MET-OP", "Opbouwportefeuille",    "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "MSCI_ACWI"],
      ["MET-DP", "Duurzame portefeuille",  "Rendement", "EQUITIES", "DUURZAAM", "ExternB", "CUSTOM_ESG"],
      ["MET-VP", "Vastgoedportefeuille",   "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternA", "GLOBAL_REIT"],
      ["MET-LQ", "Liquiditeiten",          "Matching", "CASH", "CASH", "EigenBeheer", "MSCI_WORLD"],
    ],
  },
  {
    externalReference: "VRV",
    portfolios: [
      ["VRV-RET", "Return portefeuille",     "Rendement", "EQUITIES", "UNITED STATES", "ExternA", "SP500"],
      ["VRV-MP",  "Matching portefeuille",   "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "EURO_GOVT"],
      ["VRV-GR",  "Groei portefeuille",      "Opbouw", "EQUITIES", "EMERGING MARKETS", "ExternA", "MSCI_EM"],
      ["VRV-EK",  "Europees krediet",        "Rendement", "FIXED_INCOME", "CREDITS EUROPE", "ExternB", "ICE_BOFA"],
      ["VRV-IP",  "Inflatieportefeuille",    "Matching", "FIXED_INCOME", "INFLATION LINKED BONDS EUROPE", "EigenBeheer", "BLOOMBERG_GL"],
      ["VRV-PE",  "Privé-equity",           "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternA", "RIMES_PE"],
      ["VRV-IF",  "Infrastructuur",          "Opbouw", "REAL_ASSETS", "INFRASTRUCTURE", "ExternB", "WORLD_INFRA"],
    ],
  },
  {
    externalReference: "BOU",
    portfolios: [
      ["BOU-RP", "Rendementsportefeuille",  "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "MSCI_WORLD"],
      ["BOU-MP", "Matchingportefeuille",    "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "BLOOMBERG_EU"],
      ["BOU-OP", "Opbouwportefeuille",      "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "MSCI_ACWI"],
      ["BOU-VF", "Vastgoed fondsen",        "Rendement", "REAL_ASSETS", "REALESTATE DIRECT", "ExternB", "FTSE_EPRA"],
      ["BOU-GO", "Groene obligaties",       "Matching", "FIXED_INCOME", "GREENBONDS", "ExternA", "CUSTOM_ESG"],
      ["BOU-HY", "High yield",              "Rendement", "FIXED_INCOME", "HIGH YIELD EUROPE", "ExternB", "BLOOMBERG_HY"],
      ["BOU-LQ", "Liquiditeiten",           "Matching", "CASH", "CASH", "EigenBeheer", "EURO_GOVT"],
      ["BOU-HF", "Hedge funds",             "Rendement", "ALTERNATIVES", "HEDGE FUNDS", "ExternA", "HFRX_GL"],
    ],
  },
  {
    externalReference: "ZWG",
    portfolios: [
      ["ZWG-RF", "Renteforfait",            "Matching", "FIXED_INCOME", "LDI", "EigenBeheer", "BLOOMBERG_EU"],
      ["ZWG-AW", "Aandelen wereldwijd",     "Rendement", "EQUITIES", "AC WORLD", "ExternA", "MSCI_WORLD"],
      ["ZWG-OP", "Opbouwportefeuille",      "Opbouw", "EQUITIES", "EUROPE", "ExternA", "MSCI_ACWI"],
      ["ZWG-GZ", "Gezondheidszorg",         "Rendement", "EQUITIES", "UNITED STATES", "ExternB", "MSCI_HEALTH"],
      ["ZWG-KP", "Kredietportefeuille",     "Rendement", "FIXED_INCOME", "CORPORATES EUROPE", "ExternA", "ICE_BOFA"],
      ["ZWG-DP", "Duurzame portefeuille",   "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "CUSTOM_ESG"],
      ["ZWG-VP", "Vastgoedportefeuille",    "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternB", "GLOBAL_REIT"],
      ["ZWG-IS", "Inflatieswaps",           "Matching", "FIXED_INCOME", "INFLATION LINKED BONDS EUROPE", "EigenBeheer", "BLOOMBERG_GL"],
      ["ZWG-PE", "Private Equity",          "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternA", "RIMES_PE"],
    ],
  },
  {
    externalReference: "DET",
    portfolios: [
      ["DET-RP", "Rendement",               "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "MSCI_WORLD"],
      ["DET-MP", "Matching",                "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "BLOOMBERG_EU"],
      ["DET-OP", "Opbouw",                  "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "MSCI_ACWI"],
      ["DET-VG", "Vastgoed",                "Rendement", "REAL_ASSETS", "REALESTATE DIRECT", "ExternB", "FTSE_EPRA"],
      ["DET-HY", "High yield Europa",       "Rendement", "FIXED_INCOME", "HIGH YIELD EUROPE", "ExternA", "BLOOMBERG_HY"],
      ["DET-LQ", "Liquiditeiten",           "Matching", "CASH", "CASH", "EigenBeheer", "EURO_GOVT"],
    ],
  },
  {
    externalReference: "BAK",
    portfolios: [
      ["BAK-RP", "Rendementsportefeuille",  "Rendement", "EQUITIES", "EUROPE", "ExternA", "MSCI_WORLD"],
      ["BAK-MP", "Matchingportefeuille",    "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "EURO_GOVT"],
      ["BAK-GR", "Groei portefeuille",      "Opbouw", "EQUITIES", "EMERGING MARKETS", "ExternA", "MSCI_EM"],
      ["BAK-KP", "Kredietportefeuille",     "Rendement", "FIXED_INCOME", "CORPORATES EUROPE", "ExternB", "ICE_BOFA"],
      ["BAK-CO", "Commoditeiten",           "Rendement", "REAL_ASSETS", "COMMODITIES", "ExternA", "SP_GSCI"],
      ["BAK-PE", "Private equity",          "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternB", "RIMES_PE"],
      ["BAK-LQ", "Liquiditeiten",           "Matching", "CASH", "CASH", "EigenBeheer", "EURO_GOVT"],
    ],
  },
  {
    externalReference: "OVV",
    portfolios: [
      ["OVV-RET", "Return portefeuille",     "Rendement", "EQUITIES", "AC WORLD", "ExternA", "MSCI_ACWI"],
      ["OVV-MP",  "Matching portefeuille",   "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "BLOOMBERG_EU"],
      ["OVV-OP",  "Opbouw portefeuille",     "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "MSCI_WORLD"],
      ["OVV-DP",  "Duurzame portefeuille",   "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "CUSTOM_ESG"],
      ["OVV-VP",  "Vastgoed portefeuille",   "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternB", "GLOBAL_REIT"],
      ["OVV-HF",  "Hedge fund portefeuille", "Rendement", "ALTERNATIVES", "HEDGE FUNDS", "ExternA", "HFRX_GL"],
      ["OVV-IP",  "Inflatieportefeuille",    "Matching", "FIXED_INCOME", "INFLATION LINKED BONDS EUROPE", "EigenBeheer", "BLOOMBERG_GL"],
      ["OVV-KL",  "Kortlopend",              "Matching", "CASH", "CASH", "EigenBeheer", "EURO_GOVT"],
      ["OVV-JP",  "Japan aandelen",          "Rendement", "EQUITIES", "JAPAN", "ExternB", "MSCI_WORLD"],
      ["OVV-IF",  "Infrastructuur",          "Opbouw", "REAL_ASSETS", "INFRASTRUCTURE", "ExternA", "WORLD_INFRA"],
    ],
  },
  {
    externalReference: "LAN",
    portfolios: [
      ["LAN-RP", "Rendementsportefeuille",  "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "MSCI_WORLD"],
      ["LAN-MP", "Matchingportefeuille",    "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "EURO_GOVT"],
      ["LAN-OP", "Opbouwportefeuille",      "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "MSCI_ACWI"],
      ["LAN-AP", "Agrarische portefeuille", "Rendement", "REAL_ASSETS", "AGRICULTURE", "ExternB", "SP_GSCI"],
      ["LAN-DP", "Duurzame portefeuille",   "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "CUSTOM_ESG"],
      ["LAN-KE", "Krediet Europa",          "Rendement", "FIXED_INCOME", "CREDITS EUROPE", "ExternA", "ICE_BOFA"],
      ["LAN-PE", "Private equity",          "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternB", "RIMES_PE"],
      ["LAN-CO", "Commoditeiten",           "Rendement", "REAL_ASSETS", "COMMODITIES", "ExternA", "SP_GSCI"],
    ],
  },
  {
    externalReference: "CHE",
    portfolios: [
      ["CHE-RP", "Rendement",               "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "MSCI_WORLD"],
      ["CHE-MP", "Matching",                "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "BLOOMBERG_EU"],
      ["CHE-OP", "Opbouw",                  "Opbouw", "EQUITIES", "EUROPE", "ExternA", "MSCI_ACWI"],
      ["CHE-HY", "High yield",              "Rendement", "FIXED_INCOME", "HIGH YIELD EUROPE", "ExternA", "BLOOMBERG_HY"],
      ["CHE-LI", "LDI portefeuille",        "Matching", "FIXED_INCOME", "LDI", "EigenBeheer", "BLOOMBERG_EU"],
      ["CHE-VG", "Vastgoed",                "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternB", "FTSE_EPRA"],
      ["CHE-RP2","Risk parity",             "Rendement", "ALTERNATIVES", "RISK PARITY", "ExternA", "HFRX_GL"],
      ["CHE-LQ", "Liquiditeiten",           "Matching", "CASH", "CASH", "EigenBeheer", "EURO_GOVT"],
      ["CHE-GO", "Groene obligaties",       "Matching", "FIXED_INCOME", "GREENBONDS", "ExternB", "CUSTOM_ESG"],
    ],
  },
  {
    externalReference: "TEC",
    portfolios: [
      ["TEC-RP", "Rendementsportefeuille",  "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "MSCI_ACWI"],
      ["TEC-MP", "Matchingportefeuille",    "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "BLOOMBERG_EU"],
      ["TEC-OP", "Opbouwportefeuille",      "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "MSCI_WORLD"],
      ["TEC-VS", "VS aandelen",             "Rendement", "EQUITIES", "UNITED STATES", "ExternA", "SP500"],
      ["TEC-OM", "Opkomende markten",       "Rendement", "EQUITIES", "EMERGING MARKETS", "ExternB", "MSCI_EM"],
      ["TEC-EK", "Europese kredieten",      "Rendement", "FIXED_INCOME", "CREDITS EUROPE", "ExternA", "ICE_BOFA"],
      ["TEC-PE", "Private equity",          "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternB", "RIMES_PE"],
      ["TEC-VP", "Vastgoedportefeuille",    "Rendement", "REAL_ASSETS", "REALESTATE DIRECT", "ExternA", "GLOBAL_REIT"],
      ["TEC-LQ", "Liquiditeiten",           "Matching", "CASH", "CASH", "EigenBeheer", "EURO_GOVT"],
      ["TEC-DP", "Duurzame portefeuille",   "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "CUSTOM_ESG"],
    ],
  },
];

// ── Resolve a portfolio definition into a configuration row ──────────────
function resolveConfig(
  pf: PfDef,
): {
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationName: string;
  longName: string;
  shortName: string;
  primaryAccountId: string;
} | null {
  const [portfolioCode, portfolioName, wtpKey, acName, subAcName, mgrKey, bmKey] = pf;

  const acCode = AC_NAME_TO_CODE[acName];
  const sacCode = SUB_AC_NAME_TO_CODE[subAcName];
  const mgrCode = MANAGER_KEY_MAP[mgrKey];
  const bmCode = BM_KEY_TO_CODE[bmKey];
  const npcName = WTP_TO_NPC[wtpKey];

  if (!acCode || !sacCode || !mgrCode || !bmCode || !npcName) {
    console.warn(`Skipping ${portfolioCode}: missing mapping`, { acCode, sacCode, mgrCode, bmCode, npcName });
    return null;
  }

  const primaryAccountId = `${portfolioCode}_${acCode}${sacCode}_${mgrCode}`;

  return {
    portfolioCode,
    assetClassCode: acCode,
    subAssetClassCode: sacCode,
    managerCode: mgrCode,
    benchmarkCode: bmCode,
    npcClassificationName: npcName,
    longName: portfolioName,
    shortName: portfolioName,
    primaryAccountId,
  };
}

// ── Run the seed ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Basic auth via SEED_API_KEY header or query param
  const apiKey = process.env.SEED_API_KEY;
  if (apiKey) {
    const auth = request.headers.get("x-api-key") || "";
    const url = new URL(request.url);
    const queryKey = url.searchParams.get("key") || "";
    if (auth !== apiKey && queryKey !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL not set — running in demo mode, no database available" },
      { status: 400 },
    );
  }

  let sql: postgres.Sql | null = null;
  try {
    sql = postgres(dbUrl, { max: 2, connect_timeout: 5 });

    // ── Ensure the client_config schema and tables exist ──
    await sql`CREATE SCHEMA IF NOT EXISTS client_config`;

    // Create lookup tables (idempotent)
    await sql`CREATE TABLE IF NOT EXISTS client_config.parent_account (
      parent_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      parent_account_code varchar(16) NOT NULL UNIQUE
    )`;

    await sql`CREATE TABLE IF NOT EXISTS client_config.portfolio (
      portfolio_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      portfolio_code varchar(15) NOT NULL UNIQUE,
      parent_account_id bigint REFERENCES client_config.parent_account
    )`;

    await sql`CREATE TABLE IF NOT EXISTS client_config.manager (
      manager_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      manager_code char(3) NOT NULL UNIQUE CHECK (manager_code ~ '^[A-Z0-9]{3}$'),
      manager_name varchar(50) NOT NULL UNIQUE
    )`;

    await sql`CREATE TABLE IF NOT EXISTS client_config.benchmark (
      benchmark_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      benchmark_code varchar(60) NOT NULL UNIQUE,
      benchmark_name varchar(100),
      rimes_code varchar(40)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS client_config.npc_classification (
      npc_classification_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      classification_name varchar(80) NOT NULL UNIQUE
    )`;

    await sql`CREATE TABLE IF NOT EXISTS client_config.asset_class (
      asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      asset_class_code char(2) NOT NULL UNIQUE CHECK (asset_class_code ~ '^[A-Z]{2}$'),
      asset_class_name varchar(30) NOT NULL UNIQUE
    )`;

    await sql`CREATE TABLE IF NOT EXISTS client_config.sub_asset_class (
      sub_asset_class_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      asset_class_id smallint NOT NULL REFERENCES client_config.asset_class,
      sub_asset_class_code char(3) NOT NULL,
      sub_asset_class_name varchar(50) NOT NULL,
      UNIQUE (asset_class_id, sub_asset_class_code),
      UNIQUE (asset_class_id, sub_asset_class_name)
    )`;

    await sql`CREATE TABLE IF NOT EXISTS client_config.portfolio_configuration (
      primary_account_id varchar(30) PRIMARY KEY,
      portfolio_code varchar(15) NOT NULL REFERENCES client_config.portfolio(portfolio_code),
      asset_class_code char(2) NOT NULL REFERENCES client_config.asset_class(asset_class_code),
      sub_asset_class_code char(3) NOT NULL,
      manager_code char(3) NOT NULL REFERENCES client_config.manager(manager_code),
      benchmark_code varchar(60) NOT NULL,
      npc_classification_id smallint NOT NULL REFERENCES client_config.npc_classification(npc_classification_id),
      long_name varchar(255) NOT NULL,
      short_name varchar(100) NOT NULL,
      active_ind boolean NOT NULL DEFAULT true,
      effective_from date NOT NULL,
      effective_until date,
      change_request_id uuid UNIQUE REFERENCES change_requests(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    // Add the change-process enforcement trigger (idempotent)
    await sql`
      CREATE OR REPLACE FUNCTION client_config.enforce_change_process()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('app.change_process_bypass', true) IS DISTINCT FROM 'true' THEN
          RAISE EXCEPTION 'Directe wijziging van client_config.portfolio_configuration is niet toegestaan.';
        END IF;
        RETURN NEW;
      END;
      $$;
    `;

    // Seed asset_class and sub_asset_class lookup data (taken from clientconfig_schema.sql)
    await sql`INSERT INTO client_config.asset_class (asset_class_code, asset_class_name) VALUES
      ('CS', 'CASH'), ('EQ', 'EQUITIES'), ('AL', 'ALTERNATIVES'), ('RA', 'REAL_ASSETS'),
      ('FI', 'FIXED_INCOME'), ('MA', 'MULTI_ASSETS'), ('OV', 'OVERLAY'), ('IM', 'IMPACT')
      ON CONFLICT (asset_class_code) DO NOTHING`;

    // Sub asset classes (subset used by the seed portfolio data)
    await sql`
      INSERT INTO client_config.sub_asset_class (asset_class_id, sub_asset_class_code, sub_asset_class_name)
      SELECT a.asset_class_id, x.code, x.name
      FROM client_config.asset_class a
      CROSS JOIN LATERAL (VALUES
        ('CS', 'CAS', 'CASH'),
        ('CS', 'FUN', 'FUNDS'),
        ('CS', 'LIQ', 'LIQUIDITIES'),
        ('EQ', 'DEV', 'DEVELOPED MARKETS'),
        ('EQ', 'EME', 'EMERGING MARKETS'),
        ('EQ', 'ACX', 'AC WORLD'),
        ('EQ', 'EUR', 'EUROPE'),
        ('EQ', 'JAP', 'JAPAN'),
        ('EQ', 'UNI', 'UNITED STATES'),
        ('EQ', 'DUU', 'DUURZAAM'),
        ('EQ', 'FUN', 'FUNDS'),
        ('AL', 'PRI', 'PRIVATE EQUITY'),
        ('AL', 'HED', 'HEDGE FUNDS'),
        ('AL', 'RIS', 'RISK PARITY'),
        ('RA', 'AGR', 'AGRICULTURE'),
        ('RA', 'COM', 'COMMODITIES'),
        ('RA', 'INF', 'INFRASTRUCTURE'),
        ('RA', 'REA', 'REALESTATE LISTED'),
        ('RA', 'RED', 'REALESTATE DIRECT'),
        ('FI', 'COR', 'CORPORATES EUROPE'),
        ('FI', 'CRE', 'CREDITS EUROPE'),
        ('FI', 'DUU', 'DUURZAAM'),
        ('FI', 'GRE', 'GREENBONDS'),
        ('FI', 'HYE', 'HIGH YIELD EUROPE'),
        ('FI', 'ILB', 'INFLATION LINKED BONDS EUROPE'),
        ('FI', 'LDI', 'LDI'),
        ('FI', 'SOV', 'SOVEREIGN EUROPE')
      ) AS x(ac_code, code, name)
      WHERE a.asset_class_code = x.ac_code
      ON CONFLICT (asset_class_id, sub_asset_class_code) DO NOTHING
    `;

    // Resolve all portfolio configurations
    const allConfigs = CLIENTS.flatMap((client) =>
      client.portfolios.map((pf) => resolveConfig(pf)).filter(Boolean),
    );

    // Collect unique reference data
    const uniquePortfolioCodes = new Set(allConfigs.map((c) => c!.portfolioCode));
    const uniqueBenchmarkCodes = new Set(allConfigs.map((c) => c!.benchmarkCode));
    const uniqueNpcNames = new Set(allConfigs.map((c) => c!.npcClassificationName));

    // Seed in a transaction (use `any` cast for postgres tagged-template SQL)
    await (sql as any).begin(async (tx: any) => {
      // 1. Seed managers
      for (const mgr of MANAGERS) {
        await tx`
          INSERT INTO client_config.manager (manager_code, manager_name)
          VALUES (${mgr.code}, ${mgr.name})
          ON CONFLICT (manager_code) DO NOTHING
        `;
      }

      // 2. Seed benchmarks
      for (const bm of BENCHMARK_CATALOG) {
        if (!uniqueBenchmarkCodes.has(bm.code)) continue;
        await tx`
          INSERT INTO client_config.benchmark (benchmark_code, benchmark_name, rimes_code)
          VALUES (${bm.code}, ${bm.name}, ${bm.rimesCode})
          ON CONFLICT (benchmark_code) DO NOTHING
        `;
      }

      // 3. Seed NPC classifications
      for (const npc of NPC_CLASSIFICATIONS) {
        if (!uniqueNpcNames.has(npc.name)) continue;
        await tx`
          INSERT INTO client_config.npc_classification (classification_name)
          VALUES (${npc.name})
          ON CONFLICT (classification_name) DO NOTHING
        `;
      }

      // 4. Seed portfolios
      for (const code of uniquePortfolioCodes) {
        await tx`
          INSERT INTO client_config.portfolio (portfolio_code, parent_account_id)
          VALUES (${code}, NULL)
          ON CONFLICT (portfolio_code) DO NOTHING
        `;
      }

      // 5. Seed portfolio_configurations (bypass change-process enforcement)
      await tx`SET LOCAL app.change_process_bypass = 'true'`;

      for (const cfg of allConfigs) {
        if (!cfg) continue;

        // Look up the NPC classification ID
        const [npcRow] = await tx`
          SELECT npc_classification_id FROM client_config.npc_classification
          WHERE classification_name = ${cfg.npcClassificationName}
          LIMIT 1
        `;
        const npcId = npcRow ? Number(npcRow.npc_classification_id) : 1;

        await tx`
          INSERT INTO client_config.portfolio_configuration (
            primary_account_id,
            portfolio_code,
            asset_class_code,
            sub_asset_class_code,
            manager_code,
            benchmark_code,
            npc_classification_id,
            long_name,
            short_name,
            active_ind,
            effective_from,
            effective_until
          ) VALUES (
            ${cfg.primaryAccountId},
            ${cfg.portfolioCode},
            ${cfg.assetClassCode},
            ${cfg.subAssetClassCode},
            ${cfg.managerCode},
            ${cfg.benchmarkCode},
            ${npcId},
            ${cfg.longName},
            ${cfg.shortName},
            true,
            '2026-01-01',
            NULL
          )
          ON CONFLICT (primary_account_id) DO NOTHING
        `;
      }
    });

    // Count results
    const counts = await sql`
      SELECT
        (SELECT COUNT(*) FROM client_config.manager) AS managers,
        (SELECT COUNT(*) FROM client_config.benchmark) AS benchmarks,
        (SELECT COUNT(*) FROM client_config.npc_classification) AS npc_classifications,
        (SELECT COUNT(*) FROM client_config.portfolio) AS portfolios,
        (SELECT COUNT(*) FROM client_config.portfolio_configuration) AS configurations
    `;

    return NextResponse.json({
      success: true,
      message: "Client config 3NF seed completed",
      summary: {
        managers: Number(counts[0].managers),
        benchmarks: Number(counts[0].benchmarks),
        npcClassifications: Number(counts[0].npc_classifications),
        portfolios: Number(counts[0].portfolios),
        configurations: Number(counts[0].configurations),
      },
    });
  } catch (error) {
    captureError(error, { route: "/api/seed/client-config", method: "POST", phase: "seed" });
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  } finally {
    if (sql) await sql.end();
  }
}