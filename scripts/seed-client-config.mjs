#!/usr/bin/env node
/**
 * BCM Client Config Seed Script
 *
 * Seeds the normalized client_config schema tables with realistic data
 * so the admin page at /admin/client-config displays a filled table.
 *
 * Every data record is validated through ZOD schemas before insertion.
 * Idempotent: INSERT … ON CONFLICT DO NOTHING throughout.
 *
 * Usage:
 *   DATABASE_URL=postgres://bcm:***@localhost:5432/bcm node scripts/seed-client-config.mjs
 *
 * Or via npm:
 *   npm run db:seed
 */
import postgres from "postgres";

// ═════════════════════════════════════════════════════════════════════
// ZOD validation helpers (inline, no TS dependency)
// ═════════════════════════════════════════════════════════════════════

function validate(regex, value, label) {
  if (!regex.test(value)) {
    throw new Error(`Validation failed for ${label}: "${value}" does not match ${regex}`);
  }
}

function validateOptional(regex, value, label) {
  if (value != null && !regex.test(value)) {
    throw new Error(`Validation failed for ${label}: "${value}" does not match ${regex}`);
  }
}

// ═════════════════════════════════════════════════════════════════════
// Seed data — matching the DB CHECK constraints and ZOD schemas
// ═════════════════════════════════════════════════════════════════════

const ASSET_CLASSES = [
  { assetClassCode: "CS", assetClassName: "CASH" },
  { assetClassCode: "EQ", assetClassName: "EQUITIES" },
  { assetClassCode: "AL", assetClassName: "ALTERNATIVES" },
  { assetClassCode: "RA", assetClassName: "REAL_ASSETS" },
  { assetClassCode: "FI", assetClassName: "FIXED_INCOME" },
  { assetClassCode: "MA", assetClassName: "MULTI_ASSETS" },
  { assetClassCode: "OV", assetClassName: "OVERLAY" },
  { assetClassCode: "IM", assetClassName: "IMPACT" },
];

const SUB_ASSET_CLASSES = [
  // CASH (CS)
  { subAssetClassCode: "CAS", subAssetClassName: "CASH" },
  { subAssetClassCode: "FUN", subAssetClassName: "FUNDS" },
  { subAssetClassCode: "LIQ", subAssetClassName: "LIQUIDITIES" },
  // EQUITIES (EQ)
  { subAssetClassCode: "DEV", subAssetClassName: "DEVELOPED MARKETS" },
  { subAssetClassCode: "DMF", subAssetClassName: "DEVELOPED MARKETS FACTOR" },
  { subAssetClassCode: "DMS", subAssetClassName: "DEVELOPED MARKETS SMALL CAP" },
  { subAssetClassCode: "EME", subAssetClassName: "EMERGING MARKETS" },
  { subAssetClassCode: "ACX", subAssetClassName: "AC WORLD" },
  { subAssetClassCode: "EUR", subAssetClassName: "EUROPE" },
  { subAssetClassCode: "JAP", subAssetClassName: "JAPAN" },
  { subAssetClassCode: "AEJ", subAssetClassName: "ASIA EX-JAPAN" },
  { subAssetClassCode: "UNI", subAssetClassName: "UNITED STATES" },
  { subAssetClassCode: "NOR", subAssetClassName: "NORTH AMERICA" },
  { subAssetClassCode: "DUU", subAssetClassName: "DUURZAAM" },
  { subAssetClassCode: "MIL", subAssetClassName: "MILIEU & WATER" },
  { subAssetClassCode: "BIO", subAssetClassName: "BIODIVERSITY" },
  { subAssetClassCode: "EMF", subAssetClassName: "EMERGING MARKETS FACTOR" },
  { subAssetClassCode: "AWF", subAssetClassName: "AC WORLD FACTOR" },
  // ALTERNATIVES (AL)
  { subAssetClassCode: "PRI", subAssetClassName: "PRIVATE EQUITY" },
  { subAssetClassCode: "HED", subAssetClassName: "HEDGE FUNDS" },
  { subAssetClassCode: "PEI", subAssetClassName: "PRIVATE EQUITY IMPACT" },
  { subAssetClassCode: "HFC", subAssetClassName: "HEDGE FUNDS CTA" },
  { subAssetClassCode: "HFG", subAssetClassName: "HEDGE FUNDS GLOBAL MACRO" },
  { subAssetClassCode: "ILS", subAssetClassName: "INFLATION LINKED SECURITIES" },
  { subAssetClassCode: "GOL", subAssetClassName: "GOLD" },
  { subAssetClassCode: "RIS", subAssetClassName: "RISK PARITY" },
  { subAssetClassCode: "RIP", subAssetClassName: "RISK PREMIA" },
  // REAL_ASSETS (RA)
  { subAssetClassCode: "AGR", subAssetClassName: "AGRICULTURE" },
  { subAssetClassCode: "COM", subAssetClassName: "COMMODITIES" },
  { subAssetClassCode: "INF", subAssetClassName: "INFRASTRUCTURE" },
  { subAssetClassCode: "REA", subAssetClassName: "REALESTATE LISTED" },
  { subAssetClassCode: "RED", subAssetClassName: "REALESTATE DIRECT" },
  { subAssetClassCode: "RNL", subAssetClassName: "REALESTATE NON-LISTED NETHERLANDS" },
  { subAssetClassCode: "REN", subAssetClassName: "REALESTATE NON-LISTED INTERNATIONAL" },
  { subAssetClassCode: "RNA", subAssetClassName: "REALESTATE NON-LISTED EUROPE" },
  { subAssetClassCode: "RNB", subAssetClassName: "REALESTATE NON-LISTED ASIA PACIFIC" },
  { subAssetClassCode: "RNC", subAssetClassName: "REALESTATE NON-LISTED NORTH AMERICA" },
  { subAssetClassCode: "FOR", subAssetClassName: "FORESTRY" },
  // FIXED_INCOME (FI)
  { subAssetClassCode: "ABS", subAssetClassName: "ASSET BACKED SECURITIES" },
  { subAssetClassCode: "BAN", subAssetClassName: "BANKLOANS" },
  { subAssetClassCode: "CON", subAssetClassName: "CONVERTABLES" },
  { subAssetClassCode: "CCL", subAssetClassName: "CLO (COLLATERALIZED LOAN OBLIGATION)" },
  { subAssetClassCode: "COR", subAssetClassName: "CORPORATES EUROPE" },
  { subAssetClassCode: "CRE", subAssetClassName: "CREDITS EUROPE" },
  { subAssetClassCode: "CRG", subAssetClassName: "CREDITS GLOBAL" },
  { subAssetClassCode: "CRU", subAssetClassName: "CREDITS USA" },
  { subAssetClassCode: "DHM", subAssetClassName: "DEBT HY MICRO FINANCIERING" },
  { subAssetClassCode: "DIE", subAssetClassName: "DEBT IG ECA LOANS" },
  { subAssetClassCode: "DIW", subAssetClassName: "DEBT IG WSW LOANS" },
  { subAssetClassCode: "EMB", subAssetClassName: "EMERGING MARKETS BLEND" },
  { subAssetClassCode: "EMH", subAssetClassName: "EMERGING MARKETS HC" },
  { subAssetClassCode: "EML", subAssetClassName: "EMERGING MARKETS LC" },
  { subAssetClassCode: "GRE", subAssetClassName: "GREENBONDS" },
  { subAssetClassCode: "HYE", subAssetClassName: "HIGH YIELD EUROPE" },
  { subAssetClassCode: "HYG", subAssetClassName: "HIGH YIELD GLOBAL" },
  { subAssetClassCode: "HYU", subAssetClassName: "HIGH YIELD USA" },
  { subAssetClassCode: "ILB", subAssetClassName: "INFLATION LINKED BONDS EUROPE" },
  { subAssetClassCode: "INL", subAssetClassName: "INFLATION LINKED BONDS GLOBAL" },
  { subAssetClassCode: "LDI", subAssetClassName: "LDI" },
  { subAssetClassCode: "LIM", subAssetClassName: "LIQUID INVESTMENTS (MONEY MARKET)" },
  { subAssetClassCode: "MOR", subAssetClassName: "MORTGAGES" },
  { subAssetClassCode: "OVE", subAssetClassName: "OVERLAYFUNDS" },
  { subAssetClassCode: "SEC", subAssetClassName: "SECURITIZED" },
  { subAssetClassCode: "SOC", subAssetClassName: "SOCIAL" },
  { subAssetClassCode: "SOV", subAssetClassName: "SOVEREIGN EUROPE" },
  { subAssetClassCode: "SOG", subAssetClassName: "SOVEREIGN GLOBAL" },
  // MULTI_ASSETS (MA)
  { subAssetClassCode: "DEF", subAssetClassName: "DEFENSIVE" },
  { subAssetClassCode: "VER", subAssetClassName: "VERY DEFENSIVE" },
  { subAssetClassCode: "NEU", subAssetClassName: "NEUTRAL" },
  { subAssetClassCode: "OFF", subAssetClassName: "OFFENSIVE" },
  { subAssetClassCode: "VEO", subAssetClassName: "VERY OFFENSIVE" },
  { subAssetClassCode: "MIX", subAssetClassName: "MIX" },
  // OVERLAY (OV)
  { subAssetClassCode: "INT", subAssetClassName: "INTEREST" },
  { subAssetClassCode: "CUR", subAssetClassName: "CURRENCY" },
  { subAssetClassCode: "EQU", subAssetClassName: "EQUITY" },
  // IMPACT (IM)
  { subAssetClassCode: "IMP", subAssetClassName: "IMPACT" },
  { subAssetClassCode: "FID", subAssetClassName: "FIXED INCOME DEBT" },
  { subAssetClassCode: "CLI", subAssetClassName: "CLIMATE" },
];

