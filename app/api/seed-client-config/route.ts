/**
 * Client Config Seed API Endpoint
 *
 * POST /api/seed-client-config
 *
 * Seeds the client_config schema tables with realistic portfolio configuration
 * data. All seed data is validated through ZOD-compatible format constraints
 * before insertion. Idempotent — uses INSERT … ON CONFLICT DO NOTHING.
 *
 * Security: protected by SEED_API_KEY env var (same as /api/seed).
 * If SEED_API_KEY is not set, the endpoint is only accessible from
 * localhost/private network.
 *
 * Returns JSON with seed summary.
 */
import { NextResponse } from "next/server";
import postgres from "postgres";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

// ═════════════════════════════════════════════════════════════════════
// Seed Data
// ═════════════════════════════════════════════════════════════════════

const BENCHMARKS = [
  { code: "MSCI-WORLD-NR", name: "MSCI World Net Return", rimes: "MWNR" },
  { code: "MSCI-ACWI-NR", name: "MSCI ACWI Net Return", rimes: "MACWI" },
  { code: "BLOOMBERG-EU-AGG", name: "Bloomberg Euro Aggregate", rimes: "BEUA" },
  { code: "ICE-BOFA-EU-CORP", name: "ICE BofA Euro Corporate", rimes: "IBEC" },
  { code: "CUSTOM-ESG-NL", name: "Duurzame NL Benchmark", rimes: "CESG" },
  { code: "RIMES-PRIVATE-EQ", name: "Rimes Private Equity Index", rimes: "RPEQ" },
  { code: "EURO-GOVT-1-3Y", name: "Euro Government 1-3 Year", rimes: "EG13" },
  { code: "GLOBAL-REIT-NR", name: "Global REIT Net Return", rimes: "GREI" },
  { code: "MSCI-EM-NR", name: "MSCI Emerging Markets Net Return", rimes: "MEMN" },
  { code: "BLOOMBERG-GL-AGG", name: "Bloomberg Global Aggregate", rimes: "BGAG" },
  { code: "HFRX-GL-HEDGE", name: "HFRX Global Hedge Fund Index", rimes: "HFRX" },
  { code: "S&P-500-NR", name: "S&P 500 Net Return", rimes: "SP5N" },
  { code: "S&P-GSCI", name: "S&P GSCI Commodity Total Return", rimes: "SPGS" },
  { code: "MSCI-WORLD-INFRA", name: "MSCI World Infrastructure Net Return", rimes: "MWIN" },
  { code: "BLOOMBERG-GL-HY", name: "Bloomberg Global High Yield", rimes: "BGHY" },
  { code: "FTSE-EPRA-NAREIT-DEV", name: "FTSE EPRA Nareit Developed", rimes: "FEND" },
  { code: "MSCI-WORLD-HEALTH", name: "MSCI World Health Care Net Return", rimes: "MWHC" },
];

const MANAGERS = [
  { code: "EIG", name: "EIGEN BEHEER" },
  { code: "EXA", name: "EXTERNE BEHEERDER A" },
  { code: "EXB", name: "EXTERNE BEHEERDER B" },
];

const NPC_CLASSIFICATIONS = ["Match", "Return", "Opbouw"];

type PortfolioConfigRecord = {
  portfolioCode: string;
  assetClassCode: string;
  subAssetClassCode: string;
  managerCode: string;
  benchmarkCode: string;
  npcClassificationId: number;
  longName: string;
  shortName: string;
};

