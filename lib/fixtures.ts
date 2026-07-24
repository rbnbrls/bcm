import type { Benchmark, ClientConfig } from "@/lib/types";

export const benchmarks: Benchmark[] = [
  { id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1", code: "MSCI-WORLD-NR", name: "MSCI World Net Return", assetClass: "Aandelen", currency: "EUR" },
  { id: "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d", code: "MSCI-ACWI-NR", name: "MSCI ACWI Net Return", assetClass: "Aandelen", currency: "EUR" },
  { id: "7c8bd971-b05c-4141-9a27-7ee0d02137a5", code: "BLOOMBERG-EU-AGG", name: "Bloomberg Euro Aggregate", assetClass: "Obligaties", currency: "EUR" },
  { id: "9644a84d-59d6-40fa-aee9-062fbc1ef9fc", code: "ICE-BOFA-EU-CORP", name: "ICE BofA Euro Corporate", assetClass: "Obligaties", currency: "EUR" },
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
