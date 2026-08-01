import type { Benchmark, ClientConfig, WtpClassification, AssetClassRow, Manager, BenchmarkGroup, ClientConfigAssetClass, ClientConfigBenchmark as ClientConfigBenchmarkType, ClientConfigClient, ClientConfigManager, ClientConfigNpcClassification, ClientConfigParentAccount, ClientConfigPortfolio, ClientConfigReferenceData, ClientConfigSubAssetClass } from "@/lib/types";
import {
  ASSET_CLASS_CODES,
  ASSET_CLASS_KEYS,
  ASSET_SUB_ASSET_OPTIONS,
} from "@/lib/asset-classes";

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
  { id: "00000003-0000-4000-a000-000000000001", name: "EIGEN BEHEER" },
  { id: "00000003-0000-4000-a000-000000000002", name: "ABERDEEN" },
  { id: "00000003-0000-4000-a000-000000000003", name: "ACADIAN" },
  { id: "00000003-0000-4000-a000-000000000004", name: "ADVENT" },
  { id: "00000003-0000-4000-a000-000000000005", name: "AEGON" },
  { id: "00000003-0000-4000-a000-000000000006", name: "ALLIANCE BERNSTEIN" },
  { id: "00000003-0000-4000-a000-000000000007", name: "ALLSPRING" },
  { id: "00000003-0000-4000-a000-000000000008", name: "ALMAZARA" },
  { id: "00000003-0000-4000-a000-000000000009", name: "AQR" },
  { id: "00000003-0000-4000-a000-000000000010", name: "ARROWSTREET" },
  { id: "00000003-0000-4000-a000-000000000011", name: "AXA" },
  { id: "00000003-0000-4000-a000-000000000012", name: "BARCLAYS" },
  { id: "00000003-0000-4000-a000-000000000013", name: "BARINGS" },
  { id: "00000003-0000-4000-a000-000000000014", name: "BLACKROCK" },
  { id: "00000003-0000-4000-a000-000000000015", name: "BLUEBAY" },
  { id: "00000003-0000-4000-a000-000000000016", name: "BNP PARIBAS" },
  { id: "00000003-0000-4000-a000-000000000017", name: "BSM" },
  { id: "00000003-0000-4000-a000-000000000018", name: "CARDANO" },
  { id: "00000003-0000-4000-a000-000000000019", name: "CITIBANK" },
  { id: "00000003-0000-4000-a000-000000000020", name: "CTI" },
  { id: "00000003-0000-4000-a000-000000000021", name: "DDJ" },
  { id: "00000003-0000-4000-a000-000000000022", name: "DE MUNT HYPOTHEKEN" },
  { id: "00000003-0000-4000-a000-000000000023", name: "DEUTSCHE" },
  { id: "00000003-0000-4000-a000-000000000024", name: "DYNAMIC CREDIT" },
  { id: "00000003-0000-4000-a000-000000000025", name: "FIDELITY" },
  { id: "00000003-0000-4000-a000-000000000026", name: "GOLDMAN SACHS" },
  { id: "00000003-0000-4000-a000-000000000027", name: "HENDERSON" },
  { id: "00000003-0000-4000-a000-000000000028", name: "ING" },
  { id: "00000003-0000-4000-a000-000000000029", name: "INSIGHT" },
  { id: "00000003-0000-4000-a000-000000000030", name: "INTERMEDE" },
  { id: "00000003-0000-4000-a000-000000000031", name: "IRISH LIFE" },
  { id: "00000003-0000-4000-a000-000000000032", name: "JP MORGAN" },
  { id: "00000003-0000-4000-a000-000000000033", name: "KEMPEN" },
  { id: "00000003-0000-4000-a000-000000000034", name: "KOPERNIK" },
  { id: "00000003-0000-4000-a000-000000000035", name: "LAZARD" },
  { id: "00000003-0000-4000-a000-000000000036", name: "LEGAL & GENERAL" },
  { id: "00000003-0000-4000-a000-000000000037", name: "LSV" },
  { id: "00000003-0000-4000-a000-000000000038", name: "M&G" },
  { id: "00000003-0000-4000-a000-000000000039", name: "METLIFE" },
  { id: "00000003-0000-4000-a000-000000000040", name: "MFS" },
  { id: "00000003-0000-4000-a000-000000000041", name: "MORGAN STANLEY" },
  { id: "00000003-0000-4000-a000-000000000042", name: "NINETY ONE" },
  { id: "00000003-0000-4000-a000-000000000043", name: "NOMURA" },
  { id: "00000003-0000-4000-a000-000000000044", name: "NORDEA" },
  { id: "00000003-0000-4000-a000-000000000045", name: "NORTHERN TRUST" },
  { id: "00000003-0000-4000-a000-000000000046", name: "OAKTREE" },
  { id: "00000003-0000-4000-a000-000000000047", name: "PAYDEN RYGEL" },
  { id: "00000003-0000-4000-a000-000000000048", name: "PGIM" },
  { id: "00000003-0000-4000-a000-000000000049", name: "PIMCO" },
  { id: "00000003-0000-4000-a000-000000000050", name: "PINESTONE" },
  { id: "00000003-0000-4000-a000-000000000051", name: "PVF HYPOTHEKEN" },
  { id: "00000003-0000-4000-a000-000000000052", name: "PZENA" },
  { id: "00000003-0000-4000-a000-000000000053", name: "ROBECO" },
  { id: "00000003-0000-4000-a000-000000000054", name: "RUSSELL" },
  { id: "00000003-0000-4000-a000-000000000055", name: "SIXTH STREET" },
  { id: "00000003-0000-4000-a000-000000000056", name: "STATESTREET" },
  { id: "00000003-0000-4000-a000-000000000057", name: "STONE HARBOUR" },
  { id: "00000003-0000-4000-a000-000000000058", name: "T-ROWE" },
  { id: "00000003-0000-4000-a000-000000000059", name: "UBS" },
];

