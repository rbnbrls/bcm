#!/usr/bin/env node
/**
 * Confirm the local e2e database only has localhost connections (isolation check).
 * Usage: DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/check-db-connections.mjs
 */
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm";
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  const { rows } = await client.query(
    `SELECT usename,
            CASE WHEN client_addr IS NULL THEN 'local-socket'
                 ELSE host(client_addr) END AS client,
            application_name, state
     FROM pg_stat_activity WHERE datname IS NOT NULL
     ORDER BY client`,
  );
  console.table(rows);
  const remote = rows.filter(
    (x) => !["local-socket", "127.0.0.1", "::1", "localhost"].includes(x.client),
  );
  if (remote.length === 0) {
    console.log("✅ All database connections are local (localhost / unix socket). No production connections.");
  } else {
    console.log(`❌ Found ${remote.length} non-localhost connection(s):`);
    for (const r of remote) console.log(`   ${r.usename} @ ${r.client} (${r.application_name})`);
    process.exit(1);
  }
  await client.end();
} catch (error) {
  console.error(`❌ Isolation check failed: ${error.message}`);
  process.exit(1);
}
