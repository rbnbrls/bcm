import type { Benchmark, ClientConfig, WtpClassification, AssetClassRow, Manager, BenchmarkGroup, ClientConfigAssetClass, ClientConfigBenchmark as ClientConfigBenchmarkType, ClientConfigManager, ClientConfigNpcClassification, ClientConfigPortfolio, ClientConfigReferenceData, ClientConfigSubAssetClass } from "@/lib/types";

// ── Portfolio attribute lookup table fixtures ──────────────────────────

export const wtpClassifications: WtpClassification[] = [
  { id: "00000001-0000-4000-a000-000000000001", name: "Rendement" },
  { id: "00000001-0000-4000-a000-000000000002", name: "Matching" },
  { id: "00000001-0000-4000-a000-000000000003", name: "Opbouw" },
];

export const assetClassRows: AssetClassRow[] = [
  { id: "00000002-0000-4000-a000-000000000001", name: "Aandelen" },
  { id: "00000002-0000-4000-a000-000000000002", name: "Obligaties" },
  { id: "00000002-0000-4000-a000-000000000003", name: "Vastgoed" },
  { id: "00000002-0000-4000-a000-000000000004", name: "Alternatieven" },
  { id: "00000002-0000-4000-a000-000000000005", name: "Liquiditeiten" },
  { id: "00000002-0000-4000-a000-000000000006", name: "Private Equity" },
  { id: "00000002-0000-4000-a000-000000000007", name: "Infrastructuur" },
  { id: "00000002-0000-4000-a000-000000000008", name: "Grondstoffen" },
];

export const managers: Manager[] = [
  { id: "00000003-0000-4000-a000-000000000001", name: "Eigen beheer" },
  { id: "00000003-0000-4000-a000-000000000002", name: "Externe beheerder A" },
  { id: "00000003-0000-4000-a000-000000000003", name: "Externe beheerder B" },
];

export const benchmarkGroups: BenchmarkGroup[] = [
  { id: "00000004-0000-4000-a000-000000000001", name: "Benchmark A" },
  { id: "00000004-0000-4000-a000-000000000002", name: "Benchmark B" },
  { id: "00000004-0000-4000-a000-000000000003", name: "Benchmark C" },
];

// ── ClientConfigReferenceData fixtures (3NF schema) ─────────────────────

export const demoClientConfigAssetClasses: ClientConfigAssetClass[] = [
  { assetClassId: 1, assetClassCode: "EQ", assetClassName: "Aandelen" },
  { assetClassId: 2, assetClassCode: "FI", assetClassName: "Obligaties" },
  { assetClassId: 3, assetClassCode: "RE", assetClassName: "Vastgoed" },
  { assetClassId: 4, assetClassCode: "AL", assetClassName: "Alternatieven" },
  { assetClassId: 5, assetClassCode: "LI", assetClassName: "Liquiditeiten" },
];

export const demoClientConfigSubAssetClasses: ClientConfigSubAssetClass[] = [
  // Aandelen (EQ)
  { subAssetClassId: 1, assetClassId: 1, subAssetClassCode: "AC WORLD", subAssetClassName: "Aandelen Wereldwijd" },
  { subAssetClassId: 2, assetClassId: 1, subAssetClassCode: "DEVELOPED MARKETS", subAssetClassName: "Ontwikkelde Markten" },
  { subAssetClassId: 3, assetClassId: 1, subAssetClassCode: "EMERGING MARKETS", subAssetClassName: "Opkomende Markten" },
  // Obligaties (FI)
  { subAssetClassId: 4, assetClassId: 2, subAssetClassCode: "SOVEREIGN EUROPE", subAssetClassName: "Overheid Europa" },
  { subAssetClassId: 5, assetClassId: 2, subAssetClassCode: "CORPORATE EUROPE", subAssetClassName: "Corporate Europa" },
  // Vastgoed (RE)
  { subAssetClassId: 6, assetClassId: 3, subAssetClassCode: "DIRECT REAL ESTATE", subAssetClassName: "Direct Vastgoed" },
  { subAssetClassId: 7, assetClassId: 3, subAssetClassCode: "REIT", subAssetClassName: "REITs" },
  // Alternatieven (AL)
  { subAssetClassId: 8, assetClassId: 4, subAssetClassCode: "HEDGE FUNDS", subAssetClassName: "Hedgefondsen" },
  { subAssetClassId: 9, assetClassId: 4, subAssetClassCode: "PRIVATE EQUITY", subAssetClassName: "Private Equity" },
  // Liquiditeiten (LI)
  { subAssetClassId: 10, assetClassId: 5, subAssetClassCode: "CASH", subAssetClassName: "Cash" },
];

