/**
 * Tests for the client_config seed data validation.
 *
 * These tests verify that the seed data definitions used to populate the
 * client_config schema tables are valid against the authoritative ZOD schemas,
 * and that the generated primary_account_id values match the expected format.
 *
 * @module tests/seed-client-config-validation
 */
import { describe, it, expect } from "vitest";
import {
  ASSET_SUB_ASSET_OPTIONS,
  AssetClassValue,
  SubAssetClassValue,
  AssetSubAssetSelection,
  ManagerInput,
  BenchmarkInput,
  PortfolioInput,
  ParentAccountInput,
  LegalEntityInput,
  AccountInput,
  validateInput,
  generatePrimaryAccountId,
  lookupAssetSubAssetCodes,
} from "@/lib/schemas/clientConfigInput";
import {
  clientConfigAssetClassSchema,
  clientConfigSubAssetClassSchema,
  clientConfigManagerSchema,
  clientConfigBenchmarkSchema,
  clientConfigNpcClassificationSchema,
  clientConfigPortfolioConfigurationSchema,
  clientConfigPortfolioSchema,
  clientConfigParentAccountSchema,
} from "@/lib/schemas/domain";

// ═════════════════════════════════════════════════════════════════════
// 1. Seed reference data validation
// ═════════════════════════════════════════════════════════════════════

/**
 * Seed data for client_config.asset_class — must match the 8 asset classes
 * from the SQL schema with valid char(2) codes.
 */
const SEED_ASSET_CLASSES = [
  { assetClassId: 1, assetClassCode: "CS", assetClassName: "CASH" },
  { assetClassId: 2, assetClassCode: "EQ", assetClassName: "EQUITIES" },
  { assetClassId: 3, assetClassCode: "AL", assetClassName: "ALTERNATIVES" },
  { assetClassId: 4, assetClassCode: "RA", assetClassName: "REAL_ASSETS" },
  { assetClassId: 5, assetClassCode: "FI", assetClassName: "FIXED_INCOME" },
  { assetClassId: 6, assetClassCode: "MA", assetClassName: "MULTI_ASSETS" },
  { assetClassId: 7, assetClassCode: "OV", assetClassName: "OVERLAY" },
  { assetClassId: 8, assetClassCode: "IM", assetClassName: "IMPACT" },
] as const;

/**
 * Seed data for commonly used sub-asset-classes. Each must be valid
 * against the ASSET_SUB_ASSET_OPTIONS hierarchy.
 */
const SEED_SUB_ASSET_CLASSES = [
  // CASH (CS)
  { subAssetClassId: 1, assetClassId: 1, subAssetClassCode: "CAS", subAssetClassName: "CASH" },
  { subAssetClassId: 2, assetClassId: 1, subAssetClassCode: "FUN", subAssetClassName: "FUNDS" },
  { subAssetClassId: 3, assetClassId: 1, subAssetClassCode: "LIQ", subAssetClassName: "LIQUIDITIES" },
  // EQUITIES (EQ)
  { subAssetClassId: 4, assetClassId: 2, subAssetClassCode: "DEV", subAssetClassName: "DEVELOPED MARKETS" },
  { subAssetClassId: 5, assetClassId: 2, subAssetClassCode: "EME", subAssetClassName: "EMERGING MARKETS" },
  { subAssetClassId: 6, assetClassId: 2, subAssetClassCode: "ACX", subAssetClassName: "AC WORLD" },
  { subAssetClassId: 7, assetClassId: 2, subAssetClassCode: "EUR", subAssetClassName: "EUROPE" },
  { subAssetClassId: 8, assetClassId: 2, subAssetClassCode: "UNI", subAssetClassName: "UNITED STATES" },
  { subAssetClassId: 9, assetClassId: 2, subAssetClassCode: "JAP", subAssetClassName: "JAPAN" },
  { subAssetClassId: 10, assetClassId: 2, subAssetClassCode: "DUU", subAssetClassName: "DUURZAAM" },
  // ALTERNATIVES (AL)
  { subAssetClassId: 11, assetClassId: 3, subAssetClassCode: "PRI", subAssetClassName: "PRIVATE EQUITY" },
  { subAssetClassId: 12, assetClassId: 3, subAssetClassCode: "HED", subAssetClassName: "HEDGE FUNDS" },
  { subAssetClassId: 13, assetClassId: 3, subAssetClassCode: "RIS", subAssetClassName: "RISK PARITY" },
  // REAL_ASSETS (RA)
  { subAssetClassId: 14, assetClassId: 4, subAssetClassCode: "REA", subAssetClassName: "REALESTATE LISTED" },
  { subAssetClassId: 15, assetClassId: 4, subAssetClassCode: "RED", subAssetClassName: "REALESTATE DIRECT" },
  { subAssetClassId: 16, assetClassId: 4, subAssetClassCode: "COM", subAssetClassName: "COMMODITIES" },
  { subAssetClassId: 17, assetClassId: 4, subAssetClassCode: "INF", subAssetClassName: "INFRASTRUCTURE" },
  { subAssetClassId: 18, assetClassId: 4, subAssetClassCode: "AGR", subAssetClassName: "AGRICULTURE" },
  // FIXED_INCOME (FI)
  { subAssetClassId: 19, assetClassId: 5, subAssetClassCode: "SOV", subAssetClassName: "SOVEREIGN EUROPE" },
  { subAssetClassId: 20, assetClassId: 5, subAssetClassCode: "COR", subAssetClassName: "CORPORATES EUROPE" },
  { subAssetClassId: 21, assetClassId: 5, subAssetClassCode: "CRE", subAssetClassName: "CREDITS EUROPE" },
  { subAssetClassId: 22, assetClassId: 5, subAssetClassCode: "HYG", subAssetClassName: "HIGH YIELD GLOBAL" },
  { subAssetClassId: 23, assetClassId: 5, subAssetClassCode: "HYE", subAssetClassName: "HIGH YIELD EUROPE" },
  { subAssetClassId: 24, assetClassId: 5, subAssetClassCode: "ILB", subAssetClassName: "INFLATION LINKED BONDS EUROPE" },
  { subAssetClassId: 25, assetClassId: 5, subAssetClassCode: "GRE", subAssetClassName: "GREENBONDS" },
  { subAssetClassId: 26, assetClassId: 5, subAssetClassCode: "LDI", subAssetClassName: "LDI" },
  // MULTI_ASSETS (MA)
  { subAssetClassId: 27, assetClassId: 6, subAssetClassCode: "NEU", subAssetClassName: "NEUTRAL" },
  // OVERLAY (OV)
  { subAssetClassId: 28, assetClassId: 7, subAssetClassCode: "CUR", subAssetClassName: "CURRENCY" },
  // IMPACT (IM)
  { subAssetClassId: 29, assetClassId: 8, subAssetClassCode: "IMP", subAssetClassName: "IMPACT" },
];

