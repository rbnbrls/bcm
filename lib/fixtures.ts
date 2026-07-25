import type { Benchmark, ClientConfig } from "@/lib/types";

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
];

export const demoClientConfigs: ClientConfig[] = [
  {
    id: "9f9280fc-9572-49d1-b81c-2a039652bc93",
    name: "Pensioenfonds Horizon",
    externalReference: "PF-HOR-001",
    portfolios: [
      { id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff", name: "Rendementsportefeuille", externalReference: "HOR-RP", currentBenchmarkId: benchmarks[0].id, currentBenchmark: benchmarks[0] },
      { id: "c12ca209-4df0-4774-bf96-0e31b5a10ff4", name: "Matchingportefeuille", externalReference: "HOR-MP", currentBenchmarkId: benchmarks[2].id, currentBenchmark: benchmarks[2] },
    ],
  },
  {
    id: "7b9303c1-3a0d-4398-a5c2-740ea76dfe37",
    name: "Stichting Pensioen Zeker",
    externalReference: "PF-ZEK-002",
    portfolios: [
      { id: "93de32a3-f238-4504-9fad-ab97cbe1a174", name: "Return portefeuille", externalReference: "ZEK-RET", currentBenchmarkId: benchmarks[1].id, currentBenchmark: benchmarks[1] },
    ],
  },
];
