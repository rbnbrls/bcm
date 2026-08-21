/**
 * Inspect client/portfolio mapping for the created benchmark change request
 * (t_1bcd4e58) — why the change detail page shows a different client name.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm");

async function main() {
  const cr = await sql`
    SELECT id, reference, client_id, change_type, change_type_id, status
    FROM change_requests WHERE id = '5c17266a-72bc-40fa-8796-d62613c2f624'
  `;
  console.log("CR " + JSON.stringify(cr[0]));

  if (cr[0]?.client_id) {
    const client = await sql`
      SELECT id, name, external_reference FROM clients WHERE id = ${cr[0].client_id}
    `;
    console.log("CLIENT " + JSON.stringify(client));
  }

  const allClients = await sql`
    SELECT id, name, external_reference FROM clients ORDER BY name LIMIT 20
  `;
  console.log("ALL_CLIENTS " + JSON.stringify(allClients, null, 1));

  const ctc = await sql`
    SELECT id, slug, name FROM change_type_config ORDER BY slug LIMIT 20
  `;
  console.log("CHANGE_TYPES " + JSON.stringify(ctc.map((r) => ({ id: r.id, slug: r.slug, name: r.name }))));

  await sql.end();
}

main().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
