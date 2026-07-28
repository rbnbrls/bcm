#!/usr/bin/env node
/**
 * BCM Seed Script
 *
 * Inserts at least 10 clients with 3-10 portfolios each, plus the required
 * lookup data to support them. Every portfolio has all FK fields populated:
 *   - wtp_classification_id, asset_class_id, sub_asset_class_id
 *   - manager_id, benchmark_id, current_benchmark_id
 *   - a unique external_reference code generated from client prefix + role
 *
 * Idempotent: INSERT … ON CONFLICT (id) DO NOTHING throughout.
 *
 * Usage:
 *   DATABASE_URL=postgres://bcm:pass@localhost:5432/bcm node scripts/seed.mjs
 *
 * Or via npm:
 *   npm run db:seed
 *
 * Or inside a Coolify container:
 *   docker exec <container> node scripts/seed.mjs
 */
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required. Set it as an env var.");
  process.exit(1);
}
const sql = postgres(connectionString, { max: 1 });

// ============================================================================
// UUID CONSTANTS — matching init.sql for existing lookup data
// ============================================================================

const ASSET_CLASSES = {
  Aandelen:       "00000002-0000-4000-a000-000000000001",
  Obligaties:     "00000002-0000-4000-a000-000000000002",
  Vastgoed:       "00000002-0000-4000-a000-000000000003",
  Alternatieven:  "00000002-0000-4000-a000-000000000004",
  Liquiditeiten:  "00000002-0000-4000-a000-000000000005",
  PrivateEquity:  "00000002-0000-4000-a000-000000000006",
  Infrastructuur: "00000002-0000-4000-a000-000000000007",
  Grondstoffen:   "00000002-0000-4000-a000-000000000008",
};

const AC_CODE_MAP = {
  Aandelen:       "EQUITIES",
  Obligaties:     "FIXED_INCOME",
  Vastgoed:       "REAL_ASSETS",
  Alternatieven:  "ALTERNATIVES",
  Liquiditeiten:  "CASH",
  PrivateEquity:  "ALTERNATIVES",
  Infrastructuur: "REAL_ASSETS",
  Grondstoffen:   "REAL_ASSETS",
};

const WTP = {
  Rendement: "00000001-0000-4000-a000-000000000001",
  Matching:  "00000001-0000-4000-a000-000000000002",
  Opbouw:    "00000001-0000-4000-a000-000000000003",
};

const MANAGERS = {
  EigenBeheer:    "00000003-0000-4000-a000-000000000001",
  ExternA:        "00000003-0000-4000-a000-000000000002",
  ExternB:        "00000003-0000-4000-a000-000000000003",
};

const BENCHMARK_GROUPS = {
  A: "00000004-0000-4000-a000-000000000001",
  B: "00000004-0000-4000-a000-000000000002",
  C: "00000004-0000-4000-a000-000000000003",
};

// Asset class → sub asset classes (matching init.sql names → lookup table)
const SUB_AC = {
  AC_WORLD:           { id: "10000000-0000-4000-a000-000000000001", ac: "Aandelen" },
  DEVELOPED_MARKETS:  { id: "10000000-0000-4000-a000-000000000002", ac: "Aandelen" },
  EMERGING_MARKETS:   { id: "10000000-0000-4000-a000-000000000003", ac: "Aandelen" },
  SOVEREIGN_EUROPE:   { id: "10000000-0000-4000-a000-000000000004", ac: "Obligaties" },
  CORPORATE_EUROPE:   { id: "10000000-0000-4000-a000-000000000005", ac: "Obligaties" },
  GOVERNMENT_BONDS:   { id: "10000000-0000-4000-a000-000000000006", ac: "Obligaties" },
  HIGH_YIELD:         { id: "10000000-0000-4000-a000-000000000007", ac: "Obligaties" },
  PRIVATE_EQUITY:     { id: "10000000-0000-4000-a000-000000000008", ac: "Alternatieven" },
  RE_DIRECT:          { id: "10000000-0000-4000-a000-000000000009", ac: "Vastgoed" },
  RE_INDIRECT:        { id: "10000000-0000-4000-a000-000000000010", ac: "Vastgoed" },
};