const MANAGERS = [
  { managerCode: "ABD", managerName: "ABERDEEN" },
  { managerCode: "ACA", managerName: "ACADIAN" },
  { managerCode: "ADV", managerName: "ADVENT" },
  { managerCode: "AEG", managerName: "AEGON" },
  { managerCode: "ALB", managerName: "ALLIANCE BERNSTEIN" },
  { managerCode: "ALL", managerName: "ALLSPRING" },
  { managerCode: "ALM", managerName: "ALMAZARA" },
  { managerCode: "AQR", managerName: "AQR" },
  { managerCode: "ARR", managerName: "ARROWSTREET" },
  { managerCode: "AXA", managerName: "AXA" },
  { managerCode: "BAR", managerName: "BARCLAYS" },
  { managerCode: "BRG", managerName: "BARINGS" },
  { managerCode: "BLK", managerName: "BLACKROCK" },
  { managerCode: "BLB", managerName: "BLUEBAY" },
  { managerCode: "BNP", managerName: "BNP PARIBAS" },
  { managerCode: "BSM", managerName: "BSM" },
  { managerCode: "CAR", managerName: "CARDANO" },
  { managerCode: "CIT", managerName: "CITIBANK" },
  { managerCode: "CTI", managerName: "CTI" },
  { managerCode: "DDJ", managerName: "DDJ" },
  { managerCode: "DMH", managerName: "DE MUNT HYPOTHEKEN" },
  { managerCode: "DEU", managerName: "DEUTSCHE" },
  { managerCode: "DYC", managerName: "DYNAMIC CREDIT" },
  { managerCode: "EIG", managerName: "EIGEN BEHEER" },
  { managerCode: "FID", managerName: "FIDELITY" },
  { managerCode: "GOL", managerName: "GOLDMAN SACHS" },
  { managerCode: "HND", managerName: "HENDERSON" },
  { managerCode: "ING", managerName: "ING" },
  { managerCode: "INS", managerName: "INSIGHT" },
  { managerCode: "INT", managerName: "INTERMEDE" },
  { managerCode: "IRL", managerName: "IRISH LIFE" },
  { managerCode: "JPM", managerName: "JP MORGAN" },
  { managerCode: "KMP", managerName: "KEMPEN" },
  { managerCode: "KPR", managerName: "KOPERNIK" },
  { managerCode: "LAZ", managerName: "LAZARD" },
  { managerCode: "LEG", managerName: "LEGAL & GENERAL" },
  { managerCode: "LSV", managerName: "LSV" },
  { managerCode: "MGG", managerName: "M&G" },
  { managerCode: "MET", managerName: "METLIFE" },
  { managerCode: "MFS", managerName: "MFS" },
  { managerCode: "MGS", managerName: "MORGAN STANLEY" },
  { managerCode: "NIN", managerName: "NINETY ONE" },
  { managerCode: "NOM", managerName: "NOMURA" },
  { managerCode: "NOR", managerName: "NORDEA" },
  { managerCode: "NTR", managerName: "NORTHERN TRUST" },
  { managerCode: "OAK", managerName: "OAKTREE" },
  { managerCode: "PAY", managerName: "PAYDEN RYGEL" },
  { managerCode: "PGM", managerName: "PGIM" },
  { managerCode: "PIM", managerName: "PIMCO" },
  { managerCode: "PIN", managerName: "PINESTONE" },
  { managerCode: "PVF", managerName: "PVF HYPOTHEKEN" },
  { managerCode: "PZE", managerName: "PZENA" },
  { managerCode: "ROB", managerName: "ROBECO" },
  { managerCode: "RUS", managerName: "RUSSELL" },
  { managerCode: "SIX", managerName: "SIXTH STREET" },
  { managerCode: "SST", managerName: "STATESTREET" },
  { managerCode: "STH", managerName: "STONE HARBOUR" },
  { managerCode: "TRO", managerName: "T-ROWE" },
  { managerCode: "UBS", managerName: "UBS" },
];