/**
 * Seed data for managers — 3-char codes.
 */
const SEED_MANAGERS = [
  { managerId: 1, managerCode: "EIG", managerName: "EIGEN BEHEER" },
  { managerId: 2, managerCode: "EXA", managerName: "EXTERNE BEHEERDER A" },
  { managerId: 3, managerCode: "EXB", managerName: "EXTERNE BEHEERDER B" },
] as const;

/**
 * Seed data for benchmarks — codes used in portfolio_configuration.
 */
const SEED_BENCHMARKS = [
  { benchmarkId: 1, benchmarkCode: "MSCI-WORLD-NR", benchmarkName: "MSCI World Net Return", rimesCode: "MWNR" },
  { benchmarkId: 2, benchmarkCode: "MSCI-ACWI-NR", benchmarkName: "MSCI ACWI Net Return", rimesCode: "MACWI" },
  { benchmarkId: 3, benchmarkCode: "BLOOMBERG-EU-AGG", benchmarkName: "Bloomberg Euro Aggregate", rimesCode: "BEUA" },
  { benchmarkId: 4, benchmarkCode: "ICE-BOFA-EU-CORP", benchmarkName: "ICE BofA Euro Corporate", rimesCode: "IBEC" },
  { benchmarkId: 5, benchmarkCode: "CUSTOM-ESG-NL", benchmarkName: "Duurzame NL Benchmark", rimesCode: "CESG" },
  { benchmarkId: 6, benchmarkCode: "RIMES-PRIVATE-EQ", benchmarkName: "Rimes Private Equity Index", rimesCode: "RPEQ" },
  { benchmarkId: 7, benchmarkCode: "EURO-GOVT-1-3Y", benchmarkName: "Euro Government 1-3 Year", rimesCode: "EG13" },
  { benchmarkId: 8, benchmarkCode: "GLOBAL-REIT-NR", benchmarkName: "Global REIT Net Return", rimesCode: "GREI" },
  { benchmarkId: 9, benchmarkCode: "MSCI-EM-NR", benchmarkName: "MSCI Emerging Markets Net Return", rimesCode: "MEMN" },
  { benchmarkId: 10, benchmarkCode: "BLOOMBERG-GL-AGG", benchmarkName: "Bloomberg Global Aggregate", rimesCode: "BGAG" },
  { benchmarkId: 11, benchmarkCode: "HFRX-GL-HEDGE", benchmarkName: "HFRX Global Hedge Fund Index", rimesCode: "HFRX" },
  { benchmarkId: 12, benchmarkCode: "S&P-500-NR", benchmarkName: "S&P 500 Net Return", rimesCode: "SP5N" },
  { benchmarkId: 13, benchmarkCode: "S&P-GSCI", benchmarkName: "S&P GSCI Commodity Total Return", rimesCode: "SPGS" },
  { benchmarkId: 14, benchmarkCode: "MSCI-WORLD-INFRA", benchmarkName: "MSCI World Infrastructure Net Return", rimesCode: "MWIN" },
  { benchmarkId: 15, benchmarkCode: "BLOOMBERG-GL-HY", benchmarkName: "Bloomberg Global High Yield", rimesCode: "BGHY" },
  { benchmarkId: 16, benchmarkCode: "FTSE-EPRA-NAREIT-DEV", benchmarkName: "FTSE EPRA Nareit Developed", rimesCode: "FEND" },
  { benchmarkId: 17, benchmarkCode: "MSCI-WORLD-HEALTH", benchmarkName: "MSCI World Health Care Net Return", rimesCode: "MWHC" },
] as const;