// Extra sub_asset_classes to add for broader coverage
const EXTRA_SUB_AC = [
  // Original init.sql entries — but with valid UUIDs (no 's' prefix)
  { id: "10000000-0000-4000-a000-000000000001", name: "AC WORLD",              asset_class_id: ASSET_CLASSES.Aandelen },
  { id: "10000000-0000-4000-a000-000000000002", name: "DEVELOPED MARKETS",     asset_class_id: ASSET_CLASSES.Aandelen },
  { id: "10000000-0000-4000-a000-000000000003", name: "EMERGING MARKETS",      asset_class_id: ASSET_CLASSES.Aandelen },
  { id: "10000000-0000-4000-a000-000000000004", name: "SOVEREIGN EUROPE",      asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "10000000-0000-4000-a000-000000000005", name: "CORPORATE EUROPE",      asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "10000000-0000-4000-a000-000000000006", name: "GOVERNMENT BONDS",      asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "10000000-0000-4000-a000-000000000007", name: "HIGH YIELD",            asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "10000000-0000-4000-a000-000000000008", name: "PRIVATE EQUITY",        asset_class_id: ASSET_CLASSES.Alternatieven },
  { id: "10000000-0000-4000-a000-000000000009", name: "REAL ESTATE DIRECT",    asset_class_id: ASSET_CLASSES.Vastgoed },
  { id: "10000000-0000-4000-a000-000000000010", name: "REAL ESTATE INDIRECT",  asset_class_id: ASSET_CLASSES.Vastgoed },
  // Additional sub-asset classes for broader coverage
  { id: "20000000-0000-4000-a000-000000000001", name: "EUROPE",              asset_class_id: ASSET_CLASSES.Aandelen },
  { id: "20000000-0000-4000-a000-000000000002", name: "UNITED STATES",       asset_class_id: ASSET_CLASSES.Aandelen },
  { id: "20000000-0000-4000-a000-000000000003", name: "JAPAN",               asset_class_id: ASSET_CLASSES.Aandelen },
  { id: "20000000-0000-4000-a000-000000000004", name: "DUURZAAM",            asset_class_id: ASSET_CLASSES.Aandelen },
  { id: "20000000-0000-4000-a000-000000000005", name: "CREDITS EUROPE",      asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "20000000-0000-4000-a000-000000000006", name: "HIGH YIELD EUROPE",   asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "20000000-0000-4000-a000-000000000007", name: "INFLATION LINKED BONDS EUROPE", asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "20000000-0000-4000-a000-000000000008", name: "GREENBONDS",          asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "20000000-0000-4000-a000-000000000009", name: "LDI",                 asset_class_id: ASSET_CLASSES.Obligaties },
  { id: "20000000-0000-4000-a000-000000000010", name: "HEDGE FUNDS",         asset_class_id: ASSET_CLASSES.Alternatieven },
  { id: "20000000-0000-4000-a000-000000000011", name: "RISK PARITY",         asset_class_id: ASSET_CLASSES.Alternatieven },
  { id: "20000000-0000-4000-a000-000000000012", name: "REALESTATE LISTED",   asset_class_id: ASSET_CLASSES.Vastgoed },
  { id: "20000000-0000-4000-a000-000000000013", name: "REALESTATE DIRECT",   asset_class_id: ASSET_CLASSES.Vastgoed },
  { id: "20000000-0000-4000-a000-000000000014", name: "COMMODITIES",         asset_class_id: ASSET_CLASSES.Grondstoffen },
  { id: "20000000-0000-4000-a000-000000000015", name: "INFRASTRUCTURE",      asset_class_id: ASSET_CLASSES.Infrastructuur },
  { id: "20000000-0000-4000-a000-000000000016", name: "CASH",                asset_class_id: ASSET_CLASSES.Liquiditeiten },
  { id: "20000000-0000-4000-a000-000000000018", name: "AGRICULTURE",         asset_class_id: ASSET_CLASSES.Grondstoffen },
];

// Benchmark catalog entries
const BM_CATALOG = {
  MSCI_WORLD:  "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
  MSCI_ACWI:   "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d",
  BLOOMBERG_EU: "7c8bd971-b05c-4141-9a27-7ee0d02137a5",
  ICE_BOFA:    "9644a84d-59d6-40fa-aee9-062fbc1ef9fc",
  CUSTOM_ESG:  "a1b2c3d4-e5f6-7890-abcd-ef0123456780",
  RIMES_PE:    "a1b2c3d4-e5f6-7890-abcd-ef0123456781",
  EURO_GOVT:   "a1b2c3d4-e5f6-7890-abcd-ef0123456782",
  GLOBAL_REIT: "a1b2c3d4-e5f6-7890-abcd-ef0123456783",
  MSCI_EM:     "9a1b2c3d-4e5f-6789-abcd-ef0123456784",
  BLOOMBERG_GL: "9a1b2c3d-4e5f-6789-abcd-ef0123456785",
  HFRX_GL:     "9a1b2c3d-4e5f-6789-abcd-ef0123456786",
  SP500:       "9a1b2c3d-4e5f-6789-abcd-ef0123456787",
  SP_GSCI:     "a2b1c3d4-e5f6-7890-abcd-ef0123456788",
  WORLD_INFRA: "a2b1c3d4-e5f6-7890-abcd-ef0123456789",
  BLOOMBERG_HY:"a2b1c3d4-e5f6-7890-abcd-ef0123456790",
  FTSE_EPRA:   "a2b1c3d4-e5f6-7890-abcd-ef0123456791",
  MSCI_HEALTH: "a2b1c3d4-e5f6-7890-abcd-ef0123456792",
};

// Asset class Dutch name → UUID map (for benchmark_catalog asset_class_id)
const acNameToCodeMap = {
  "Aandelen": ASSET_CLASSES.Aandelen,
  "Obligaties": ASSET_CLASSES.Obligaties,
  "Vastgoed": ASSET_CLASSES.Vastgoed,
  "Alternatieven": ASSET_CLASSES.Alternatieven,
  "Liquiditeiten": ASSET_CLASSES.Liquiditeiten,
  "Grondstoffen": ASSET_CLASSES.Grondstoffen,
  "Infrastructuur": ASSET_CLASSES.Infrastructuur,
};