export const demoClientConfigManagers: ClientConfigManager[] = [
  { managerId: 1, managerCode: "EIGEN", managerName: "Eigen beheer" },
  { managerId: 2, managerCode: "EXT_A", managerName: "Externe beheerder A" },
  { managerId: 3, managerCode: "EXT_B", managerName: "Externe beheerder B" },
];

export const demoClientConfigBenchmarks: ClientConfigBenchmarkType[] = [
  { benchmarkId: 1, benchmarkCode: "MSCI-WORLD-NR", benchmarkName: "MSCI World Net Return", rimesCode: "MWNR" },
  { benchmarkId: 2, benchmarkCode: "MSCI-ACWI-NR", benchmarkName: "MSCI ACWI Net Return", rimesCode: "MACWI" },
  { benchmarkId: 3, benchmarkCode: "BLOOMBERG-EU-AGG", benchmarkName: "Bloomberg Euro Aggregate", rimesCode: "BEUA" },
  { benchmarkId: 4, benchmarkCode: "BLOOMBERG-GL-AGG", benchmarkName: "Bloomberg Global Aggregate", rimesCode: "BGLA" },
  { benchmarkId: 5, benchmarkCode: "CUSTOM-ESG-NL", benchmarkName: "Duurzame NL Benchmark", rimesCode: "CESG" },
];

export const demoClientConfigNpcClassifications: ClientConfigNpcClassification[] = [
  { npcClassificationId: 1, classificationName: "Geen NPC" },
  { npcClassificationId: 2, classificationName: "Niet-pensioen (belegd)" },
  { npcClassificationId: 3, classificationName: "Niet-pensioen (onbelegd)" },
];

export const demoClientConfigPortfolios: ClientConfigPortfolio[] = [
  { portfolioId: 1, portfolioCode: "HOR-RP", parentAccountId: null },
  { portfolioId: 2, portfolioCode: "HOR-MP", parentAccountId: null },
  { portfolioId: 3, portfolioCode: "ZEK-RET", parentAccountId: null },
];

export const demoClientConfigReferenceData: ClientConfigReferenceData = {
  portfolios: demoClientConfigPortfolios,
  assetClasses: demoClientConfigAssetClasses,
  subAssetClasses: demoClientConfigSubAssetClasses,
  managers: demoClientConfigManagers,
  benchmarks: demoClientConfigBenchmarks,
  npcClassifications: demoClientConfigNpcClassifications,
};

// ── Legacy fixtures ────────────────────────────────────────────────────