/**
 * NPC classifications — the 3 standard ones.
 */
const SEED_NPC_CLASSIFICATIONS = [
  { npcClassificationId: 1, classificationName: "Match" },
  { npcClassificationId: 2, classificationName: "Return" },
  { npcClassificationId: 3, classificationName: "Opbouw" },
] as const;

/**
 * Parent accounts for the seed data.
 */
const SEED_PARENT_ACCOUNTS = [
  { parentAccountId: 1, parentAccountCode: "PENSIOENFONDSEN", msaParentAccountCode: null },
  { parentAccountId: 2, parentAccountCode: "STICHTINGEN", msaParentAccountCode: null },
] as const;

/**
 * Portfolio codes for the seed data.
 */
const SEED_PORTFOLIOS = [
  { portfolioId: 1, portfolioCode: "HORRP", parentAccountId: 1 },
  { portfolioId: 2, portfolioCode: "HORMP", parentAccountId: 1 },
  { portfolioId: 3, portfolioCode: "ZEKRET", parentAccountId: 2 },
  { portfolioId: 4, portfolioCode: "METRP", parentAccountId: 1 },
  { portfolioId: 5, portfolioCode: "METMP", parentAccountId: 1 },
  { portfolioId: 6, portfolioCode: "METOP", parentAccountId: 1 },
  { portfolioId: 7, portfolioCode: "METDP", parentAccountId: 1 },
  { portfolioId: 8, portfolioCode: "METVP", parentAccountId: 1 },
  { portfolioId: 9, portfolioCode: "METLQ", parentAccountId: 1 },
  { portfolioId: 10, portfolioCode: "VRVRET", parentAccountId: 2 },
  { portfolioId: 11, portfolioCode: "VRVMP", parentAccountId: 2 },
  { portfolioId: 12, portfolioCode: "VRVGR", parentAccountId: 2 },
  { portfolioId: 13, portfolioCode: "VRVEK", parentAccountId: 2 },
  { portfolioId: 14, portfolioCode: "VRVIP", parentAccountId: 2 },
  { portfolioId: 15, portfolioCode: "VRVPE", parentAccountId: 2 },
  { portfolioId: 16, portfolioCode: "VRVIF", parentAccountId: 2 },
  { portfolioId: 17, portfolioCode: "BOURP", parentAccountId: 1 },
  { portfolioId: 18, portfolioCode: "BOUMP", parentAccountId: 1 },
  { portfolioId: 19, portfolioCode: "BOUOP", parentAccountId: 1 },
  { portfolioId: 20, portfolioCode: "BOUVF", parentAccountId: 1 },
  { portfolioId: 21, portfolioCode: "BOUGO", parentAccountId: 1 },
  { portfolioId: 22, portfolioCode: "BOUHY", parentAccountId: 1 },
  { portfolioId: 23, portfolioCode: "BOULQ", parentAccountId: 1 },
  { portfolioId: 24, portfolioCode: "BOUHF", parentAccountId: 1 },
  { portfolioId: 25, portfolioCode: "ZWGRF", parentAccountId: 1 },
  { portfolioId: 26, portfolioCode: "ZWGAW", parentAccountId: 1 },
  { portfolioId: 27, portfolioCode: "ZWGOP", parentAccountId: 1 },
  { portfolioId: 28, portfolioCode: "ZWGGZ", parentAccountId: 1 },
  { portfolioId: 29, portfolioCode: "ZWGKP", parentAccountId: 1 },
  { portfolioId: 30, portfolioCode: "ZWGDP", parentAccountId: 1 },
  { portfolioId: 31, portfolioCode: "ZWGVP", parentAccountId: 1 },
  { portfolioId: 32, portfolioCode: "ZWGIS", parentAccountId: 1 },
  { portfolioId: 33, portfolioCode: "ZWGPE", parentAccountId: 1 },
  { portfolioId: 34, portfolioCode: "DETRP", parentAccountId: 2 },
  { portfolioId: 35, portfolioCode: "DETMP", parentAccountId: 2 },
  { portfolioId: 36, portfolioCode: "DETOP", parentAccountId: 2 },
  { portfolioId: 37, portfolioCode: "DETVG", parentAccountId: 2 },
  { portfolioId: 38, portfolioCode: "DETHY", parentAccountId: 2 },
  { portfolioId: 39, portfolioCode: "DETLQ", parentAccountId: 2 },
  { portfolioId: 40, portfolioCode: "BAKRP", parentAccountId: 1 },
  { portfolioId: 41, portfolioCode: "BAKMP", parentAccountId: 1 },
  { portfolioId: 42, portfolioCode: "BAKGR", parentAccountId: 1 },
  { portfolioId: 43, portfolioCode: "BAKKP", parentAccountId: 1 },
  { portfolioId: 44, portfolioCode: "BAKCO", parentAccountId: 1 },
  { portfolioId: 45, portfolioCode: "BAKPE", parentAccountId: 1 },
  { portfolioId: 46, portfolioCode: "BAKLQ", parentAccountId: 1 },
  { portfolioId: 47, portfolioCode: "OVVRET", parentAccountId: 2 },
  { portfolioId: 48, portfolioCode: "OVVMP", parentAccountId: 2 },
  { portfolioId: 49, portfolioCode: "OVVOP", parentAccountId: 2 },
  { portfolioId: 50, portfolioCode: "OVVDP", parentAccountId: 2 },
  { portfolioId: 51, portfolioCode: "OVVVP", parentAccountId: 2 },
  { portfolioId: 52, portfolioCode: "OVVHF", parentAccountId: 2 },
  { portfolioId: 53, portfolioCode: "OVVIP", parentAccountId: 2 },
  { portfolioId: 54, portfolioCode: "OVVKL", parentAccountId: 2 },
  { portfolioId: 55, portfolioCode: "OVVJP", parentAccountId: 2 },
  { portfolioId: 56, portfolioCode: "OVVIF", parentAccountId: 2 },
  { portfolioId: 57, portfolioCode: "LANRP", parentAccountId: 1 },
  { portfolioId: 58, portfolioCode: "LANMP", parentAccountId: 1 },
  { portfolioId: 59, portfolioCode: "LANOP", parentAccountId: 1 },
  { portfolioId: 60, portfolioCode: "LANAP", parentAccountId: 1 },
  { portfolioId: 61, portfolioCode: "LANDP", parentAccountId: 1 },
  { portfolioId: 62, portfolioCode: "LANKE", parentAccountId: 1 },
  { portfolioId: 63, portfolioCode: "LANPE", parentAccountId: 1 },
  { portfolioId: 64, portfolioCode: "LANCO", parentAccountId: 1 },
  { portfolioId: 65, portfolioCode: "CHERP", parentAccountId: 1 },
  { portfolioId: 66, portfolioCode: "CHEMP", parentAccountId: 1 },
  { portfolioId: 67, portfolioCode: "CHEOP", parentAccountId: 1 },
  { portfolioId: 68, portfolioCode: "CHEHY", parentAccountId: 1 },
  { portfolioId: 69, portfolioCode: "CHELI", parentAccountId: 1 },
  { portfolioId: 70, portfolioCode: "CHEVG", parentAccountId: 1 },
  { portfolioId: 71, portfolioCode: "CHERP2", parentAccountId: 1 },
  { portfolioId: 72, portfolioCode: "CHELQ", parentAccountId: 1 },
  { portfolioId: 73, portfolioCode: "CHEGO", parentAccountId: 1 },
  { portfolioId: 74, portfolioCode: "TECRP", parentAccountId: 2 },
  { portfolioId: 75, portfolioCode: "TECMP", parentAccountId: 2 },
  { portfolioId: 76, portfolioCode: "TECOP", parentAccountId: 2 },
  { portfolioId: 77, portfolioCode: "TECVS", parentAccountId: 2 },
  { portfolioId: 78, portfolioCode: "TECOM", parentAccountId: 2 },
  { portfolioId: 79, portfolioCode: "TECEK", parentAccountId: 2 },
  { portfolioId: 80, portfolioCode: "TECPE", parentAccountId: 2 },
  { portfolioId: 81, portfolioCode: "TECVP", parentAccountId: 2 },
  { portfolioId: 82, portfolioCode: "TECLQ", parentAccountId: 2 },
  { portfolioId: 83, portfolioCode: "TECDP", parentAccountId: 2 },
] as const;