// Full benchmark catalog tuples for seeding
const BENCHMARK_CATALOG = [
  ["9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1", "MSCI-WORLD-NR", "MSCI World Net Return", "Aandelen", "EUR", 1000.00, "MSCI"],
  ["b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d", "MSCI-ACWI-NR", "MSCI ACWI Net Return", "Aandelen", "EUR", 1200.00, "MSCI"],
  ["7c8bd971-b05c-4141-9a27-7ee0d02137a5", "BLOOMBERG-EU-AGG", "Bloomberg Euro Aggregate", "Obligaties", "EUR", 1000.00, "Bloomberg"],
  ["9644a84d-59d6-40fa-aee9-062fbc1ef9fc", "ICE-BOFA-EU-CORP", "ICE BofA Euro Corporate", "Obligaties", "EUR", 1000.00, "ICE BofA"],
  ["a1b2c3d4-e5f6-7890-abcd-ef0123456780", "CUSTOM-ESG-NL", "Duurzame NL Benchmark", "Aandelen", "EUR", 1500.00, "rimes"],
  ["a1b2c3d4-e5f6-7890-abcd-ef0123456781", "RIMES-PRIVATE-EQ", "Rimes Private Equity Index", "Alternatieven", "EUR", 2000.00, "rimes"],
  ["a1b2c3d4-e5f6-7890-abcd-ef0123456782", "EURO-GOVT-1-3Y", "Euro Government 1-3 Year", "Obligaties", "EUR", 800.00, "Bloomberg"],
  ["a1b2c3d4-e5f6-7890-abcd-ef0123456783", "GLOBAL-REIT-NR", "Global REIT Net Return", "Vastgoed", "EUR", 1500.00, "MSCI"],
  ["9a1b2c3d-4e5f-6789-abcd-ef0123456784", "MSCI-EM-NR", "MSCI Emerging Markets Net Return", "Aandelen", "USD", 1000.00, "MSCI"],
  ["9a1b2c3d-4e5f-6789-abcd-ef0123456785", "BLOOMBERG-GL-AGG", "Bloomberg Global Aggregate", "Obligaties", "USD", 1000.00, "Bloomberg"],
  ["9a1b2c3d-4e5f-6789-abcd-ef0123456786", "HFRX-GL-HEDGE", "HFRX Global Hedge Fund Index", "Alternatieven", "USD", 2500.00, "HFRX"],
  ["9a1b2c3d-4e5f-6789-abcd-ef0123456787", "S&P-500-NR", "S&P 500 Net Return", "Aandelen", "USD", 1000.00, "S&P"],
  ["a2b1c3d4-e5f6-7890-abcd-ef0123456788", "S&P-GSCI", "S&P GSCI Commodity Total Return", "Grondstoffen", "USD", 1500.00, "S&P"],
  ["a2b1c3d4-e5f6-7890-abcd-ef0123456789", "MSCI-WORLD-INFRA", "MSCI World Infrastructure Net Return", "Infrastructuur", "EUR", 1400.00, "MSCI"],
  ["a2b1c3d4-e5f6-7890-abcd-ef0123456790", "BLOOMBERG-GL-HY", "Bloomberg Global High Yield", "Obligaties", "USD", 1800.00, "Bloomberg"],
  ["a2b1c3d4-e5f6-7890-abcd-ef0123456791", "FTSE-EPRA-NAREIT-DEV", "FTSE EPRA Nareit Developed", "Vastgoed", "EUR", 1200.00, "FTSE Russell"],
  ["a2b1c3d4-e5f6-7890-abcd-ef0123456792", "MSCI-WORLD-HEALTH", "MSCI World Health Care Net Return", "Aandelen", "EUR", 1100.00, "MSCI"],
];

// Mapping: asset class key → suitable benchmarks for that AC
function benchmarksFor(acCode) {
  switch (acCode) {
    case "EQUITIES":      return [BM_CATALOG.MSCI_WORLD, BM_CATALOG.MSCI_ACWI, BM_CATALOG.MSCI_EM, BM_CATALOG.SP500, BM_CATALOG.CUSTOM_ESG, BM_CATALOG.MSCI_HEALTH];
    case "FIXED_INCOME":  return [BM_CATALOG.BLOOMBERG_EU, BM_CATALOG.ICE_BOFA, BM_CATALOG.EURO_GOVT, BM_CATALOG.BLOOMBERG_GL, BM_CATALOG.BLOOMBERG_HY];
    case "ALTERNATIVES":  return [BM_CATALOG.RIMES_PE, BM_CATALOG.HFRX_GL, BM_CATALOG.SP_GSCI];
    case "REAL_ASSETS":   return [BM_CATALOG.GLOBAL_REIT, BM_CATALOG.WORLD_INFRA, BM_CATALOG.FTSE_EPRA, BM_CATALOG.SP_GSCI];
    default:              return [BM_CATALOG.MSCI_WORLD, BM_CATALOG.BLOOMBERG_EU, BM_CATALOG.CUSTOM_ESG];
  }
}

