import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed data.");
const sql = postgres(connectionString, { max: 1 });

const benchmarks = [
  ["9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1", "MSCI-WORLD-NR", "MSCI World Net Return", "Aandelen", "EUR"],
  ["b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d", "MSCI-ACWI-NR", "MSCI ACWI Net Return", "Aandelen", "EUR"],
  ["7c8bd971-b05c-4141-9a27-7ee0d02137a5", "BLOOMBERG-EU-AGG", "Bloomberg Euro Aggregate", "Obligaties", "EUR"],
  ["9644a84d-59d6-40fa-aee9-062fbc1ef9fc", "ICE-BOFA-EU-CORP", "ICE BofA Euro Corporate", "Obligaties", "EUR"],
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
  for (const [id, code, name, assetClass, currency] of benchmarks) {
    await sql`INSERT INTO benchmark_catalog (id, code, name, asset_class, currency) VALUES (${id}, ${code}, ${name}, ${assetClass}, ${currency}) ON CONFLICT (id) DO NOTHING`;
  }
  for (const [id, name, reference] of clients) {
    await sql`INSERT INTO clients (id, name, external_reference) VALUES (${id}, ${name}, ${reference}) ON CONFLICT (id) DO NOTHING`;
  }
  for (const [id, clientId, name, reference, benchmarkId] of portfolios) {
    await sql`INSERT INTO portfolios (id, client_id, name, external_reference, current_benchmark_id) VALUES (${id}, ${clientId}, ${name}, ${reference}, ${benchmarkId}) ON CONFLICT (id) DO NOTHING`;
  }
  console.log("Demo client config seeded.");
} finally {
  await sql.end();
}