const BENCHMARKS = [
  { benchmarkCode: "MSCI-WORLD-NR", benchmarkName: "MSCI World Net Return", rimesCode: "MWNR" },
  { benchmarkCode: "MSCI-ACWI-NR", benchmarkName: "MSCI ACWI Net Return", rimesCode: "MACWI" },
  { benchmarkCode: "BLOOMBERG-EU-AGG", benchmarkName: "Bloomberg Euro Aggregate", rimesCode: "BEUA" },
  { benchmarkCode: "ICE-BOFA-EU-CORP", benchmarkName: "ICE BofA Euro Corporate", rimesCode: "IBEC" },
  { benchmarkCode: "CUSTOM-ESG-NL", benchmarkName: "Duurzame NL Benchmark", rimesCode: "CESG" },
  { benchmarkCode: "RIMES-PRIVATE-EQ", benchmarkName: "Rimes Private Equity Index", rimesCode: "RPEQ" },
  { benchmarkCode: "EURO-GOVT-1-3Y", benchmarkName: "Euro Government 1-3 Year", rimesCode: "EG13" },
  { benchmarkCode: "GLOBAL-REIT-NR", benchmarkName: "Global REIT Net Return", rimesCode: "GREI" },
  { benchmarkCode: "MSCI-EM-NR", benchmarkName: "MSCI Emerging Markets Net Return", rimesCode: "MEMN" },
  { benchmarkCode: "BLOOMBERG-GL-AGG", benchmarkName: "Bloomberg Global Aggregate", rimesCode: "BGAG" },
  { benchmarkCode: "HFRX-GL-HEDGE", benchmarkName: "HFRX Global Hedge Fund Index", rimesCode: "HFRX" },
  { benchmarkCode: "S&P-500-NR", benchmarkName: "S&P 500 Net Return", rimesCode: "SP5N" },
  { benchmarkCode: "S&P-GSCI", benchmarkName: "S&P GSCI Commodity Total Return", rimesCode: "SPGS" },
  { benchmarkCode: "MSCI-WORLD-INFRA", benchmarkName: "MSCI World Infrastructure Net Return", rimesCode: "MWIN" },
  { benchmarkCode: "BLOOMBERG-GL-HY", benchmarkName: "Bloomberg Global High Yield", rimesCode: "BGHY" },
  { benchmarkCode: "FTSE-EPRA-NAREIT-DEV", benchmarkName: "FTSE EPRA Nareit Developed", rimesCode: "FEND" },
  { benchmarkCode: "MSCI-WORLD-HEALTH", benchmarkName: "MSCI World Health Care Net Return", rimesCode: "MWHC" },
];

const NPC_CLASSIFICATIONS = [
  { classificationName: "Match" },
  { classificationName: "Return" },
  { classificationName: "Opbouw" },
];

const PARENT_ACCOUNTS = [
  { parentAccountCode: "PENSIOENFONDSEN" },
  { parentAccountCode: "STICHTINGEN" },
  { parentAccountCode: "BEDRIJFSTAKKEN" },
];

const CLIENT_NAMES_BY_CODE = {
  BAK: "Bedrijfspensioenfonds Bakkerij",
  BOU: "Algemeen Pensioenfonds Bouw",
  CHE: "Algemeen Pensioenfonds Chemie",
  DET: "Stichting Pensioenfonds Detailhandel",
  HOR: "Pensioenfonds Horizon",
  LAN: "Stichting Pensioenfonds Landbouw",
  MET: "Bedrijfstakpensioenfonds Metaal & Techniek",
  OVV: "Pensioenfonds Openbaar Vervoer",
  TEC: "Pensioenfonds Techniek Nederland",
  VRV: "Stichting Pensioenfonds Vervoer",
  ZEK: "Stichting Pensioen Zeker",
  ZWG: "Pensioenfonds Zorg & Welzijn",
};