// Sub-asset class helper: find a sub-asset class for a given asset class
const SUB_AC_BY_CODE = {
  EQUITIES:     ["AC WORLD", "DEVELOPED MARKETS", "EMERGING MARKETS", "EUROPE", "UNITED STATES", "JAPAN", "DUURZAAM"],
  FIXED_INCOME: ["SOVEREIGN EUROPE", "CORPORATE EUROPE", "GOVERNMENT BONDS", "HIGH YIELD", "CREDITS EUROPE", "HIGH YIELD EUROPE", "INFLATION LINKED BONDS EUROPE", "GREENBONDS", "LDI"],
  ALTERNATIVES: ["PRIVATE EQUITY", "HEDGE FUNDS", "RISK PARITY"],
  REAL_ASSETS:  ["REALESTATE LISTED", "REALESTATE DIRECT", "COMMODITIES", "INFRASTRUCTURE", "AGRICULTURE"],
  CASH:         ["CASH"],
};

// Map sub-asset-class text name → UUID
function subAcId(name) {
  const map = {
    "AC WORLD":              SUB_AC.AC_WORLD.id,
    "DEVELOPED MARKETS":     SUB_AC.DEVELOPED_MARKETS.id,
    "EMERGING MARKETS":      SUB_AC.EMERGING_MARKETS.id,
    "SOVEREIGN EUROPE":      SUB_AC.SOVEREIGN_EUROPE.id,
    "CORPORATE EUROPE":      SUB_AC.CORPORATE_EUROPE.id,
    "GOVERNMENT BONDS":      SUB_AC.GOVERNMENT_BONDS.id,
    "HIGH YIELD":            SUB_AC.HIGH_YIELD.id,
    "PRIVATE EQUITY":        "10000000-0000-4000-a000-000000000008",
    "REALESTATE LISTED":     "20000000-0000-4000-a000-000000000012",
    "REALESTATE DIRECT":     "20000000-0000-4000-a000-000000000013",
    "EUROPE":                "20000000-0000-4000-a000-000000000001",
    "UNITED STATES":         "20000000-0000-4000-a000-000000000002",
    "JAPAN":                 "20000000-0000-4000-a000-000000000003",
    "DUURZAAM":              "20000000-0000-4000-a000-000000000004",
    "CREDITS EUROPE":        "20000000-0000-4000-a000-000000000005",
    "HIGH YIELD EUROPE":     "20000000-0000-4000-a000-000000000006",
    "INFLATION LINKED BONDS EUROPE": "20000000-0000-4000-a000-000000000007",
    "GREENBONDS":            "20000000-0000-4000-a000-000000000008",
    "LDI":                   "20000000-0000-4000-a000-000000000009",
    "HEDGE FUNDS":           "20000000-0000-4000-a000-000000000010",
    "RISK PARITY":           "20000000-0000-4000-a000-000000000011",
    "COMMODITIES":           "20000000-0000-4000-a000-000000000014",
    "INFRASTRUCTURE":        "20000000-0000-4000-a000-000000000015",
    "CASH":                  "20000000-0000-4000-a000-000000000016",
    "AGRICULTURE":           "20000000-0000-4000-a000-000000000018",
  };
  return map[name] || null;
}

// ============================================================================
// CLIENTS & PORTFOLIOS
// ============================================================================
//
// Each entry: [id, name, externalRef, regelingType, [
//   [portfolioId, name, extRef, wtpKey, acCode, subAcName, managerKey, bgKey, currentBm]
// ]]

