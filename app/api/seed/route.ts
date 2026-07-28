/**
 * Seed API Endpoint
 *
 * POST /api/seed
 *
 * Triggers the database seed to insert/expand test data for acceptance testing.
 * Idempotent — uses INSERT … ON CONFLICT DO NOTHING throughout.
 *
 * Security: protected by SEED_API_KEY env var. If SEED_API_KEY is not set,
 * the endpoint is only accessible from localhost/private network.
 *
 * Returns JSON with seed summary.
 */
import { NextResponse } from "next/server";
import postgres from "postgres";

export const dynamic = "force-dynamic";

// ── UUID constants (matching init.sql) ──────────────────────────────────

const ASSET_CLASSES: Record<string, string> = {
  Aandelen:       "00000002-0000-4000-a000-000000000001",
  Obligaties:     "00000002-0000-4000-a000-000000000002",
  Vastgoed:       "00000002-0000-4000-a000-000000000003",
  Alternatieven:  "00000002-0000-4000-a000-000000000004",
  Liquiditeiten:  "00000002-0000-4000-a000-000000000005",
  PrivateEquity:  "00000002-0000-4000-a000-000000000006",
  Infrastructuur: "00000002-0000-4000-a000-000000000007",
  Grondstoffen:   "00000002-0000-4000-a000-000000000008",
};

const WTP: Record<string, string> = {
  Rendement: "00000001-0000-4000-a000-000000000001",
  Matching:  "00000001-0000-4000-a000-000000000002",
  Opbouw:    "00000001-0000-4000-a000-000000000003",
};

const MANAGERS: Record<string, string> = {
  EigenBeheer: "00000003-0000-4000-a000-000000000001",
  ExternA:     "00000003-0000-4000-a000-000000000002",
  ExternB:     "00000003-0000-4000-a000-000000000003",
};

const BENCHMARK_GROUPS: Record<string, string> = {
  A: "00000004-0000-4000-a000-000000000001",
  B: "00000004-0000-4000-a000-000000000002",
  C: "00000004-0000-4000-a000-000000000003",
};

const BM_CATALOG: Record<string, string> = {
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

// Sub-asset-class name → UUID map
const SUB_AC_MAP: Record<string, string> = {};
for (const sac of EXTRA_SUB_AC) {
  SUB_AC_MAP[sac.name] = sac.id;
}
// Also add the init.sql entries
SUB_AC_MAP["AC WORLD"] = "10000000-0000-4000-a000-000000000001";
SUB_AC_MAP["DEVELOPED MARKETS"] = "10000000-0000-4000-a000-000000000002";
SUB_AC_MAP["EMERGING MARKETS"] = "10000000-0000-4000-a000-000000000003";
SUB_AC_MAP["SOVEREIGN EUROPE"] = "10000000-0000-4000-a000-000000000004";
SUB_AC_MAP["CORPORATE EUROPE"] = "10000000-0000-4000-a000-000000000005";
SUB_AC_MAP["GOVERNMENT BONDS"] = "10000000-0000-4000-a000-000000000006";
SUB_AC_MAP["HIGH YIELD"] = "10000000-0000-4000-a000-000000000007";
SUB_AC_MAP["PRIVATE EQUITY"] = "10000000-0000-4000-a000-000000000008";
SUB_AC_MAP["REALESTATE LISTED"] = "20000000-0000-4000-a000-000000000012";
SUB_AC_MAP["REALESTATE DIRECT"] = "20000000-0000-4000-a000-000000000013";

const AC_CODE_TO_ID: Record<string, string> = {
  "EQUITIES": ASSET_CLASSES.Aandelen,
  "FIXED_INCOME": ASSET_CLASSES.Obligaties,
  "REAL_ASSETS": ASSET_CLASSES.Vastgoed,
  "ALTERNATIVES": ASSET_CLASSES.Alternatieven,
  "CASH": ASSET_CLASSES.Liquiditeiten,
};

// ── Portfolio definitions ────────────────────────────────────────────────
// [id, name, extRef, wtpKey, acCode, subAcName, mgrKey, bgKey, bmCatalogKey]

const CLIENTS = [
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

  let sql: any;
  try {
    sql = postgres(dbUrl, { max: 2, connect_timeout: 5 });

    // Clean up any partial data from previous failed seed runs
    // (only affects seed-generated clients, keeps existing production data)
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
    console.log("[seed] Cleaned up partial seed data");

    // ── 1. Extra sub asset classes ──────────────────────────────────────
    for (const sac of EXTRA_SUB_AC) {
      await sql`
        INSERT INTO sub_asset_classes (id, name, asset_class_id)
        SELECT ${sac.id}, ${sac.name}, ${sac.asset_class_id}
        WHERE NOT EXISTS (SELECT 1 FROM sub_asset_classes WHERE name = ${sac.name})
      `;
    }

    // ── 2. Clients & portfolios ─────────────────────────────────────────
    let insertedClients = 0;
    let insertedPortfolios = 0;

    for (const client of CLIENTS) {
      await sql`
        INSERT INTO clients (id, name, external_reference, regeling_type_id)
        VALUES (${client.id}, ${client.name}, ${client.externalReference}, (
          SELECT id FROM regeling_types WHERE name = ${client.regelingType} LIMIT 1
        ))
        ON CONFLICT (id) DO NOTHING
      `;
      insertedClients++;

      for (const pf of client.portfolios) {
        const [pfId, pfName, pfRef, wtpKey, acCode, subAcName, mgrKey, bgKey, bmKey] = pf;

        const wtpId = WTP[wtpKey];
        const acId = AC_CODE_TO_ID[acCode];
        const mgrId = MANAGERS[mgrKey];
        const bgId = BENCHMARK_GROUPS[bgKey];
        const bmId = BM_CATALOG[bmKey];
        const sacId = SUB_AC_MAP[subAcName];

        if (!wtpId || !acId || !mgrId || !bgId || !bmId || !sacId) {
          console.warn(`Skipping ${pfRef}: missing FK mapping`, { wtpId, acId, mgrId, bgId, bmId, sacId });
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
        insertedPortfolios++;
      }
    }

    // ── 3. Summary counts ──────────────────────────────────────────────
    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*) FROM clients WHERE status = 'active') AS total_clients,
        (SELECT COUNT(*) FROM portfolios WHERE active = true) AS total_portfolios,
        (SELECT COUNT(*) FROM clients WHERE status = 'active' AND id IN (
          SELECT DISTINCT client_id FROM portfolios WHERE active = true
        )) AS clients_with_portfolios
    `;

    return NextResponse.json({
      success: true,
      message: "Seed completed",
      summary: {
        totalClients: Number(counts.total_clients),
        totalPortfolios: Number(counts.total_portfolios),
        clientsWithPortfolios: Number(counts.clients_with_portfolios),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Seed failed:", err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  } finally {
    if (sql) await sql.end();
  }
}