const PORTFOLIO_CONFIGS: PortfolioConfigRecord[] = [
  // Pensioenfonds Horizon (HOR) — 2
  { portfolioCode: "HORRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Horizon Rendementsportefeuille Aandelen Wereldwijd", shortName: "HOR EQ ACX" },
  { portfolioCode: "HORMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Horizon Matchingportefeuille Overheid Europa", shortName: "HOR FI SOV" },
  // Stichting Pensioen Zeker (ZEK) — 1
  { portfolioCode: "ZEKRET", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "Zeker Returnportefeuille Ontwikkelde Markten", shortName: "ZEK EQ DEV" },
  // Metaal & Techniek (MET) — 6
  { portfolioCode: "METRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Metaal Rendementsportefeuille Aandelen Wereldwijd", shortName: "MET EQ ACX" },
  { portfolioCode: "METMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Metaal Matchingportefeuille Overheid Europa", shortName: "MET FI SOV" },
  { portfolioCode: "METOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Metaal Opbouwportefeuille Ontwikkelde Markten", shortName: "MET EQ DEV" },
  { portfolioCode: "METDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EXB", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Metaal Duurzame Portefeuille Duurzaam", shortName: "MET EQ DUU" },
  { portfolioCode: "METVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXA", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Metaal Vastgoedportefeuille REITs", shortName: "MET RA REA" },
  { portfolioCode: "METLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 1, longName: "Metaal Liquiditeiten Cash", shortName: "MET CS CAS" },
  // Vervoer (VRV) — 7
  { portfolioCode: "VRVRET", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "EXA", benchmarkCode: "S&P-500-NR", npcClassificationId: 2, longName: "Vervoer Returnportefeuille Verenigde Staten", shortName: "VRV EQ UNI" },
  { portfolioCode: "VRVMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Vervoer Matchingportefeuille Overheid Europa", shortName: "VRV FI SOV" },
  { portfolioCode: "VRVGR", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "EXA", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 3, longName: "Vervoer Groeiportefeuille Opkomende Markten", shortName: "VRV EQ EME" },
  { portfolioCode: "VRVEK", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "EXB", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Vervoer Europees Krediet Credits Europa", shortName: "VRV FI CRE" },
  { portfolioCode: "VRVIP", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "Vervoer Inflatieportefeuille ILB", shortName: "VRV FI ILB" },
  { portfolioCode: "VRVPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXA", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Vervoer Private Equity", shortName: "VRV AL PRI" },
  { portfolioCode: "VRVIF", assetClassCode: "RA", subAssetClassCode: "INF", managerCode: "EXB", benchmarkCode: "MSCI-WORLD-INFRA", npcClassificationId: 3, longName: "Vervoer Infrastructuur", shortName: "VRV RA INF" },
  // Bouw (BOU) — 8
  { portfolioCode: "BOURP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Bouw Rendementsportefeuille Aandelen Wereldwijd", shortName: "BOU EQ ACX" },
  { portfolioCode: "BOUMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Bouw Matchingportefeuille Overheid Europa", shortName: "BOU FI SOV" },
  { portfolioCode: "BOUOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Bouw Opbouwportefeuille Ontwikkelde Markten", shortName: "BOU EQ DEV" },
  { portfolioCode: "BOUVF", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "EXB", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Bouw Vastgoedfondsen Direct Vastgoed", shortName: "BOU RA RED" },
  { portfolioCode: "BOUGO", assetClassCode: "FI", subAssetClassCode: "GRE", managerCode: "EXA", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 1, longName: "Bouw Groene Obligaties Greenbonds", shortName: "BOU FI GRE" },
  { portfolioCode: "BOUHY", assetClassCode: "FI", subAssetClassCode: "HYG", managerCode: "EXB", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Bouw High Yield Global", shortName: "BOU FI HYG" },
  { portfolioCode: "BOULQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bouw Liquiditeiten Cash", shortName: "BOU CS CAS" },
  { portfolioCode: "BOUHF", assetClassCode: "AL", subAssetClassCode: "HED", managerCode: "EXA", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "Bouw Hedge Funds", shortName: "BOU AL HED" },
  // Zorg & Welzijn (ZWG) — 9
  { portfolioCode: "ZWGRF", assetClassCode: "FI", subAssetClassCode: "LDI", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Zorg Renteforfait LDI", shortName: "ZWG FI LDI" },
  { portfolioCode: "ZWGAW", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Zorg Aandelen Wereldwijd AC World", shortName: "ZWG EQ ACX" },
  { portfolioCode: "ZWGOP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Zorg Opbouwportefeuille Europa", shortName: "ZWG EQ EUR" },
  { portfolioCode: "ZWGGZ", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "EXB", benchmarkCode: "MSCI-WORLD-HEALTH", npcClassificationId: 2, longName: "Zorg Gezondheidszorg Verenigde Staten", shortName: "ZWG EQ UNI" },
  { portfolioCode: "ZWGKP", assetClassCode: "FI", subAssetClassCode: "COR", managerCode: "EXA", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Zorg Kredietportefeuille Corporates Europa", shortName: "ZWG FI COR" },
  { portfolioCode: "ZWGDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Zorg Duurzame Portefeuille Duurzaam", shortName: "ZWG EQ DUU" },
  { portfolioCode: "ZWGVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXB", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Zorg Vastgoedportefeuille REITs", shortName: "ZWG RA REA" },
  { portfolioCode: "ZWGIS", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "Zorg Inflatieswaps ILB", shortName: "ZWG FI ILB" },
  { portfolioCode: "ZWGPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXA", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Zorg Private Equity", shortName: "ZWG AL PRI" },
  // Detailhandel (DET) — 6
  { portfolioCode: "DETRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Detailhandel Rendement AC World", shortName: "DET EQ ACX" },
  { portfolioCode: "DETMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Detailhandel Matching Overheid Europa", shortName: "DET FI SOV" },
  { portfolioCode: "DETOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Detailhandel Opbouw Ontwikkelde Markten", shortName: "DET EQ DEV" },
  { portfolioCode: "DETVG", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "EXB", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Detailhandel Vastgoed Direct", shortName: "DET RA RED" },
  { portfolioCode: "DETHY", assetClassCode: "FI", subAssetClassCode: "HYE", managerCode: "EXA", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Detailhandel High Yield Europa", shortName: "DET FI HYE" },
  { portfolioCode: "DETLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Detailhandel Liquiditeiten Cash", shortName: "DET CS CAS" },
  // Bakkerij (BAK) — 7
  { portfolioCode: "BAKRP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Bakkerij Rendementsportefeuille Europa", shortName: "BAK EQ EUR" },
  { portfolioCode: "BAKMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bakkerij Matchingportefeuille Overheid", shortName: "BAK FI SOV" },
  { portfolioCode: "BAKGR", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "EXA", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 3, longName: "Bakkerij Groei Opkomende Markten", shortName: "BAK EQ EME" },
  { portfolioCode: "BAKKP", assetClassCode: "FI", subAssetClassCode: "COR", managerCode: "EXB", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Bakkerij Kredietportefeuille Corporates", shortName: "BAK FI COR" },
  { portfolioCode: "BAKCO", assetClassCode: "RA", subAssetClassCode: "COM", managerCode: "EXA", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Bakkerij Commoditeiten", shortName: "BAK RA COM" },
  { portfolioCode: "BAKPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Bakkerij Private Equity", shortName: "BAK AL PRI" },
  { portfolioCode: "BAKLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bakkerij Liquiditeiten Cash", shortName: "BAK CS CAS" },
  // Openbaar Vervoer (OVV) — 10
  { portfolioCode: "OVVRET", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "OVV Returnportefeuille AC World", shortName: "OVV EQ ACX" },
  { portfolioCode: "OVVMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "OVV Matchingportefeuille Overheid Europa", shortName: "OVV FI SOV" },
  { portfolioCode: "OVVOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 3, longName: "OVV Opbouwportefeuille Ontwikkelde Markten", shortName: "OVV EQ DEV" },
  { portfolioCode: "OVVDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "OVV Duurzame Portefeuille Duurzaam", shortName: "OVV EQ DUU" },
  { portfolioCode: "OVVVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXB", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "OVV Vastgoedportefeuille REITs", shortName: "OVV RA REA" },
  { portfolioCode: "OVVHF", assetClassCode: "AL", subAssetClassCode: "HED", managerCode: "EXA", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "OVV Hedge Fund Portefeuille", shortName: "OVV AL HED" },
  { portfolioCode: "OVVIP", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "OVV Inflatieportefeuille ILB", shortName: "OVV FI ILB" },
  { portfolioCode: "OVVKL", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "OVV Kortlopend Cash", shortName: "OVV CS CAS" },
  { portfolioCode: "OVVJP", assetClassCode: "EQ", subAssetClassCode: "JAP", managerCode: "EXB", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "OVV Japan Aandelen", shortName: "OVV EQ JAP" },
  { portfolioCode: "OVVIF", assetClassCode: "RA", subAssetClassCode: "INF", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-INFRA", npcClassificationId: 3, longName: "OVV Infrastructuur", shortName: "OVV RA INF" },
  // Landbouw (LAN) — 8
  { portfolioCode: "LANRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Landbouw Rendementsportefeuille AC World", shortName: "LAN EQ ACX" },
  { portfolioCode: "LANMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Landbouw Matchingportefeuille Overheid", shortName: "LAN FI SOV" },
  { portfolioCode: "LANOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Landbouw Opbouwportefeuille Ontwikkelde Markten", shortName: "LAN EQ DEV" },
  { portfolioCode: "LANAP", assetClassCode: "RA", subAssetClassCode: "AGR", managerCode: "EXB", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Landbouw Agrarische Portefeuille", shortName: "LAN RA AGR" },
  { portfolioCode: "LANDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Landbouw Duurzame Portefeuille", shortName: "LAN EQ DUU" },
  { portfolioCode: "LANKE", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "EXA", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Landbouw Krediet Europa", shortName: "LAN FI CRE" },
  { portfolioCode: "LANPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Landbouw Private Equity", shortName: "LAN AL PRI" },
  { portfolioCode: "LANCO", assetClassCode: "RA", subAssetClassCode: "COM", managerCode: "EXA", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Landbouw Commoditeiten", shortName: "LAN RA COM" },
  // Chemie (CHE) — 9
  { portfolioCode: "CHERP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Chemie Rendement AC World", shortName: "CHE EQ ACX" },
  { portfolioCode: "CHEMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Chemie Matching Overheid Europa", shortName: "CHE FI SOV" },
  { portfolioCode: "CHEOP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Chemie Opbouw Europa", shortName: "CHE EQ EUR" },
  { portfolioCode: "CHEHY", assetClassCode: "FI", subAssetClassCode: "HYG", managerCode: "EXA", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Chemie High Yield Global", shortName: "CHE FI HYG" },
  { portfolioCode: "CHELI", assetClassCode: "FI", subAssetClassCode: "LDI", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Chemie LDI Portefeuille", shortName: "CHE FI LDI" },
  { portfolioCode: "CHEVG", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXB", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Chemie Vastgoed REITs", shortName: "CHE RA REA" },
  { portfolioCode: "CHERP2", assetClassCode: "AL", subAssetClassCode: "RIS", managerCode: "EXA", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "Chemie Risk Parity", shortName: "CHE AL RIS" },
  { portfolioCode: "CHELQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Chemie Liquiditeiten Cash", shortName: "CHE CS CAS" },
  { portfolioCode: "CHEGO", assetClassCode: "FI", subAssetClassCode: "GRE", managerCode: "EXB", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 1, longName: "Chemie Groene Obligaties", shortName: "CHE FI GRE" },
  // Techniek Nederland (TEC) — 10
  { portfolioCode: "TECRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "Techniek Rendementsportefeuille AC World", shortName: "TEC EQ ACX" },
  { portfolioCode: "TECMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Techniek Matchingportefeuille Overheid", shortName: "TEC FI SOV" },
  { portfolioCode: "TECOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 3, longName: "Techniek Opbouwportefeuille Ontwikkelde Markten", shortName: "TEC EQ DEV" },
  { portfolioCode: "TECVS", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "EXA", benchmarkCode: "S&P-500-NR", npcClassificationId: 2, longName: "Techniek VS Aandelen", shortName: "TEC EQ UNI" },
  { portfolioCode: "TECOM", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "EXB", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 2, longName: "Techniek Opkomende Markten", shortName: "TEC EQ EME" },
  { portfolioCode: "TECEK", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "EXA", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Techniek Europese Kredieten", shortName: "TEC FI CRE" },
  { portfolioCode: "TECPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Techniek Private Equity", shortName: "TEC AL PRI" },
  { portfolioCode: "TECVP", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "EXA", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Techniek Vastgoedportefeuille Direct", shortName: "TEC RA RED" },
  { portfolioCode: "TECLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Techniek Liquiditeiten Cash", shortName: "TEC CS CAS" },
  { portfolioCode: "TECDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Techniek Duurzame Portefeuille", shortName: "TEC EQ DUU" },
];

// ═════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════

function generatePrimaryAccountId(
  portfolioCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string,
): string {
  return `${portfolioCode}_${assetClassCode}${subAssetClassCode}_${managerCode}`.toUpperCase();
}

// ═════════════════════════════════════════════════════════════════════
// POST handler
// ═════════════════════════════════════════════════════════════════════

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

    // — 1. Benchmarks —
    for (const bm of BENCHMARKS) {
      await sql`
        INSERT INTO client_config.benchmark (benchmark_code, benchmark_name, rimes_code)
        VALUES (${bm.code}, ${bm.name}, ${bm.rimes})
        ON CONFLICT (benchmark_code) DO NOTHING
      `;
    }

    // — 2. Managers —
    for (const mgr of MANAGERS) {
      await sql`
        INSERT INTO client_config.manager (manager_code, manager_name)
        VALUES (${mgr.code}, ${mgr.name})
        ON CONFLICT (manager_code) DO NOTHING
      `;
    }

    // — 3. NPC classifications —
    for (const name of NPC_CLASSIFICATIONS) {
      await sql`
        INSERT INTO client_config.npc_classification (classification_name)
        VALUES (${name})
        ON CONFLICT (classification_name) DO NOTHING
      `;
    }

    // — 4. Portfolio configurations —
    let inserted = 0;
    const today = new Date().toISOString().split("T")[0];

    for (const cfg of PORTFOLIO_CONFIGS) {
      const primaryAccountId = generatePrimaryAccountId(
        cfg.portfolioCode, cfg.assetClassCode, cfg.subAssetClassCode, cfg.managerCode,
      );

      // Ensure the portfolio exists
      await sql`
        INSERT INTO client_config.portfolio (portfolio_code)
        VALUES (${cfg.portfolioCode})
        ON CONFLICT (portfolio_code) DO NOTHING
      `;

      await sql`
        INSERT INTO client_config.portfolio_configuration (
          primary_account_id, portfolio_code,
          asset_class_code, sub_asset_class_code,
          manager_code, benchmark_code,
          npc_classification_id,
          long_name, short_name,
          active_ind, effective_from
        ) VALUES (
          ${primaryAccountId}, ${cfg.portfolioCode},
          ${cfg.assetClassCode}, ${cfg.subAssetClassCode},
          ${cfg.managerCode}, ${cfg.benchmarkCode},
          ${cfg.npcClassificationId},
          ${cfg.longName}, ${cfg.shortName},
          true, ${today}
        )
        ON CONFLICT (primary_account_id) DO NOTHING
      `;
      inserted++;
    }

    // — 5. Summary —
    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*) FROM client_config.portfolio_configuration) AS total_configs,
        (SELECT COUNT(*) FROM client_config.portfolio) AS total_portfolios,
        (SELECT COUNT(*) FROM client_config.manager) AS total_managers,
        (SELECT COUNT(*) FROM client_config.benchmark) AS total_benchmarks,
        (SELECT COUNT(*) FROM client_config.npc_classification) AS total_npc
    `;

    return NextResponse.json({
      success: true,
      message: "Client config seed completed",
      summary: {
        portfolioConfigurations: Number(counts.total_configs),
        portfolios: Number(counts.total_portfolios),
        managers: Number(counts.total_managers),
        benchmarks: Number(counts.total_benchmarks),
        npcClassifications: Number(counts.total_npc),
      },
    });
  } catch (error) {
    captureError(error, { route: "/api/seed-client-config", method: "POST", phase: "request" });
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  } finally {
    if (sql) await sql.end({ timeout: 2 });
  }
}