export const benchmarkGroups: BenchmarkGroup[] = [
  { id: "00000004-0000-4000-a000-000000000001", name: "Benchmark A" },
  { id: "00000004-0000-4000-a000-000000000002", name: "Benchmark B" },
  { id: "00000004-0000-4000-a000-000000000003", name: "Benchmark C" },
];

// ── ClientConfigReferenceData fixtures (3NF schema) ─────────────────────

export const demoClientConfigAssetClasses: ClientConfigAssetClass[] =
  ASSET_CLASS_KEYS.map((assetClassName, index) => ({
    assetClassId: index + 1,
    assetClassCode: ASSET_CLASS_CODES[assetClassName],
    assetClassName,
  }));

const demoClientConfigAssetClassIds = new Map(
  demoClientConfigAssetClasses.map((assetClass) => [
    assetClass.assetClassName,
    assetClass.assetClassId,
  ]),
);

export const demoClientConfigSubAssetClasses: ClientConfigSubAssetClass[] =
  ASSET_SUB_ASSET_OPTIONS.map((option, index) => ({
    subAssetClassId: index + 1,
    assetClassId: demoClientConfigAssetClassIds.get(option.assetClass) ?? 0,
    subAssetClassCode: option.subAssetClassCode,
    subAssetClassName: option.subAssetClass,
  }));