// Legacy `clients` rows mirroring the client_config.client codes. The app
// resolves change_requests.client_id via getPublicClientIdByCode(), which
// matches clients.external_reference LIKE 'PF-<CODE>-%'. The old seed.mjs
// inserted these; the consolidated seed must keep doing so or every
// change-request stage against a non-HOR/ZEK client violates the
// change_requests_client_id_fkey. UUIDs are the historical ones so the
// rows are stable across re-seeds and match migrate.mjs's demo data.
const LEGACY_CLIENTS = [
  { id: "9f9280fc-9572-49d1-b81c-2a039652bc93", code: "HOR", externalReference: "PF-HOR-001" },
  { id: "7b9303c1-3a0d-4398-a5c2-740ea76dfe37", code: "ZEK", externalReference: "PF-ZEK-002" },
  { id: "a0000000-0000-4000-a000-000000000003", code: "MET", externalReference: "PF-MET-003" },
  { id: "a0000000-0000-4000-a000-000000000004", code: "VRV", externalReference: "PF-VRV-004" },
  { id: "a0000000-0000-4000-a000-000000000005", code: "BOU", externalReference: "PF-BOU-005" },
  { id: "a0000000-0000-4000-a000-000000000006", code: "ZWG", externalReference: "PF-ZWG-006" },
  { id: "a0000000-0000-4000-a000-000000000007", code: "DET", externalReference: "PF-DET-007" },
  { id: "a0000000-0000-4000-a000-000000000008", code: "BAK", externalReference: "PF-BAK-008" },
  { id: "a0000000-0000-4000-a000-000000000009", code: "OVV", externalReference: "PF-OVV-009" },
  { id: "a0000000-0000-4000-a000-000000000010", code: "LAN", externalReference: "PF-LAN-010" },
  { id: "a0000000-0000-4000-a000-000000000011", code: "CHE", externalReference: "PF-CHE-011" },
  { id: "a0000000-0000-4000-a000-000000000012", code: "TEC", externalReference: "PF-TEC-012" },
];

// ═════════════════════════════════════════════════════════════════════
// Portfolio Configuration seed data
// Each entry defines a single portfolio_configuration row with all
// dimensions. The primary_account_id is derived from the dimensions.
// ═════════════════════════════════════════════════════════════════════