const clients = [
  // --- Existing clients (from init.sql) ---
  {
    id: "9f9280fc-9572-49d1-b81c-2a039652bc93",
    name: "Pensioenfonds Horizon",
    externalReference: "PF-HOR-001",
    regelingType: "pensioenuitkering",
    portfolios: [], // already seeded with 2 portfolios
  },
  {
    id: "7b9303c1-3a0d-4398-a5c2-740ea76dfe37",
    name: "Stichting Pensioen Zeker",
    externalReference: "PF-ZEK-002",
    regelingType: "premieovereenkomst",
    portfolios: [], // already seeded with 1 portfolio
  },

  // --- 10 NEW clients ---
  // 3. Bedrijfstakpensioenfonds Metaal & Techniek
  {
    id: "a0000000-0000-4000-a000-000000000003",
    name: "Bedrijfstakpensioenfonds Metaal & Techniek",
    externalReference: "PF-MET-003",
    regelingType: "premieovereenkomst",
    portfolios: [
      ["a0000000-0000-4000-a000-000000000301", "Rendementsportefeuille", "MET-RP", "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-000000000302", "Matchingportefeuille",  "MET-MP", "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-000000000303", "Opbouwportefeuille",    "MET-OP", "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-000000000304", "Duurzame portefeuille",  "MET-DP", "Rendement", "EQUITIES", "DUURZAAM", "ExternB", "C", "CUSTOM_ESG"],
      ["a0000000-0000-4000-a000-000000000305", "Vastgoedportefeuille",   "MET-VP", "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternA", "A", "GLOBAL_REIT"],
      ["a0000000-0000-4000-a000-000000000306", "Liquiditeiten",          "MET-LQ", "Matching", "CASH", "CASH", "EigenBeheer", "C", "MSCI_WORLD"],
    ],
  },

  // 4. Stichting Pensioenfonds Vervoer
  {
    id: "a0000000-0000-4000-a000-000000000004",
    name: "Stichting Pensioenfonds Vervoer",
    externalReference: "PF-VRV-004",
    regelingType: "pensioenuitkering",
    portfolios: [
      ["a0000000-0000-4000-a000-000000000401", "Return portefeuille",     "VRV-RET", "Rendement", "EQUITIES", "UNITED STATES", "ExternA", "A", "SP500"],
      ["a0000000-0000-4000-a000-000000000402", "Matching portefeuille",   "VRV-MP",  "Matching", "FIXED_INCOME", "GOVERNMENT BONDS", "EigenBeheer", "B", "EURO_GOVT"],
      ["a0000000-0000-4000-a000-000000000403", "Groei portefeuille",      "VRV-GR",  "Opbouw", "EQUITIES", "EMERGING MARKETS", "ExternA", "A", "MSCI_EM"],
      ["a0000000-0000-4000-a000-000000000404", "Europees krediet",        "VRV-EK",  "Rendement", "FIXED_INCOME", "CREDITS EUROPE", "ExternB", "B", "ICE_BOFA"],
      ["a0000000-0000-4000-a000-000000000405", "Inflatieportefeuille",    "VRV-IP",  "Matching", "FIXED_INCOME", "INFLATION LINKED BONDS EUROPE", "EigenBeheer", "C", "BLOOMBERG_GL"],
      ["a0000000-0000-4000-a000-000000000406", "Privé-equity",           "VRV-PE",  "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternA", "A", "RIMES_PE"],
      ["a0000000-0000-4000-a000-000000000407", "Infrastructuur",          "VRV-IF",  "Opbouw", "REAL_ASSETS", "INFRASTRUCTURE", "ExternB", "C", "WORLD_INFRA"],
    ],
  },

  // 5. Algemeen Pensioenfonds Bouw
  {
    id: "a0000000-0000-4000-a000-000000000005",
    name: "Algemeen Pensioenfonds Bouw",
    externalReference: "PF-BOU-005",
    regelingType: "kapitaalovereenkomst",
    portfolios: [
      ["a0000000-0000-4000-a000-000000000501", "Rendementsportefeuille",  "BOU-RP", "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-000000000502", "Matchingportefeuille",    "BOU-MP", "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-000000000503", "Opbouwportefeuille",      "BOU-OP", "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-000000000504", "Vastgoed fondsen",        "BOU-VF", "Rendement", "REAL_ASSETS", "REALESTATE DIRECT", "ExternB", "C", "FTSE_EPRA"],
      ["a0000000-0000-4000-a000-000000000505", "Groene obligaties",       "BOU-GO", "Matching", "FIXED_INCOME", "GREENBONDS", "ExternA", "B", "CUSTOM_ESG"],
      ["a0000000-0000-4000-a000-000000000506", "High yield",              "BOU-HY", "Rendement", "FIXED_INCOME", "HIGH YIELD", "ExternB", "C", "BLOOMBERG_HY"],
      ["a0000000-0000-4000-a000-000000000507", "Liquiditeiten",           "BOU-LQ", "Matching", "CASH", "CASH", "EigenBeheer", "A", "EURO_GOVT"],
      ["a0000000-0000-4000-a000-000000000508", "Hedge funds",             "BOU-HF", "Rendement", "ALTERNATIVES", "HEDGE FUNDS", "ExternA", "C", "HFRX_GL"],
    ],
  },

  // 6. Pensioenfonds Zorg & Welzijn
  {
    id: "a0000000-0000-4000-a000-000000000006",
    name: "Pensioenfonds Zorg & Welzijn",
    externalReference: "PF-ZWG-006",
    regelingType: "pensioenuitkering",
    portfolios: [
      ["a0000000-0000-4000-a000-000000000601", "Renteforfait",            "ZWG-RF", "Matching", "FIXED_INCOME", "LDI", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-000000000602", "Aandelen wereldwijd",     "ZWG-AW", "Rendement", "EQUITIES", "AC WORLD", "ExternA", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-000000000603", "Opbouwportefeuille",      "ZWG-OP", "Opbouw", "EQUITIES", "EUROPE", "ExternA", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-000000000604", "Gezondheidszorg",         "ZWG-GZ", "Rendement", "EQUITIES", "UNITED STATES", "ExternB", "C", "MSCI_HEALTH"],
      ["a0000000-0000-4000-a000-000000000605", "Kredietportefeuille",     "ZWG-KP", "Rendement", "FIXED_INCOME", "CORPORATE EUROPE", "ExternA", "B", "ICE_BOFA"],
      ["a0000000-0000-4000-a000-000000000606", "Duurzame portefeuille",   "ZWG-DP", "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "C", "CUSTOM_ESG"],
      ["a0000000-0000-4000-a000-000000000607", "Vastgoedportefeuille",    "ZWG-VP", "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternB", "A", "GLOBAL_REIT"],
      ["a0000000-0000-4000-a000-000000000608", "Inflatieswaps",           "ZWG-IS", "Matching", "FIXED_INCOME", "INFLATION LINKED BONDS EUROPE", "EigenBeheer", "C", "BLOOMBERG_GL"],
      ["a0000000-0000-4000-a000-000000000609", "Private Equity",          "ZWG-PE", "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternA", "A", "RIMES_PE"],
    ],
  },

  // 7. Stichting Pensioenfonds Detailhandel
  {
    id: "a0000000-0000-4000-a000-000000000007",
    name: "Stichting Pensioenfonds Detailhandel",
    externalReference: "PF-DET-007",
    regelingType: "premieovereenkomst",
    portfolios: [
      ["a0000000-0000-4000-a000-000000000701", "Rendement",               "DET-RP", "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-000000000702", "Matching",                "DET-MP", "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-000000000703", "Opbouw",                  "DET-OP", "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-000000000704", "Vastgoed",                "DET-VG", "Rendement", "REAL_ASSETS", "REALESTATE DIRECT", "ExternB", "C", "FTSE_EPRA"],
      ["a0000000-0000-4000-a000-000000000705", "High yield Europa",       "DET-HY", "Rendement", "FIXED_INCOME", "HIGH YIELD EUROPE", "ExternA", "B", "BLOOMBERG_HY"],
      ["a0000000-0000-4000-a000-000000000706", "Liquiditeiten",           "DET-LQ", "Matching", "CASH", "CASH", "EigenBeheer", "A", "EURO_GOVT"],
    ],
  },

  // 8. Bedrijfspensioenfonds Bakkerij
  {
    id: "a0000000-0000-4000-a000-000000000008",
    name: "Bedrijfspensioenfonds Bakkerij",
    externalReference: "PF-BAK-008",
    regelingType: "uitkeringsovereenkomst",
    portfolios: [
      ["a0000000-0000-4000-a000-000000000801", "Rendementsportefeuille",  "BAK-RP", "Rendement", "EQUITIES", "EUROPE", "ExternA", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-000000000802", "Matchingportefeuille",    "BAK-MP", "Matching", "FIXED_INCOME", "GOVERNMENT BONDS", "EigenBeheer", "B", "EURO_GOVT"],
      ["a0000000-0000-4000-a000-000000000803", "Groei portefeuille",      "BAK-GR", "Opbouw", "EQUITIES", "EMERGING MARKETS", "ExternA", "A", "MSCI_EM"],
      ["a0000000-0000-4000-a000-000000000804", "Kredietportefeuille",     "BAK-KP", "Rendement", "FIXED_INCOME", "CORPORATE EUROPE", "ExternB", "B", "ICE_BOFA"],
      ["a0000000-0000-4000-a000-000000000805", "Commoditeiten",           "BAK-CO", "Rendement", "REAL_ASSETS", "COMMODITIES", "ExternA", "C", "SP_GSCI"],
      ["a0000000-0000-4000-a000-000000000806", "Private equity",          "BAK-PE", "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternB", "A", "RIMES_PE"],
      ["a0000000-0000-4000-a000-000000000807", "Liquiditeiten",           "BAK-LQ", "Matching", "CASH", "CASH", "EigenBeheer", "C", "EURO_GOVT"],
    ],
  },

  // 9. Pensioenfonds Openbaar Vervoer
  {
    id: "a0000000-0000-4000-a000-000000000009",
    name: "Pensioenfonds Openbaar Vervoer",
    externalReference: "PF-OVV-009",
    regelingType: "pensioenuitkering",
    portfolios: [
      ["a0000000-0000-4000-a000-000000000901", "Return portefeuille",     "OVV-RET", "Rendement", "EQUITIES", "AC WORLD", "ExternA", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-000000000902", "Matching portefeuille",   "OVV-MP",  "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-000000000903", "Opbouw portefeuille",     "OVV-OP",  "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-000000000904", "Duurzame portefeuille",   "OVV-DP",  "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "C", "CUSTOM_ESG"],
      ["a0000000-0000-4000-a000-000000000905", "Vastgoed portefeuille",   "OVV-VP",  "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternB", "C", "GLOBAL_REIT"],
      ["a0000000-0000-4000-a000-000000000906", "Hedge fund portefeuille", "OVV-HF",  "Rendement", "ALTERNATIVES", "HEDGE FUNDS", "ExternA", "A", "HFRX_GL"],
      ["a0000000-0000-4000-a000-000000000907", "Inflatieportefeuille",    "OVV-IP",  "Matching", "FIXED_INCOME", "INFLATION LINKED BONDS EUROPE", "EigenBeheer", "B", "BLOOMBERG_GL"],
      ["a0000000-0000-4000-a000-000000000908", "Kortlopend",              "OVV-KL",  "Matching", "CASH", "CASH", "EigenBeheer", "C", "EURO_GOVT"],
      ["a0000000-0000-4000-a000-000000000909", "Japan aandelen",          "OVV-JP",  "Rendement", "EQUITIES", "JAPAN", "ExternB", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-000000000910", "Infrastructuur",          "OVV-IF",  "Opbouw", "REAL_ASSETS", "INFRASTRUCTURE", "ExternA", "C", "WORLD_INFRA"],
    ],
  },

  // 10. Stichting Pensioenfonds Landbouw
  {
    id: "a0000000-0000-4000-a000-000000000010",
    name: "Stichting Pensioenfonds Landbouw",
    externalReference: "PF-LAN-010",
    regelingType: "kapitaalovereenkomst",
    portfolios: [
      ["a0000000-0000-4000-a000-00000001001", "Rendementsportefeuille",  "LAN-RP", "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-00000001002", "Matchingportefeuille",    "LAN-MP", "Matching", "FIXED_INCOME", "GOVERNMENT BONDS", "EigenBeheer", "B", "EURO_GOVT"],
      ["a0000000-0000-4000-a000-00000001003", "Opbouwportefeuille",      "LAN-OP", "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-00000001004", "Agrarische portefeuille", "LAN-AP", "Rendement", "REAL_ASSETS", "AGRICULTURE", "ExternB", "C", "SP_GSCI"],
      ["a0000000-0000-4000-a000-00000001005", "Duurzame portefeuille",   "LAN-DP", "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "C", "CUSTOM_ESG"],
      ["a0000000-0000-4000-a000-00000001006", "Krediet Europa",          "LAN-KE", "Rendement", "FIXED_INCOME", "CREDITS EUROPE", "ExternA", "B", "ICE_BOFA"],
      ["a0000000-0000-4000-a000-00000001007", "Private equity",          "LAN-PE", "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternB", "A", "RIMES_PE"],
      ["a0000000-0000-4000-a000-00000001008", "Commoditeiten",           "LAN-CO", "Rendement", "REAL_ASSETS", "COMMODITIES", "ExternA", "C", "SP_GSCI"],
    ],
  },

  // 11. Algemeen Pensioenfonds Chemie
  {
    id: "a0000000-0000-4000-a000-000000000011",
    name: "Algemeen Pensioenfonds Chemie",
    externalReference: "PF-CHE-011",
    regelingType: "premieovereenkomst",
    portfolios: [
      ["a0000000-0000-4000-a000-00000001101", "Rendement",               "CHE-RP", "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-00000001102", "Matching",                "CHE-MP", "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-00000001103", "Opbouw",                  "CHE-OP", "Opbouw", "EQUITIES", "EUROPE", "ExternA", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-00000001104", "High yield",              "CHE-HY", "Rendement", "FIXED_INCOME", "HIGH YIELD", "ExternA", "C", "BLOOMBERG_HY"],
      ["a0000000-0000-4000-a000-00000001105", "LDI portefeuille",        "CHE-LI", "Matching", "FIXED_INCOME", "LDI", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-00000001106", "Vastgoed",                "CHE-VG", "Rendement", "REAL_ASSETS", "REALESTATE LISTED", "ExternB", "A", "FTSE_EPRA"],
      ["a0000000-0000-4000-a000-00000001107", "Risk parity",             "CHE-RP2","Rendement", "ALTERNATIVES", "RISK PARITY", "ExternA", "C", "HFRX_GL"],
      ["a0000000-0000-4000-a000-00000001108", "Liquiditeiten",           "CHE-LQ", "Matching", "CASH", "CASH", "EigenBeheer", "A", "EURO_GOVT"],
      ["a0000000-0000-4000-a000-00000001109", "Groene obligaties",       "CHE-GO", "Matching", "FIXED_INCOME", "GREENBONDS", "ExternB", "B", "CUSTOM_ESG"],
    ],
  },

  // 12. Pensioenfonds Techniek Nederland
  {
    id: "a0000000-0000-4000-a000-000000000012",
    name: "Pensioenfonds Techniek Nederland",
    externalReference: "PF-TEC-012",
    regelingType: "pensioenuitkering",
    portfolios: [
      ["a0000000-0000-4000-a000-00000001201", "Rendementsportefeuille",  "TEC-RP", "Rendement", "EQUITIES", "AC WORLD", "EigenBeheer", "A", "MSCI_ACWI"],
      ["a0000000-0000-4000-a000-00000001202", "Matchingportefeuille",    "TEC-MP", "Matching", "FIXED_INCOME", "SOVEREIGN EUROPE", "EigenBeheer", "B", "BLOOMBERG_EU"],
      ["a0000000-0000-4000-a000-00000001203", "Opbouwportefeuille",      "TEC-OP", "Opbouw", "EQUITIES", "DEVELOPED MARKETS", "ExternA", "A", "MSCI_WORLD"],
      ["a0000000-0000-4000-a000-00000001204", "VS aandelen",             "TEC-VS", "Rendement", "EQUITIES", "UNITED STATES", "ExternA", "A", "SP500"],
      ["a0000000-0000-4000-a000-00000001205", "Opkomende markten",       "TEC-OM", "Rendement", "EQUITIES", "EMERGING MARKETS", "ExternB", "C", "MSCI_EM"],
      ["a0000000-0000-4000-a000-00000001206", "Europese kredieten",      "TEC-EK", "Rendement", "FIXED_INCOME", "CREDITS EUROPE", "ExternA", "B", "ICE_BOFA"],
      ["a0000000-0000-4000-a000-00000001207", "Private equity",          "TEC-PE", "Rendement", "ALTERNATIVES", "PRIVATE EQUITY", "ExternB", "A", "RIMES_PE"],
      ["a0000000-0000-4000-a000-00000001208", "Vastgoedportefeuille",    "TEC-VP", "Rendement", "REAL_ASSETS", "REALESTATE DIRECT", "ExternA", "C", "GLOBAL_REIT"],
      ["a0000000-0000-4000-a000-00000001209", "Liquiditeiten",           "TEC-LQ", "Matching", "CASH", "CASH", "EigenBeheer", "C", "EURO_GOVT"],
      ["a0000000-0000-4000-a000-00000001210", "Duurzame portefeuille",   "TEC-DP", "Rendement", "EQUITIES", "DUURZAAM", "EigenBeheer", "B", "CUSTOM_ESG"],
    ],
  },
];

// ============================================================================
// HELPER — map Dutch asset class name to English code
// ============================================================================
function acNameToCode(acDutchName) {
  return AC_CODE_MAP[acDutchName] || acDutchName;
}

function acCodeToAssetClassId(acCode) {
  const map = {
    "EQUITIES": ASSET_CLASSES.Aandelen,
    "FIXED_INCOME": ASSET_CLASSES.Obligaties,
    "REAL_ASSETS": ASSET_CLASSES.Vastgoed,
    "ALTERNATIVES": ASSET_CLASSES.Alternatieven,
    "CASH": ASSET_CLASSES.Liquiditeiten,
  };
  return map[acCode] || ASSET_CLASSES.Aandelen;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log("🌱 BCM seed script starting…");

  // Clean up any partial data from previous failed seed runs
  await sql`
    DELETE FROM portfolios WHERE client_id IN (
      SELECT id FROM clients WHERE external_reference LIKE 'PF-%'
      AND id NOT IN ('9f9280fc-9572-49d1-b81c-2a039652bc93', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37')
    )
  `;
  await sql`
    DELETE FROM clients WHERE external_reference LIKE 'PF-%'
    AND id NOT IN ('9f9280fc-9572-49d1-b81c-2a039652bc93', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37')
  `;
  await sql`
    DELETE FROM sub_asset_classes WHERE id LIKE '1%' OR id LIKE '2%'
  `;
  console.log("  ✓ Partial data cleaned");

  // ── 0. Benchmark catalog (from init.sql) ──────────────────────────────
  for (const [id, code, name, assetClassName, currency, cost, provider] of BENCHMARK_CATALOG) {
    const assetClassId = acNameToCodeMap[assetClassName] || null;
    await sql`
      INSERT INTO benchmark_catalog (id, code, name, asset_class, asset_class_id, currency, cost, provider)
      VALUES (${id}, ${code}, ${name}, ${assetClassName}, ${assetClassId}, ${currency}, ${cost}, ${provider})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log("  ✓ Benchmark catalog seeded");

  // ── 1. Extra sub asset classes ──────────────────────────────────────────
  for (const sac of EXTRA_SUB_AC) {
    await sql`
      INSERT INTO sub_asset_classes (id, name, asset_class_id)
      VALUES (${sac.id}, ${sac.name}, ${sac.asset_class_id})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log("  ✓ Sub asset classes expanded");

  // ── 2. Clients & portfolios ────────────────────────────────────────────
  let totalPortfolios = 0;

  for (const client of clients) {
    // Skip re-inserting existing clients' portfolios — only add new ones
    if (client.portfolios.length > 0) {
      // Insert the client
      await sql`
        INSERT INTO clients (id, name, external_reference, regeling_type_id)
        VALUES (${client.id}, ${client.name}, ${client.externalReference}, (
          SELECT id FROM regeling_types WHERE name = ${client.regelingType} LIMIT 1
        ))
        ON CONFLICT (id) DO NOTHING
      `;

      // For each portfolio
      for (const pf of client.portfolios) {
        const [pfId, pfName, pfRef, wtpKey, acCode, subAcName, mgrKey, bgKey, bmKey] = pf;

        const wtpId = WTP[wtpKey];
        const acId = acCodeToAssetClassId(acCode);
        const mgrId = MANAGERS[mgrKey];
        const bgId = BENCHMARK_GROUPS[bgKey];
        const bmId = BM_CATALOG[bmKey];
        const sacId = subAcId(subAcName);

        if (!wtpId || !acId || !mgrId || !bgId || !bmId) {
          console.error(`  ✗ Missing FK for portfolio ${pfRef}:`, { wtpId, acId, mgrId, bgId, bmId, subAcId: sacId });
          continue;
        }

        await sql`
          INSERT INTO portfolios (
            id, client_id, name, external_reference,
            current_benchmark_id,
            wtp_classification_id, asset_class_id, sub_asset_class_id,
            manager_id, benchmark_id,
            asset_class, sub_asset_class,
            currency, active
          ) VALUES (
            ${pfId}, ${client.id}, ${pfName}, ${pfRef},
            ${bmId},
            ${wtpId}, ${acId}, ${sacId},
            ${mgrId}, ${bgId},
            ${acCode}, ${subAcName},
            'EUR', true
          )
          ON CONFLICT (id) DO NOTHING
        `;
        totalPortfolios++;
      }
    }
  }

  const clientCount = clients.length;
  console.log(`  ✓ ${clientCount} clients processed`);
  console.log(`  ✓ ${totalPortfolios} new portfolios inserted`);

  // ── 3. Summary ─────────────────────────────────────────────────────────
  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM clients WHERE status = 'active') AS total_clients,
      (SELECT COUNT(*) FROM portfolios WHERE active = true) AS total_portfolios,
      (SELECT COUNT(*) FROM clients WHERE status = 'active' AND id IN (
        SELECT DISTINCT client_id FROM portfolios WHERE active = true
      )) AS clients_with_portfolios
  `;

  const row = counts[0];
  console.log("\n📊 Seed Summary:");
  console.log(`  Clients (active):        ${row.total_clients}`);
  console.log(`  Portfolios (active):     ${row.total_portfolios}`);
  console.log(`  Clients w/ portfolios:   ${row.clients_with_portfolios}`);

  await sql.end();
  console.log("\n✅ Seed complete.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