export const demoClientConfigManagers: ClientConfigManager[] = [
  { managerId: 1, managerCode: "OWN", managerName: "EIGEN BEHEER" },
  { managerId: 2, managerCode: "ABD", managerName: "ABERDEEN" },
  { managerId: 3, managerCode: "ACA", managerName: "ACADIAN" },
  { managerId: 4, managerCode: "ADV", managerName: "ADVENT" },
  { managerId: 5, managerCode: "AEG", managerName: "AEGON" },
  { managerId: 6, managerCode: "AB", managerName: "ALLIANCE BERNSTEIN" },
  { managerId: 7, managerCode: "ALL", managerName: "ALLSPRING" },
  { managerId: 8, managerCode: "ALM", managerName: "ALMAZARA" },
  { managerId: 9, managerCode: "AQR", managerName: "AQR" },
  { managerId: 10, managerCode: "ARR", managerName: "ARROWSTREET" },
  { managerId: 11, managerCode: "AXA", managerName: "AXA" },
  { managerId: 12, managerCode: "BAR", managerName: "BARCLAYS" },
  { managerId: 13, managerCode: "BRG", managerName: "BARINGS" },
  { managerId: 14, managerCode: "BLK", managerName: "BLACKROCK" },
  { managerId: 15, managerCode: "BLB", managerName: "BLUEBAY" },
  { managerId: 16, managerCode: "BNP", managerName: "BNP PARIBAS" },
  { managerId: 17, managerCode: "BSM", managerName: "BSM" },
  { managerId: 18, managerCode: "CAR", managerName: "CARDANO" },
  { managerId: 19, managerCode: "CIT", managerName: "CITIBANK" },
  { managerId: 20, managerCode: "CTI", managerName: "CTI" },
  { managerId: 21, managerCode: "DDJ", managerName: "DDJ" },
  { managerId: 22, managerCode: "DMF", managerName: "DE MUNT HYPOTHEKEN" },
  { managerId: 23, managerCode: "DWS", managerName: "DEUTSCHE" },
  { managerId: 24, managerCode: "DYC", managerName: "DYNAMIC CREDIT" },
  { managerId: 25, managerCode: "FID", managerName: "FIDELITY" },
  { managerId: 26, managerCode: "GOL", managerName: "GOLDMAN SACHS" },
  { managerId: 27, managerCode: "HND", managerName: "HENDERSON" },
  { managerId: 28, managerCode: "ING", managerName: "ING" },
  { managerId: 29, managerCode: "INS", managerName: "INSIGHT" },
  { managerId: 30, managerCode: "INT", managerName: "INTERMEDE" },
  { managerId: 31, managerCode: "IRL", managerName: "IRISH LIFE" },
  { managerId: 32, managerCode: "JPM", managerName: "JP MORGAN" },
  { managerId: 33, managerCode: "KMP", managerName: "KEMPEN" },
  { managerId: 34, managerCode: "KPR", managerName: "KOPERNIK" },
  { managerId: 35, managerCode: "LAZ", managerName: "LAZARD" },
  { managerId: 36, managerCode: "LG", managerName: "LEGAL & GENERAL" },
  { managerId: 37, managerCode: "LSV", managerName: "LSV" },
  { managerId: 38, managerCode: "MG", managerName: "M&G" },
  { managerId: 39, managerCode: "MET", managerName: "METLIFE" },
  { managerId: 40, managerCode: "MFS", managerName: "MFS" },
  { managerId: 41, managerCode: "MS", managerName: "MORGAN STANLEY" },
  { managerId: 42, managerCode: "NIN", managerName: "NINETY ONE" },
  { managerId: 43, managerCode: "NOM", managerName: "NOMURA" },
  { managerId: 44, managerCode: "NOR", managerName: "NORDEA" },
  { managerId: 45, managerCode: "NT", managerName: "NORTHERN TRUST" },
  { managerId: 46, managerCode: "OAK", managerName: "OAKTREE" },
  { managerId: 47, managerCode: "PAY", managerName: "PAYDEN RYGEL" },
  { managerId: 48, managerCode: "PGM", managerName: "PGIM" },
  { managerId: 49, managerCode: "PIM", managerName: "PIMCO" },
  { managerId: 50, managerCode: "PS", managerName: "PINESTONE" },
  { managerId: 51, managerCode: "PVF", managerName: "PVF HYPOTHEKEN" },
  { managerId: 52, managerCode: "PZE", managerName: "PZENA" },
  { managerId: 53, managerCode: "ROB", managerName: "ROBECO" },
  { managerId: 54, managerCode: "RUS", managerName: "RUSSELL" },
  { managerId: 55, managerCode: "6ST", managerName: "SIXTH STREET" },
  { managerId: 56, managerCode: "SST", managerName: "STATESTREET" },
  { managerId: 57, managerCode: "SH", managerName: "STONE HARBOUR" },
  { managerId: 58, managerCode: "TRO", managerName: "T-ROWE" },
  { managerId: 59, managerCode: "UBS", managerName: "UBS" },
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

export const demoClientConfigClients: ClientConfigClient[] = [
  { clientCode: "HOR", clientName: "Pensioenfonds Horizon" },
  { clientCode: "ZEK", clientName: "Stichting Pensioen Zeker" },
];

export const demoClientConfigPortfolios: ClientConfigPortfolio[] = [
  { portfolioId: 1, portfolioCode: "HORRP", parentAccountId: null, activeInd: true },
  { portfolioId: 1, portfolioCode: "HOR-RP", parentAccountId: null, activeInd: true },
  { portfolioId: 2, portfolioCode: "HOR-MP", parentAccountId: null, activeInd: true },
  { portfolioId: 3, portfolioCode: "ZEK-RET", parentAccountId: null, activeInd: true },
];

export const demoClientConfigParentAccounts: ClientConfigParentAccount[] = [
  { parentAccountId: 1, parentAccountCode: "HOOFD_HOR", msaParentAccountCode: null, activeInd: true },
  { parentAccountId: 2, parentAccountCode: "HOOFD_ZEK", msaParentAccountCode: null, activeInd: true },
];

export const demoClientConfigReferenceData: ClientConfigReferenceData = {
  clients: demoClientConfigClients,
  portfolios: demoClientConfigPortfolios,
  assetClasses: demoClientConfigAssetClasses,
  subAssetClasses: demoClientConfigSubAssetClasses,
  managers: demoClientConfigManagers,
  benchmarks: demoClientConfigBenchmarks,
  npcClassifications: demoClientConfigNpcClassifications,
  parentAccounts: demoClientConfigParentAccounts,
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