const PORTFOLIO_CONFIGS = [
  // Pensioenfonds Horizon (HOR) — 2 portfolios
  { portfolioCode: "HORRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Horizon Rendementsportefeuille Aandelen Wereldwijd", shortName: "HOR EQ ACX" },
  { portfolioCode: "HORMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Horizon Matchingportefeuille Overheid Europa", shortName: "HOR FI SOV" },

  // Stichting Pensioen Zeker (ZEK) — 1 portfolio
  { portfolioCode: "ZEKRET", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "Zeker Returnportefeuille Ontwikkelde Markten", shortName: "ZEK EQ DEV" },

  // Metaal & Techniek (MET) — 6 portfolios
  { portfolioCode: "METRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Metaal Rendementsportefeuille Aandelen Wereldwijd", shortName: "MET EQ ACX" },
  { portfolioCode: "METMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Metaal Matchingportefeuille Overheid Europa", shortName: "MET FI SOV" },
  { portfolioCode: "METOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Metaal Opbouwportefeuille Ontwikkelde Markten", shortName: "MET EQ DEV" },
  { portfolioCode: "METDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "BLK", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Metaal Duurzame Portefeuille Duurzaam", shortName: "MET EQ DUU" },
  { portfolioCode: "METVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "ROB", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Metaal Vastgoedportefeuille REITs", shortName: "MET RA REA" },
  { portfolioCode: "METLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 1, longName: "Metaal Liquiditeiten Cash", shortName: "MET CS CAS" },

  // Vervoer (VRV) — 7 portfolios
  { portfolioCode: "VRVRET", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "ROB", benchmarkCode: "S&P-500-NR", npcClassificationId: 2, longName: "Vervoer Returnportefeuille Verenigde Staten", shortName: "VRV EQ UNI" },
  { portfolioCode: "VRVMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Vervoer Matchingportefeuille Overheid Europa", shortName: "VRV FI SOV" },
  { portfolioCode: "VRVGR", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "ROB", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 3, longName: "Vervoer Groeiportefeuille Opkomende Markten", shortName: "VRV EQ EME" },
  { portfolioCode: "VRVEK", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "BLK", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Vervoer Europees Krediet Credits Europa", shortName: "VRV FI CRE" },
  { portfolioCode: "VRVIP", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "Vervoer Inflatieportefeuille ILB", shortName: "VRV FI ILB" },
  { portfolioCode: "VRVPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "ROB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Vervoer Private Equity", shortName: "VRV AL PRI" },
  { portfolioCode: "VRVIF", assetClassCode: "RA", subAssetClassCode: "INF", managerCode: "BLK", benchmarkCode: "MSCI-WORLD-INFRA", npcClassificationId: 3, longName: "Vervoer Infrastructuur", shortName: "VRV RA INF" },

  // Bouw (BOU) — 8 portfolios
  { portfolioCode: "BOURP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Bouw Rendementsportefeuille Aandelen Wereldwijd", shortName: "BOU EQ ACX" },
  { portfolioCode: "BOUMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Bouw Matchingportefeuille Overheid Europa", shortName: "BOU FI SOV" },
  { portfolioCode: "BOUOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Bouw Opbouwportefeuille Ontwikkelde Markten", shortName: "BOU EQ DEV" },
  { portfolioCode: "BOUVF", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "BLK", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Bouw Vastgoedfondsen Direct Vastgoed", shortName: "BOU RA RED" },
  { portfolioCode: "BOUGO", assetClassCode: "FI", subAssetClassCode: "GRE", managerCode: "ROB", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 1, longName: "Bouw Groene Obligaties Greenbonds", shortName: "BOU FI GRE" },
  { portfolioCode: "BOUHY", assetClassCode: "FI", subAssetClassCode: "HYG", managerCode: "BLK", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Bouw High Yield Global", shortName: "BOU FI HYG" },
  { portfolioCode: "BOULQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bouw Liquiditeiten Cash", shortName: "BOU CS CAS" },
  { portfolioCode: "BOUHF", assetClassCode: "AL", subAssetClassCode: "HED", managerCode: "ROB", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "Bouw Hedge Funds", shortName: "BOU AL HED" },

  // Zorg & Welzijn (ZWG) — 9 portfolios
  { portfolioCode: "ZWGRF", assetClassCode: "FI", subAssetClassCode: "LDI", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Zorg Renteforfait LDI", shortName: "ZWG FI LDI" },
  { portfolioCode: "ZWGAW", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "ROB", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Zorg Aandelen Wereldwijd AC World", shortName: "ZWG EQ ACX" },
  { portfolioCode: "ZWGOP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Zorg Opbouwportefeuille Europa", shortName: "ZWG EQ EUR" },
  { portfolioCode: "ZWGGZ", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "BLK", benchmarkCode: "MSCI-WORLD-HEALTH", npcClassificationId: 2, longName: "Zorg Gezondheidszorg Verenigde Staten", shortName: "ZWG EQ UNI" },
  { portfolioCode: "ZWGKP", assetClassCode: "FI", subAssetClassCode: "COR", managerCode: "ROB", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Zorg Kredietportefeuille Corporates Europa", shortName: "ZWG FI COR" },
  { portfolioCode: "ZWGDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Zorg Duurzame Portefeuille Duurzaam", shortName: "ZWG EQ DUU" },
  { portfolioCode: "ZWGVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "BLK", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Zorg Vastgoedportefeuille REITs", shortName: "ZWG RA REA" },
  { portfolioCode: "ZWGIS", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "Zorg Inflatieswaps ILB", shortName: "ZWG FI ILB" },
  { portfolioCode: "ZWGPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "ROB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Zorg Private Equity", shortName: "ZWG AL PRI" },

  // Detailhandel (DET) — 6 portfolios
  { portfolioCode: "DETRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Detailhandel Rendement AC World", shortName: "DET EQ ACX" },
  { portfolioCode: "DETMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Detailhandel Matching Overheid Europa", shortName: "DET FI SOV" },
  { portfolioCode: "DETOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Detailhandel Opbouw Ontwikkelde Markten", shortName: "DET EQ DEV" },
  { portfolioCode: "DETVG", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "BLK", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Detailhandel Vastgoed Direct", shortName: "DET RA RED" },
  { portfolioCode: "DETHY", assetClassCode: "FI", subAssetClassCode: "HYE", managerCode: "ROB", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Detailhandel High Yield Europa", shortName: "DET FI HYE" },
  { portfolioCode: "DETLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Detailhandel Liquiditeiten Cash", shortName: "DET CS CAS" },

  // Bakkerij (BAK) — 7 portfolios
  { portfolioCode: "BAKRP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "ROB", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Bakkerij Rendementsportefeuille Europa", shortName: "BAK EQ EUR" },
  { portfolioCode: "BAKMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bakkerij Matchingportefeuille Overheid", shortName: "BAK FI SOV" },
  { portfolioCode: "BAKGR", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "ROB", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 3, longName: "Bakkerij Groei Opkomende Markten", shortName: "BAK EQ EME" },
  { portfolioCode: "BAKKP", assetClassCode: "FI", subAssetClassCode: "COR", managerCode: "BLK", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Bakkerij Kredietportefeuille Corporates", shortName: "BAK FI COR" },
  { portfolioCode: "BAKCO", assetClassCode: "RA", subAssetClassCode: "COM", managerCode: "ROB", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Bakkerij Commoditeiten", shortName: "BAK RA COM" },
  { portfolioCode: "BAKPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "BLK", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Bakkerij Private Equity", shortName: "BAK AL PRI" },
  { portfolioCode: "BAKLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bakkerij Liquiditeiten Cash", shortName: "BAK CS CAS" },

  // Openbaar Vervoer (OVV) — 10 portfolios
  { portfolioCode: "OVVRET", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "OVV Returnportefeuille AC World", shortName: "OVV EQ ACX" },
  { portfolioCode: "OVVMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "OVV Matchingportefeuille Overheid Europa", shortName: "OVV FI SOV" },
  { portfolioCode: "OVVOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "ROB", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 3, longName: "OVV Opbouwportefeuille Ontwikkelde Markten", shortName: "OVV EQ DEV" },
  { portfolioCode: "OVVDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "OVV Duurzame Portefeuille Duurzaam", shortName: "OVV EQ DUU" },
  { portfolioCode: "OVVVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "BLK", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "OVV Vastgoedportefeuille REITs", shortName: "OVV RA REA" },
  { portfolioCode: "OVVHF", assetClassCode: "AL", subAssetClassCode: "HED", managerCode: "ROB", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "OVV Hedge Fund Portefeuille", shortName: "OVV AL HED" },
  { portfolioCode: "OVVIP", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "OVV Inflatieportefeuille ILB", shortName: "OVV FI ILB" },
  { portfolioCode: "OVVKL", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "OVV Kortlopend Cash", shortName: "OVV CS CAS" },
  { portfolioCode: "OVVJP", assetClassCode: "EQ", subAssetClassCode: "JAP", managerCode: "BLK", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "OVV Japan Aandelen", shortName: "OVV EQ JAP" },
  { portfolioCode: "OVVIF", assetClassCode: "RA", subAssetClassCode: "INF", managerCode: "ROB", benchmarkCode: "MSCI-WORLD-INFRA", npcClassificationId: 3, longName: "OVV Infrastructuur", shortName: "OVV RA INF" },

  // Landbouw (LAN) — 8 portfolios
  { portfolioCode: "LANRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Landbouw Rendementsportefeuille AC World", shortName: "LAN EQ ACX" },
  { portfolioCode: "LANMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Landbouw Matchingportefeuille Overheid", shortName: "LAN FI SOV" },
  { portfolioCode: "LANOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Landbouw Opbouwportefeuille Ontwikkelde Markten", shortName: "LAN EQ DEV" },
  { portfolioCode: "LANAP", assetClassCode: "RA", subAssetClassCode: "AGR", managerCode: "BLK", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Landbouw Agrarische Portefeuille", shortName: "LAN RA AGR" },
  { portfolioCode: "LANDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Landbouw Duurzame Portefeuille", shortName: "LAN EQ DUU" },
  { portfolioCode: "LANKE", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "ROB", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Landbouw Krediet Europa", shortName: "LAN FI CRE" },
  { portfolioCode: "LANPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "BLK", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Landbouw Private Equity", shortName: "LAN AL PRI" },
  { portfolioCode: "LANCO", assetClassCode: "RA", subAssetClassCode: "COM", managerCode: "ROB", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Landbouw Commoditeiten", shortName: "LAN RA COM" },

  // Chemie (CHE) — 9 portfolios
  { portfolioCode: "CHERP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Chemie Rendement AC World", shortName: "CHE EQ ACX" },
  { portfolioCode: "CHEMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Chemie Matching Overheid Europa", shortName: "CHE FI SOV" },
  { portfolioCode: "CHEOP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "ROB", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Chemie Opbouw Europa", shortName: "CHE EQ EUR" },
  { portfolioCode: "CHEHY", assetClassCode: "FI", subAssetClassCode: "HYG", managerCode: "ROB", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Chemie High Yield Global", shortName: "CHE FI HYG" },
  { portfolioCode: "CHELI", assetClassCode: "FI", subAssetClassCode: "LDI", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Chemie LDI Portefeuille", shortName: "CHE FI LDI" },
  { portfolioCode: "CHEVG", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "BLK", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Chemie Vastgoed REITs", shortName: "CHE RA REA" },
  { portfolioCode: "CHERP2", assetClassCode: "AL", subAssetClassCode: "RIS", managerCode: "ROB", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "Chemie Risk Parity", shortName: "CHE AL RIS" },
  { portfolioCode: "CHELQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Chemie Liquiditeiten Cash", shortName: "CHE CS CAS" },
  { portfolioCode: "CHEGO", assetClassCode: "FI", subAssetClassCode: "GRE", managerCode: "BLK", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 1, longName: "Chemie Groene Obligaties", shortName: "CHE FI GRE" },

  // Techniek Nederland (TEC) — 10 portfolios
  { portfolioCode: "TECRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "Techniek Rendementsportefeuille AC World", shortName: "TEC EQ ACX" },
  { portfolioCode: "TECMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Techniek Matchingportefeuille Overheid", shortName: "TEC FI SOV" },
  { portfolioCode: "TECOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "ROB", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 3, longName: "Techniek Opbouwportefeuille Ontwikkelde Markten", shortName: "TEC EQ DEV" },
  { portfolioCode: "TECVS", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "ROB", benchmarkCode: "S&P-500-NR", npcClassificationId: 2, longName: "Techniek VS Aandelen", shortName: "TEC EQ UNI" },
  { portfolioCode: "TECOM", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "BLK", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 2, longName: "Techniek Opkomende Markten", shortName: "TEC EQ EME" },
  { portfolioCode: "TECEK", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "ROB", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Techniek Europese Kredieten", shortName: "TEC FI CRE" },
  { portfolioCode: "TECPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "BLK", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Techniek Private Equity", shortName: "TEC AL PRI" },
  { portfolioCode: "TECVP", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "ROB", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Techniek Vastgoedportefeuille Direct", shortName: "TEC RA RED" },
  { portfolioCode: "TECLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Techniek Liquiditeiten Cash", shortName: "TEC CS CAS" },
  { portfolioCode: "TECDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Techniek Duurzame Portefeuille", shortName: "TEC EQ DUU" },
];

// ═════════════════════════════════════════════════════════════════════
// Primary account ID generation
// ═════════════════════════════════════════════════════════════════════

function clientCodeFromPortfolio(portfolioCode) {
  return portfolioCode.slice(0, 3).toUpperCase();
}

function generatePrimaryAccountId(clientCode, assetClassCode, subAssetClassCode, managerCode) {
  return `${clientCode}*${assetClassCode}${subAssetClassCode}*${managerCode}`.toUpperCase();
}

// Validate that a configuration's primary_account_id matches its dimensions
function validateConfig(cfg) {
  const expected = generatePrimaryAccountId(clientCodeFromPortfolio(cfg.portfolioCode), cfg.assetClassCode, cfg.subAssetClassCode, cfg.managerCode);
  validate(/^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$/, expected, `primary_account_id for ${cfg.portfolioCode}`);
}

const SUB_ASSET_CLASS_ASSET_CODE = {
  CAS: "CS", FUN: "CS", LIQ: "CS",
  DEV: "EQ", DMF: "EQ", DMS: "EQ", EME: "EQ", ACX: "EQ", EUR: "EQ", JAP: "EQ", AEJ: "EQ", UNI: "EQ", NOR: "EQ", DUU: "EQ", MIL: "EQ", BIO: "EQ", EMF: "EQ", AWF: "EQ",
  PRI: "AL", HED: "AL", PEI: "AL", HFC: "AL", HFG: "AL", ILS: "AL", GOL: "AL", RIS: "AL", RIP: "AL",
  AGR: "RA", COM: "RA", INF: "RA", REA: "RA", RED: "RA", RNL: "RA", REN: "RA", RNA: "RA", RNB: "RA", RNC: "RA", FOR: "RA",
  ABS: "FI", BAN: "FI", CON: "FI", CCL: "FI", COR: "FI", CRE: "FI", CRG: "FI", CRU: "FI", DHM: "FI", DIE: "FI", DIW: "FI", EMB: "FI", EMH: "FI", EML: "FI", GRE: "FI", HYE: "FI", HYG: "FI", HYU: "FI", ILB: "FI", INL: "FI", LDI: "FI", LIM: "FI", MOR: "FI", OVE: "FI", SEC: "FI", SOC: "FI", SOV: "FI", SOG: "FI",
  DEF: "MA", VER: "MA", NEU: "MA", OFF: "MA", VEO: "MA", MIX: "MA",
  INT: "OV", CUR: "OV", EQU: "OV",
  IMP: "IM", FID: "IM", CLI: "IM",
};

async function ensureClientConfigSchema(sql) {
  await sql`CREATE SCHEMA IF NOT EXISTS client_config`;

  await sql`CREATE TABLE IF NOT EXISTS client_config.parent_account (
    parent_account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_account_code varchar(16) NOT NULL UNIQUE
  )`;

  await sql`CREATE TABLE IF NOT EXISTS client_config.client (
    client_code varchar(3) PRIMARY KEY CHECK (client_code ~ '^[A-Z0-9]{1,3}$'),
    client_name varchar(100) NOT NULL UNIQUE
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
    sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
    sub_asset_class_name varchar(100) NOT NULL,
    sort_order integer,
    UNIQUE (asset_class_id, sub_asset_class_code),
    UNIQUE (asset_class_id, sub_asset_class_name)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS client_config.portfolio_configuration (
    primary_account_id varchar(13) PRIMARY KEY CHECK (primary_account_id ~ '^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$'),
    client_code varchar(3) NOT NULL REFERENCES client_config.client(client_code),
    portfolio_code varchar(15) NOT NULL REFERENCES client_config.portfolio(portfolio_code),
    asset_class_code char(2) NOT NULL REFERENCES client_config.asset_class(asset_class_code),
    sub_asset_class_code char(3) NOT NULL CHECK (sub_asset_class_code ~ '^[A-Z]{3}$'),
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
}

// ═════════════════════════════════════════════════════════════════════
// MAIN — seed the client_config schema
// ═════════════════════════════════════════════════════════════════════

export async function seedClientConfig(sql, options = {}) {
  const log = options.silent ? () => {} : console.log;
  log("🌱 BCM client_config seed starting…");

  // Validate all input data before any DB operations
  log("  Validating seed data…");
  for (const ac of ASSET_CLASSES) {
    validate(/^[A-Z]{2}$/, ac.assetClassCode, `asset_class_code ${ac.assetClassCode}`);
  }
  for (const sac of SUB_ASSET_CLASSES) {
    validate(/^[A-Z]{3}$/, sac.subAssetClassCode, `sub_asset_class_code ${sac.subAssetClassCode}`);
  }
  for (const mgr of MANAGERS) {
    validate(/^[A-Z0-9]{3}$/, mgr.managerCode, `manager_code ${mgr.managerCode}`);
  }
  for (const bm of BENCHMARKS) {
    validate(/^.{1,60}$/, bm.benchmarkCode, `benchmark_code ${bm.benchmarkCode}`);
  }
  for (const cfg of PORTFOLIO_CONFIGS) {
    validateConfig(cfg);
  }
  log("  ✓ All seed data validated against format constraints");

  await ensureClientConfigSchema(sql);

  // ── 0. Populate asset_class and sub_asset_class ─────────────────
  log("  Seeding asset_class and sub_asset_class…");
  for (const ac of ASSET_CLASSES) {
    await sql`
      INSERT INTO client_config.asset_class (asset_class_code, asset_class_name)
      VALUES (${ac.assetClassCode}, ${ac.assetClassName})
      ON CONFLICT (asset_class_code) DO UPDATE SET asset_class_name = EXCLUDED.asset_class_name
    `;
  }

  const sortCounters = {};
  for (const sac of SUB_ASSET_CLASSES) {
    const assetClassCode = SUB_ASSET_CLASS_ASSET_CODE[sac.subAssetClassCode];
    if (!assetClassCode) {
      throw new Error(`Missing asset class mapping for sub_asset_class ${sac.subAssetClassCode}`);
    }
    sortCounters[assetClassCode] = (sortCounters[assetClassCode] ?? 0) + 1;
    await sql`
      INSERT INTO client_config.sub_asset_class (
        asset_class_id,
        sub_asset_class_code,
        sub_asset_class_name,
        sort_order
      )
      SELECT asset_class_id, ${sac.subAssetClassCode}, ${sac.subAssetClassName}, ${sortCounters[assetClassCode]}
      FROM client_config.asset_class
      WHERE asset_class_code = ${assetClassCode}
      ON CONFLICT (asset_class_id, sub_asset_class_code) DO UPDATE SET
        sub_asset_class_name = EXCLUDED.sub_asset_class_name,
        sort_order = EXCLUDED.sort_order
    `;
  }
  log(`  ✓ ${ASSET_CLASSES.length} asset classes, ${SUB_ASSET_CLASSES.length} sub asset classes`);

  // ── 1. Populate parent_account ──────────────────────────────────
  log("  Seeding parent_account…");
  for (const pa of PARENT_ACCOUNTS) {
    await sql`
      INSERT INTO client_config.parent_account (parent_account_code)
      VALUES (${pa.parentAccountCode})
      ON CONFLICT (parent_account_code) DO NOTHING
    `;
  }

  // But we need to get the actual IDs that were generated
  const parentAccounts = await sql`SELECT parent_account_id, parent_account_code FROM client_config.parent_account ORDER BY parent_account_id`;
  const paMap = Object.fromEntries(parentAccounts.map((r) => [r.parent_account_code, r.parent_account_id]));
  log(`  ✓ ${parentAccounts.length} parent accounts`);

  // ── 2. Populate client and portfolio ─────────────────────────────
  log("  Seeding client…");
  const clientCodes = [...new Set(PORTFOLIO_CONFIGS.map((c) => clientCodeFromPortfolio(c.portfolioCode)))];
  for (const code of clientCodes) {
    const clientName = CLIENT_NAMES_BY_CODE[code] ?? code;
    await sql`
      INSERT INTO client_config.client (client_code, client_name)
      VALUES (${code}, ${clientName})
      ON CONFLICT (client_code) DO UPDATE SET client_name = EXCLUDED.client_name
    `;
  }
  log(`  ✓ ${clientCodes.length} clients`);

  // Also mirror into the legacy `clients` table so getPublicClientIdByCode()
  // (external_reference LIKE 'PF-<CODE>-%') resolves a real clients.id for
  // change_requests.client_id. ON CONFLICT (id) DO NOTHING keeps the rows
  // stable and idempotent with migrate.mjs's demo data (same UUIDs).
  for (const lc of LEGACY_CLIENTS) {
    if (!clientCodes.includes(lc.code)) continue;
    await sql`
      INSERT INTO clients (id, name, external_reference)
      VALUES (${lc.id}, ${CLIENT_NAMES_BY_CODE[lc.code] ?? lc.code}, ${lc.externalReference})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  log(`  ✓ ${LEGACY_CLIENTS.filter((lc) => clientCodes.includes(lc.code)).length} legacy clients`);

  log("  Seeding portfolio…");
  const portfolioCodes = [...new Set(PORTFOLIO_CONFIGS.map((c) => c.portfolioCode))];
  let insertedPortfolios = 0;
  for (const code of portfolioCodes) {
    await sql`
      INSERT INTO client_config.portfolio (portfolio_code)
      VALUES (${code})
      ON CONFLICT (portfolio_code) DO NOTHING
    `;
    insertedPortfolios++;
  }
  log(`  ✓ ${insertedPortfolios} portfolios`);

  // ── 4. Populate manager ──────────────────────────────────────────
  log("  Seeding manager…");
  let mgrCount = 0;
  for (const mgr of MANAGERS) {
    await sql`
      INSERT INTO client_config.manager (manager_code, manager_name)
      VALUES (${mgr.managerCode}, ${mgr.managerName})
      ON CONFLICT (manager_code) DO NOTHING
    `;
    mgrCount++;
  }
  log(`  ✓ ${mgrCount} managers`);

  // ── 5. Populate benchmark ────────────────────────────────────────
  log("  Seeding benchmark…");
  let bmCount = 0;
  for (const bm of BENCHMARKS) {
    await sql`
      INSERT INTO client_config.benchmark (benchmark_code, benchmark_name, rimes_code)
      VALUES (${bm.benchmarkCode}, ${bm.benchmarkName}, ${bm.rimesCode})
      ON CONFLICT (benchmark_code) DO NOTHING
    `;
    bmCount++;
  }
  log(`  ✓ ${bmCount} benchmarks`);

  // ── 6. Populate npc_classification ──────────────────────────────
  log("  Seeding npc_classification…");
  let npcCount = 0;
  for (const npc of NPC_CLASSIFICATIONS) {
    await sql`
      INSERT INTO client_config.npc_classification (classification_name)
      VALUES (${npc.classificationName})
      ON CONFLICT (classification_name) DO NOTHING
    `;
    npcCount++;
  }
  log(`  ✓ ${npcCount} NPC classifications`);

  // Query the actual NPC classification IDs (they may not be 1,2,3
  // if the identity sequence has gaps). Use = ANY(...) rather than
  // IN (...): postgres.js serializes a JS array as a single Postgres
  // array literal, so `IN (${array})` never matches any row.
  const npcRows = await sql`
    SELECT npc_classification_id, classification_name
    FROM client_config.npc_classification
    WHERE classification_name = ANY(${NPC_CLASSIFICATIONS.map((n) => n.classificationName)})
  `;
  const npcIdByName = Object.fromEntries(
    npcRows.map((r) => [r.classification_name, Number(r.npc_classification_id)])
  );

  for (const npc of NPC_CLASSIFICATIONS) {
    if (!npcIdByName[npc.classificationName]) {
      throw new Error(`Could not resolve seeded NPC classification "${npc.classificationName}".`);
    }
  }

  // ── 7. Populate portfolio_configuration ─────────────────────────
  log("  Seeding portfolio_configuration…");
  let inserted = 0;
  await sql.begin(async (tx) => {
    await tx`SET LOCAL app.change_process_bypass = 'true'`;

    for (const cfg of PORTFOLIO_CONFIGS) {
      const primaryAccountId = generatePrimaryAccountId(
        clientCodeFromPortfolio(cfg.portfolioCode), cfg.assetClassCode, cfg.subAssetClassCode, cfg.managerCode
      );

      const today = new Date().toISOString().split("T")[0];

      // Map hardcoded NPC ID to actual ID from the database
      // (1→Match, 2→Return, 3→Opbouw)
      const NPC_NAME_BY_ID = { 1: "Match", 2: "Return", 3: "Opbouw" };
      const actualNpcId = npcIdByName[NPC_NAME_BY_ID[cfg.npcClassificationId]];

      if (!actualNpcId) {
        throw new Error(`Could not resolve NPC classification ID ${cfg.npcClassificationId} for ${primaryAccountId}`);
      }

      await tx`
        INSERT INTO client_config.portfolio_configuration (
          primary_account_id, client_code, portfolio_code,
          asset_class_code, sub_asset_class_code,
          manager_code, benchmark_code,
          npc_classification_id,
          long_name, short_name,
          active_ind, effective_from
        ) VALUES (
          ${primaryAccountId}, ${clientCodeFromPortfolio(cfg.portfolioCode)}, ${cfg.portfolioCode},
          ${cfg.assetClassCode}, ${cfg.subAssetClassCode},
          ${cfg.managerCode}, ${cfg.benchmarkCode},
          ${actualNpcId},
          ${cfg.longName}, ${cfg.shortName},
          true, ${today}
        )
        ON CONFLICT (primary_account_id) DO NOTHING
      `;
      inserted++;
    }
  });

  if (inserted === 0) {
    throw new Error("Client config seed inserted 0 portfolio configurations.");
  }
  log(`  ✓ ${inserted} portfolio configurations`);

  // ── 8. Summary ──────────────────────────────────────────────────
  const [counts] = await sql`
    SELECT
	      (SELECT COUNT(*) FROM client_config.portfolio_configuration) AS total_configs,
	      (SELECT COUNT(*) FROM client_config.client) AS total_clients,
	      (SELECT COUNT(*) FROM client_config.portfolio) AS total_portfolios,
      (SELECT COUNT(*) FROM client_config.manager) AS total_managers,
      (SELECT COUNT(*) FROM client_config.benchmark) AS total_benchmarks,
      (SELECT COUNT(*) FROM client_config.npc_classification) AS total_npc,
      (SELECT COUNT(*) FROM client_config.asset_class) AS total_asset_classes,
      (SELECT COUNT(*) FROM client_config.parent_account) AS total_parent_accounts
  `;

  const countValue = (primary, fallback = primary) =>
    Number(counts[primary] ?? counts[fallback] ?? 0);

  const summary = {
    configurations: countValue("total_configs", "configurations"),
    clients: countValue("total_clients", "clients"),
    portfolios: countValue("total_portfolios", "portfolios"),
    managers: countValue("total_managers", "managers"),
    benchmarks: countValue("total_benchmarks", "benchmarks"),
    npcClassifications: countValue("total_npc", "npc_classifications"),
    assetClasses: countValue("total_asset_classes", "asset_classes"),
    parentAccounts: countValue("total_parent_accounts", "parent_accounts"),
  };

  log("\n📊 Seed Summary (client_config schema):");
  log(`  Portfolio configurations: ${summary.configurations}`);
  log(`  Clients:                  ${summary.clients}`);
  log(`  Portfolios:              ${summary.portfolios}`);
  log(`  Managers:                ${summary.managers}`);
  log(`  Benchmarks:              ${summary.benchmarks}`);
  log(`  NPC classifications:     ${summary.npcClassifications}`);
  log(`  Asset classes:           ${summary.assetClasses}`);
  log(`  Parent accounts:         ${summary.parentAccounts}`);

  return summary;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is required. Set it as an env var.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 2 });
  try {
    await seedClientConfig(sql);
    console.log("\n✅ client_config seed complete.");
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  });
}