export const benchmarks: Benchmark[] = [
  { id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1", code: "MSCI-WORLD-NR", name: "MSCI World Net Return", assetClass: "Aandelen", currency: "EUR", cost: 1000, provider: "MSCI" },
  { id: "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d", code: "MSCI-ACWI-NR", name: "MSCI ACWI Net Return", assetClass: "Aandelen", currency: "EUR", cost: 1200, provider: "MSCI" },
  { id: "7c8bd971-b05c-4141-9a27-7ee0d02137a5", code: "BLOOMBERG-EU-AGG", name: "Bloomberg Euro Aggregate", assetClass: "Obligaties", currency: "EUR", cost: 1000, provider: "Bloomberg" },
  { id: "9644a84d-59d6-40fa-aee9-062fbc1ef9fc", code: "ICE-BOFA-EU-CORP", name: "ICE BofA Euro Corporate", assetClass: "Obligaties", currency: "EUR", cost: 1000, provider: "ICE BofA" },
  { id: "a1b2c3d4-e5f6-7890-abcd-ef0123456780", code: "CUSTOM-ESG-NL", name: "Duurzame NL Benchmark", assetClass: "Aandelen", currency: "EUR", cost: 1500, provider: "rimes" },
  { id: "a1b2c3d4-e5f6-7890-abcd-ef0123456781", code: "RIMES-PRIVATE-EQ", name: "Rimes Private Equity Index", assetClass: "Alternatieven", currency: "EUR", cost: 2000, provider: "rimes" },
  { id: "a1b2c3d4-e5f6-7890-abcd-ef0123456782", code: "EURO-GOVT-1-3Y", name: "Euro Government 1-3 Year", assetClass: "Obligaties", currency: "EUR", cost: 800, provider: "Bloomberg" },
  { id: "a1b2c3d4-e5f6-7890-abcd-ef0123456783", code: "GLOBAL-REIT-NR", name: "Global REIT Net Return", assetClass: "Vastgoed", currency: "EUR", cost: 1500, provider: "MSCI" },
  { id: "9a1b2c3d-4e5f-6789-abcd-ef0123456784", code: "MSCI-EM-NR", name: "MSCI Emerging Markets Net Return", assetClass: "Aandelen", currency: "USD", cost: 1000, provider: "MSCI" },
  { id: "9a1b2c3d-4e5f-6789-abcd-ef0123456785", code: "BLOOMBERG-GL-AGG", name: "Bloomberg Global Aggregate", assetClass: "Obligaties", currency: "USD", cost: 1000, provider: "Bloomberg" },
  { id: "9a1b2c3d-4e5f-6789-abcd-ef0123456786", code: "HFRX-GL-HEDGE", name: "HFRX Global Hedge Fund Index", assetClass: "Alternatieven", currency: "USD", cost: 2500, provider: "HFRX" },
  { id: "9a1b2c3d-4e5f-6789-abcd-ef0123456787", code: "S&P-500-NR", name: "S&P 500 Net Return", assetClass: "Aandelen", currency: "USD", cost: 1000, provider: "S&P" },
  { id: "a2b1c3d4-e5f6-7890-abcd-ef0123456788", code: "S&P-GSCI", name: "S&P GSCI Commodity Total Return", assetClass: "Grondstoffen", currency: "USD", cost: 1500, provider: "S&P" },
  { id: "a2b1c3d4-e5f6-7890-abcd-ef0123456789", code: "MSCI-WORLD-INFRA", name: "MSCI World Infrastructure Net Return", assetClass: "Infrastructuur", currency: "EUR", cost: 1400, provider: "MSCI" },
  { id: "a2b1c3d4-e5f6-7890-abcd-ef0123456790", code: "BLOOMBERG-GL-HY", name: "Bloomberg Global High Yield", assetClass: "Obligaties", currency: "USD", cost: 1800, provider: "Bloomberg" },
  { id: "a2b1c3d4-e5f6-7890-abcd-ef0123456791", code: "FTSE-EPRA-NAREIT-DEV", name: "FTSE EPRA Nareit Developed", assetClass: "Vastgoed", currency: "EUR", cost: 1200, provider: "FTSE Russell" },
  { id: "a2b1c3d4-e5f6-7890-abcd-ef0123456792", code: "MSCI-WORLD-HEALTH", name: "MSCI World Health Care Net Return", assetClass: "Aandelen", currency: "EUR", cost: 1100, provider: "MSCI" },
];

export const demoClientConfigs: ClientConfig[] = [
  {
    id: "9f9280fc-9572-49d1-b81c-2a039652bc93",
    name: "Pensioenfonds Horizon",
    externalReference: "PF-HOR-001",
    regelingType: "FPR",
    assetClass: "MULTI_ASSETS",
    portfolios: [
      {
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
        name: "Rendementsportefeuille",
        externalReference: "HOR-RP",
        currentBenchmarkId: benchmarks[0].id,
        currentBenchmark: benchmarks[0],
        wtpClassificationId: wtpClassifications[0].id,
        wtpClassification: wtpClassifications[0],
        assetClassId: assetClassRows[0].id,
        assetClassRow: assetClassRows[0],
        assetClass: "EQUITIES",
        subAssetClass: "AC WORLD",
        managerId: managers[0].id,
        manager: managers[0],
        benchmarkId: benchmarkGroups[0].id,
        benchmarkGroup: benchmarkGroups[0],
      },
      {
        id: "c12ca209-4df0-4774-bf96-0e31b5a10ff4",
        name: "Matchingportefeuille",
        externalReference: "HOR-MP",
        currentBenchmarkId: benchmarks[2].id,
        currentBenchmark: benchmarks[2],
        wtpClassificationId: wtpClassifications[1].id,
        wtpClassification: wtpClassifications[1],
        assetClassId: assetClassRows[1].id,
        assetClassRow: assetClassRows[1],
        assetClass: "FIXED_INCOME",
        subAssetClass: "SOVEREIGN EUROPE",
        managerId: managers[0].id,
        manager: managers[0],
        benchmarkId: benchmarkGroups[1].id,
        benchmarkGroup: benchmarkGroups[1],
      },
    ],
  },
  {
    id: "7b9303c1-3a0d-4398-a5c2-740ea76dfe37",
    name: "Stichting Pensioen Zeker",
    externalReference: "PF-ZEK-002",
    assetClass: "EQUITIES",
    portfolios: [
      {
        id: "93de32a3-f238-4504-9fad-ab97cbe1a174",
        name: "Return portefeuille",
        externalReference: "ZEK-RET",
        currentBenchmarkId: benchmarks[1].id,
        currentBenchmark: benchmarks[1],
        wtpClassificationId: wtpClassifications[0].id,
        wtpClassification: wtpClassifications[0],
        assetClassId: assetClassRows[0].id,
        assetClassRow: assetClassRows[0],
        assetClass: "EQUITIES",
        subAssetClass: "DEVELOPED MARKETS",
        managerId: managers[1].id,
        manager: managers[1],
        benchmarkId: benchmarkGroups[0].id,
        benchmarkGroup: benchmarkGroups[0],
      },
    ],
  },
];
