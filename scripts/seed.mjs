import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed data.");
const sql = postgres(connectionString, { max: 1 });

// Asset class ID map (lookup by name)
const assetClassIdMap = {
  "Aandelen": "00000002-0000-4000-a000-000000000001",
  "Obligaties": "00000002-0000-4000-a000-000000000002",
  "Vastgoed": "00000002-0000-4000-a000-000000000003",
  "Alternatieven": "00000002-0000-4000-a000-000000000004",
  "Liquiditeiten": "00000002-0000-4000-a000-000000000005",
  "Private Equity": "00000002-0000-4000-a000-000000000006",
  "Infrastructuur": "00000002-0000-4000-a000-000000000007",
  "Grondstoffen": "00000002-0000-4000-a000-000000000008",
};

const benchmarks = [
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
];

const clients = [
  ["9f9280fc-9572-49d1-b81c-2a039652bc93", "Pensioenfonds Horizon", "PF-HOR-001"],
  ["7b9303c1-3a0d-4398-a5c2-740ea76dfe37", "Stichting Pensioen Zeker", "PF-ZEK-002"],
];

const portfolios = [
  ["c4707067-b98a-4a0f-92c7-5ee510dc70ff", clients[0][0], "Rendementsportefeuille", "HOR-RP", benchmarks[0][0]],
  ["c12ca209-4df0-4774-bf96-0e31b5a10ff4", clients[0][0], "Matchingportefeuille", "HOR-MP", benchmarks[2][0]],
  ["93de32a3-f238-4504-9fad-ab97cbe1a174", clients[1][0], "Return portefeuille", "ZEK-RET", benchmarks[1][0]],
];

try {
  for (const [id, code, name, assetClassName, currency, cost, provider] of benchmarks) {
    const assetClassId = assetClassIdMap[assetClassName] || null;
    await sql`
      INSERT INTO benchmark_catalog (id, code, name, asset_class, asset_class_id, currency, cost, provider)
      VALUES (${id}, ${code}, ${name}, ${assetClassName}, ${assetClassId}, ${currency}, ${cost}, ${provider})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  for (const [id, name, reference] of clients) {
    await sql`
      INSERT INTO clients (id, name, external_reference) VALUES (${id}, ${name}, ${reference})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  for (const [id, clientId, name, reference, benchmarkId] of portfolios) {
    await sql`
      INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id)
      VALUES (${id}, ${clientId}, ${name}, ${reference}, ${benchmarkId})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log("Demo client config seeded.");
} finally {
  await sql.end();
}