/**
 * Portfolio configuration rows — the main seed data for the admin table.
 * Each row defines a portfolio_configuration entry with all dimensions.
 */

const SEED_PORTFOLIO_CONFIGURATIONS = [
  // Pensioenfonds Horizon (HOR) — 2 portfolios
  { portfolioCode: "HORRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Horizon Rendementsportefeuille Aandelen Wereldwijd", shortName: "HOR EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "HORMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Horizon Matchingportefeuille Overheid Europa", shortName: "HOR FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Stichting Pensioen Zeker (ZEK) — 1 portfolio
  { portfolioCode: "ZEKRET", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "Zeker Returnportefeuille Ontwikkelde Markten", shortName: "ZEK EQ DEV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Metaal & Techniek (MET) — 6 portfolios
  { portfolioCode: "METRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Metaal Rendementsportefeuille Aandelen Wereldwijd", shortName: "MET EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "METMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Metaal Matchingportefeuille Overheid Europa", shortName: "MET FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "METOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Metaal Opbouwportefeuille Ontwikkelde Markten", shortName: "MET EQ DEV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "METDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EXB", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Metaal Duurzame Portefeuille Duurzaam", shortName: "MET EQ DUU", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "METVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXA", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Metaal Vastgoedportefeuille REITs", shortName: "MET RA REA", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "METLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 1, longName: "Metaal Liquiditeiten Cash", shortName: "MET CS CAS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Vervoer (VRV) — 7 portfolios
  { portfolioCode: "VRVRET", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "EXA", benchmarkCode: "S&P-500-NR", npcClassificationId: 2, longName: "Vervoer Returnportefeuille Verenigde Staten", shortName: "VRV EQ UNI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "VRVMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Vervoer Matchingportefeuille Overheid Europa", shortName: "VRV FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "VRVGR", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "EXA", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 3, longName: "Vervoer Groeiportefeuille Opkomende Markten", shortName: "VRV EQ EME", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "VRVEK", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "EXB", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Vervoer Europees Krediet Credits Europa", shortName: "VRV FI CRE", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "VRVIP", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "Vervoer Inflatieportefeuille ILB", shortName: "VRV FI ILB", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "VRVPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXA", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Vervoer Private Equity", shortName: "VRV AL PRI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "VRVIF", assetClassCode: "RA", subAssetClassCode: "INF", managerCode: "EXB", benchmarkCode: "MSCI-WORLD-INFRA", npcClassificationId: 3, longName: "Vervoer Infrastructuur", shortName: "VRV RA INF", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Bouw (BOU) — 8 portfolios
  { portfolioCode: "BOURP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Bouw Rendementsportefeuille Aandelen Wereldwijd", shortName: "BOU EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BOUMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Bouw Matchingportefeuille Overheid Europa", shortName: "BOU FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BOUOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Bouw Opbouwportefeuille Ontwikkelde Markten", shortName: "BOU EQ DEV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BOUVF", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "EXB", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Bouw Vastgoedfondsen Direct Vastgoed", shortName: "BOU RA RED", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BOUGO", assetClassCode: "FI", subAssetClassCode: "GRE", managerCode: "EXA", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 1, longName: "Bouw Groene Obligaties Greenbonds", shortName: "BOU FI GRE", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BOUHY", assetClassCode: "FI", subAssetClassCode: "HYG", managerCode: "EXB", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Bouw High Yield Global", shortName: "BOU FI HYG", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BOULQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bouw Liquiditeiten Cash", shortName: "BOU CS CAS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BOUHF", assetClassCode: "AL", subAssetClassCode: "HED", managerCode: "EXA", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "Bouw Hedge Funds", shortName: "BOU AL HED", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Zorg & Welzijn (ZWG) — 9 portfolios
  { portfolioCode: "ZWGRF", assetClassCode: "FI", subAssetClassCode: "LDI", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Zorg Renteforfait LDI", shortName: "ZWG FI LDI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGAW", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Zorg Aandelen Wereldwijd AC World", shortName: "ZWG EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGOP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Zorg Opbouwportefeuille Europa", shortName: "ZWG EQ EUR", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGGZ", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "EXB", benchmarkCode: "MSCI-WORLD-HEALTH", npcClassificationId: 2, longName: "Zorg Gezondheidszorg Verenigde Staten", shortName: "ZWG EQ UNI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGKP", assetClassCode: "FI", subAssetClassCode: "COR", managerCode: "EXA", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Zorg Kredietportefeuille Corporates Europa", shortName: "ZWG FI COR", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Zorg Duurzame Portefeuille Duurzaam", shortName: "ZWG EQ DUU", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXB", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Zorg Vastgoedportefeuille REITs", shortName: "ZWG RA REA", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGIS", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "Zorg Inflatieswaps ILB", shortName: "ZWG FI ILB", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "ZWGPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXA", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Zorg Private Equity", shortName: "ZWG AL PRI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Detailhandel (DET) — 6 portfolios
  { portfolioCode: "DETRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Detailhandel Rendement AC World", shortName: "DET EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "DETMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Detailhandel Matching Overheid Europa", shortName: "DET FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "DETOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Detailhandel Opbouw Ontwikkelde Markten", shortName: "DET EQ DEV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "DETVG", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "EXB", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Detailhandel Vastgoed Direct", shortName: "DET RA RED", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "DETHY", assetClassCode: "FI", subAssetClassCode: "HYE", managerCode: "EXA", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Detailhandel High Yield Europa", shortName: "DET FI HYE", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "DETLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Detailhandel Liquiditeiten Cash", shortName: "DET CS CAS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Bakkerij (BAK) — 7 portfolios
  { portfolioCode: "BAKRP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Bakkerij Rendementsportefeuille Europa", shortName: "BAK EQ EUR", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BAKMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bakkerij Matchingportefeuille Overheid", shortName: "BAK FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BAKGR", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "EXA", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 3, longName: "Bakkerij Groei Opkomende Markten", shortName: "BAK EQ EME", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BAKKP", assetClassCode: "FI", subAssetClassCode: "COR", managerCode: "EXB", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Bakkerij Kredietportefeuille Corporates", shortName: "BAK FI COR", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BAKCO", assetClassCode: "RA", subAssetClassCode: "COM", managerCode: "EXA", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Bakkerij Commoditeiten", shortName: "BAK RA COM", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BAKPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Bakkerij Private Equity", shortName: "BAK AL PRI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "BAKLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Bakkerij Liquiditeiten Cash", shortName: "BAK CS CAS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Openbaar Vervoer (OVV) — 10 portfolios
  { portfolioCode: "OVVRET", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "OVV Returnportefeuille AC World", shortName: "OVV EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "OVV Matchingportefeuille Overheid Europa", shortName: "OVV FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 3, longName: "OVV Opbouwportefeuille Ontwikkelde Markten", shortName: "OVV EQ DEV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "OVV Duurzame Portefeuille Duurzaam", shortName: "OVV EQ DUU", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVVP", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXB", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "OVV Vastgoedportefeuille REITs", shortName: "OVV RA REA", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVHF", assetClassCode: "AL", subAssetClassCode: "HED", managerCode: "EXA", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "OVV Hedge Fund Portefeuille", shortName: "OVV AL HED", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVIP", assetClassCode: "FI", subAssetClassCode: "ILB", managerCode: "EIG", benchmarkCode: "BLOOMBERG-GL-AGG", npcClassificationId: 1, longName: "OVV Inflatieportefeuille ILB", shortName: "OVV FI ILB", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVKL", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "OVV Kortlopend Cash", shortName: "OVV CS CAS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVJP", assetClassCode: "EQ", subAssetClassCode: "JAP", managerCode: "EXB", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "OVV Japan Aandelen", shortName: "OVV EQ JAP", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "OVVIF", assetClassCode: "RA", subAssetClassCode: "INF", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-INFRA", npcClassificationId: 3, longName: "OVV Infrastructuur", shortName: "OVV RA INF", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Landbouw (LAN) — 8 portfolios
  { portfolioCode: "LANRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Landbouw Rendementsportefeuille AC World", shortName: "LAN EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "LANMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Landbouw Matchingportefeuille Overheid", shortName: "LAN FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "LANOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Landbouw Opbouwportefeuille Ontwikkelde Markten", shortName: "LAN EQ DEV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "LANAP", assetClassCode: "RA", subAssetClassCode: "AGR", managerCode: "EXB", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Landbouw Agrarische Portefeuille", shortName: "LAN RA AGR", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "LANDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Landbouw Duurzame Portefeuille", shortName: "LAN EQ DUU", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "LANKE", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "EXA", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Landbouw Krediet Europa", shortName: "LAN FI CRE", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "LANPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Landbouw Private Equity", shortName: "LAN AL PRI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "LANCO", assetClassCode: "RA", subAssetClassCode: "COM", managerCode: "EXA", benchmarkCode: "S&P-GSCI", npcClassificationId: 2, longName: "Landbouw Commoditeiten", shortName: "LAN RA COM", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Chemie (CHE) — 9 portfolios
  { portfolioCode: "CHERP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 2, longName: "Chemie Rendement AC World", shortName: "CHE EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHEMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Chemie Matching Overheid Europa", shortName: "CHE FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHEOP", assetClassCode: "EQ", subAssetClassCode: "EUR", managerCode: "EXA", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 3, longName: "Chemie Opbouw Europa", shortName: "CHE EQ EUR", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHEHY", assetClassCode: "FI", subAssetClassCode: "HYG", managerCode: "EXA", benchmarkCode: "BLOOMBERG-GL-HY", npcClassificationId: 2, longName: "Chemie High Yield Global", shortName: "CHE FI HYG", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHELI", assetClassCode: "FI", subAssetClassCode: "LDI", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Chemie LDI Portefeuille", shortName: "CHE FI LDI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHEVG", assetClassCode: "RA", subAssetClassCode: "REA", managerCode: "EXB", benchmarkCode: "FTSE-EPRA-NAREIT-DEV", npcClassificationId: 2, longName: "Chemie Vastgoed REITs", shortName: "CHE RA REA", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHERP2", assetClassCode: "AL", subAssetClassCode: "RIS", managerCode: "EXA", benchmarkCode: "HFRX-GL-HEDGE", npcClassificationId: 2, longName: "Chemie Risk Parity", shortName: "CHE AL RIS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHELQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Chemie Liquiditeiten Cash", shortName: "CHE CS CAS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "CHEGO", assetClassCode: "FI", subAssetClassCode: "GRE", managerCode: "EXB", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 1, longName: "Chemie Groene Obligaties", shortName: "CHE FI GRE", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },

  // Techniek Nederland (TEC) — 10 portfolios
  { portfolioCode: "TECRP", assetClassCode: "EQ", subAssetClassCode: "ACX", managerCode: "EIG", benchmarkCode: "MSCI-ACWI-NR", npcClassificationId: 2, longName: "Techniek Rendementsportefeuille AC World", shortName: "TEC EQ ACX", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECMP", assetClassCode: "FI", subAssetClassCode: "SOV", managerCode: "EIG", benchmarkCode: "BLOOMBERG-EU-AGG", npcClassificationId: 1, longName: "Techniek Matchingportefeuille Overheid", shortName: "TEC FI SOV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECOP", assetClassCode: "EQ", subAssetClassCode: "DEV", managerCode: "EXA", benchmarkCode: "MSCI-WORLD-NR", npcClassificationId: 3, longName: "Techniek Opbouwportefeuille Ontwikkelde Markten", shortName: "TEC EQ DEV", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECVS", assetClassCode: "EQ", subAssetClassCode: "UNI", managerCode: "EXA", benchmarkCode: "S&P-500-NR", npcClassificationId: 2, longName: "Techniek VS Aandelen", shortName: "TEC EQ UNI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECOM", assetClassCode: "EQ", subAssetClassCode: "EME", managerCode: "EXB", benchmarkCode: "MSCI-EM-NR", npcClassificationId: 2, longName: "Techniek Opkomende Markten", shortName: "TEC EQ EME", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECEK", assetClassCode: "FI", subAssetClassCode: "CRE", managerCode: "EXA", benchmarkCode: "ICE-BOFA-EU-CORP", npcClassificationId: 2, longName: "Techniek Europese Kredieten", shortName: "TEC FI CRE", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECPE", assetClassCode: "AL", subAssetClassCode: "PRI", managerCode: "EXB", benchmarkCode: "RIMES-PRIVATE-EQ", npcClassificationId: 2, longName: "Techniek Private Equity", shortName: "TEC AL PRI", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECVP", assetClassCode: "RA", subAssetClassCode: "RED", managerCode: "EXA", benchmarkCode: "GLOBAL-REIT-NR", npcClassificationId: 2, longName: "Techniek Vastgoedportefeuille Direct", shortName: "TEC RA RED", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECLQ", assetClassCode: "CS", subAssetClassCode: "CAS", managerCode: "EIG", benchmarkCode: "EURO-GOVT-1-3Y", npcClassificationId: 1, longName: "Techniek Liquiditeiten Cash", shortName: "TEC CS CAS", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
  { portfolioCode: "TECDP", assetClassCode: "EQ", subAssetClassCode: "DUU", managerCode: "EIG", benchmarkCode: "CUSTOM-ESG-NL", npcClassificationId: 2, longName: "Techniek Duurzame Portefeuille", shortName: "TEC EQ DUU", activeInd: true, effectiveFrom: "2024-01-01", effectiveUntil: null },
];

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

describe("Seed asset classes — schema validation", () => {
  it("all 8 asset classes validate against clientConfigAssetClassSchema", () => {
    for (const ac of SEED_ASSET_CLASSES) {
      const result = clientConfigAssetClassSchema.safeParse(ac);
      expect(result.success).toBe(true);
    }
  });

  it("all asset class codes are exactly 2 uppercase alpha chars", () => {
    for (const ac of SEED_ASSET_CLASSES) {
      expect(ac.assetClassCode).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("all asset class names are valid against AssetClassValue", () => {
    for (const ac of SEED_ASSET_CLASSES) {
      const result = AssetClassValue.safeParse(ac.assetClassName);
      expect(result.success).toBe(true);
    }
  });
});

describe("Seed sub-asset-classes — schema and hierarchy validation", () => {
  it("all sub-asset-classes validate against clientConfigSubAssetClassSchema", () => {
    for (const sac of SEED_SUB_ASSET_CLASSES) {
      const result = clientConfigSubAssetClassSchema.safeParse(sac);
      expect(result.success).toBe(true);
    }
  });

  it("all sub-asset-class codes are exactly 3 uppercase alphanumeric chars", () => {
    for (const sac of SEED_SUB_ASSET_CLASSES) {
      expect(sac.subAssetClassCode).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  it("every sub-asset-class exists in the allowed hierarchy", () => {
    for (const sac of SEED_SUB_ASSET_CLASSES) {
      const ac = SEED_ASSET_CLASSES.find((a) => a.assetClassId === sac.assetClassId);
      expect(ac).toBeDefined();
      const found = ASSET_SUB_ASSET_OPTIONS.find(
        (opt) => opt.assetClass === ac!.assetClassName && opt.subAssetClass === sac.subAssetClassName,
      );
      expect(found).toBeDefined();
    }
  });
});

describe("Seed managers — schema validation", () => {
  it("all managers validate against ManagerInput schema", () => {
    for (const mgr of SEED_MANAGERS) {
      const result = ManagerInput.safeParse({ managerCode: mgr.managerCode, managerName: mgr.managerName });
      expect(result.success).toBe(true);
    }
  });

  it("all managers validate against clientConfigManagerSchema", () => {
    for (const mgr of SEED_MANAGERS) {
      const result = clientConfigManagerSchema.safeParse(mgr);
      expect(result.success).toBe(true);
    }
  });

  it("all manager codes are exactly 3 uppercase alphanumeric chars", () => {
    for (const mgr of SEED_MANAGERS) {
      expect(mgr.managerCode).toMatch(/^[A-Z0-9]{3}$/);
    }
  });
});

describe("Seed benchmarks — schema validation", () => {
  it("all benchmarks validate against BenchmarkInput schema", () => {
    for (const bm of SEED_BENCHMARKS) {
      const result = BenchmarkInput.safeParse({
        benchmarkCode: bm.benchmarkCode,
        benchmarkName: bm.benchmarkName,
        rimesCode: bm.rimesCode,
      });
      expect(result.success).toBe(true);
    }
  });

  it("all benchmarks validate against clientConfigBenchmarkSchema", () => {
    for (const bm of SEED_BENCHMARKS) {
      const result = clientConfigBenchmarkSchema.safeParse(bm);
      expect(result.success).toBe(true);
    }
  });
});

describe("Seed NPC classifications — schema validation", () => {
  it("all NPC classifications validate against clientConfigNpcClassificationSchema", () => {
    for (const npc of SEED_NPC_CLASSIFICATIONS) {
      const result = clientConfigNpcClassificationSchema.safeParse(npc);
      expect(result.success).toBe(true);
    }
  });
});

describe("Seed parent accounts — schema validation", () => {
  it("all parent accounts validate against ParentAccountInput", () => {
    for (const pa of SEED_PARENT_ACCOUNTS) {
      const result = ParentAccountInput.safeParse({
        parentAccountCode: pa.parentAccountCode,
        msaParentAccountCode: pa.msaParentAccountCode,
      });
      expect(result.success).toBe(true);
    }
  });

  it("all parent accounts validate against clientConfigParentAccountSchema", () => {
    for (const pa of SEED_PARENT_ACCOUNTS) {
      const result = clientConfigParentAccountSchema.safeParse(pa);
      expect(result.success).toBe(true);
    }
  });
});

describe("Seed portfolios — schema validation", () => {
  it("all portfolios validate against PortfolioInput schema", () => {
    for (const pf of SEED_PORTFOLIOS) {
      const result = PortfolioInput.safeParse({
        portfolioCode: pf.portfolioCode,
        parentAccountId: pf.parentAccountId,
      });
      expect(result.success).toBe(true);
    }
  });

  it("all portfolios validate against clientConfigPortfolioSchema", () => {
    for (const pf of SEED_PORTFOLIOS) {
      const result = clientConfigPortfolioSchema.safeParse(pf);
      expect(result.success).toBe(true);
    }
  });

  it("all portfolio codes match the uppercase alphanumeric 2-15 pattern", () => {
    for (const pf of SEED_PORTFOLIOS) {
      expect(pf.portfolioCode).toMatch(/^[A-Z0-9]{2,15}$/);
    }
  });
});

describe("Seed portfolio configurations — primary account ID generation", () => {
  it("generates correct primary_account_id for every configuration", () => {
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      const expectedId = `${cfg.portfolioCode}_${cfg.assetClassCode}${cfg.subAssetClassCode}_${cfg.managerCode}`;
      const generated = generatePrimaryAccountId(
        cfg.portfolioCode,
        cfg.assetClassCode,
        cfg.subAssetClassCode,
        cfg.managerCode,
      );
      expect(generated).toBe(expectedId);
    }
  });

  it("all generated primary_account_ids match the DB CHECK pattern", () => {
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      const id = generatePrimaryAccountId(
        cfg.portfolioCode,
        cfg.assetClassCode,
        cfg.subAssetClassCode,
        cfg.managerCode,
      );
      // Pattern: {portfolio_code}_{2-char AC code}{3-char SAC code}_{3-char mgr code}
      expect(id).toMatch(/^[A-Z0-9]{2,15}_[A-Z]{2}[A-Z0-9]{3}_[A-Z0-9]{3}$/);
    }
  });
});

describe("Seed portfolio configurations — schema validation", () => {
  it("all configurations should validate against clientConfigPortfolioConfigurationSchema", () => {
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      const primaryAccountId = generatePrimaryAccountId(
        cfg.portfolioCode,
        cfg.assetClassCode,
        cfg.subAssetClassCode,
        cfg.managerCode,
      );
      const result = clientConfigPortfolioConfigurationSchema.safeParse({
        primaryAccountId,
        ...cfg,
        effectiveFrom: new Date(cfg.effectiveFrom),
        effectiveUntil: cfg.effectiveUntil ? new Date(cfg.effectiveUntil) : null,
      });
      expect(result.success).toBe(true);
    }
  });

  it("every portfolio code in configurations has a matching portfolio definition", () => {
    const portfolioCodes = new Set<string>(SEED_PORTFOLIOS.map((p) => p.portfolioCode));
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      expect(portfolioCodes.has(cfg.portfolioCode)).toBe(true);
    }
  });

  it("every asset class code in configurations has a matching asset class definition", () => {
    const acCodes = new Set(SEED_ASSET_CLASSES.map((a) => a.assetClassCode));
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      expect(acCodes.has(cfg.assetClassCode)).toBe(true);
    }
  });

  it("every benchmark code in configurations has a matching benchmark definition", () => {
    const bmCodes = new Set(SEED_BENCHMARKS.map((b) => b.benchmarkCode));
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      expect(bmCodes.has(cfg.benchmarkCode)).toBe(true);
    }
  });

  it("every manager code in configurations has a matching manager definition", () => {
    const mgrCodes = new Set(SEED_MANAGERS.map((m) => m.managerCode));
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      expect(mgrCodes.has(cfg.managerCode)).toBe(true);
    }
  });

  it("every NPC classification ID in configurations has a matching definition", () => {
    const npcIds = new Set(SEED_NPC_CLASSIFICATIONS.map((n) => n.npcClassificationId));
    for (const cfg of SEED_PORTFOLIO_CONFIGURATIONS) {
      expect(npcIds.has(cfg.npcClassificationId)).toBe(true);
    }
  });

  it("all configurations have unique primary_account_id values", () => {
    const ids = SEED_PORTFOLIO_CONFIGURATIONS.map((cfg) =>
      generatePrimaryAccountId(cfg.portfolioCode, cfg.assetClassCode, cfg.subAssetClassCode, cfg.managerCode),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly 83 portfolio configurations (matching the legacy seed count)", () => {
    expect(SEED_PORTFOLIO_CONFIGURATIONS.length).toBe(83);
  });
});