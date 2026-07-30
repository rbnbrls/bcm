// ─────────────────────────────────────────────────────────────
// fix-change-type-config-ids.mjs
// Migration: Fix canonical change type config UUIDs
//
// Problem: ON CONFLICT (slug) DO NOTHING in the original
// migration silently skips canonical UUID insertion when a
// record with the same slug already has a different UUID
// (e.g. gen_random_uuid() from an earlier migration pass).
//
// This exposed a 3-layer bug:
//   1. ON CONFLICT (slug) DO NOTHING prevents canonical IDs
//   2. getChangeTypeBySlug() had an in-memory fallback masking
//      the gap in DB
//   3. saveChangeRequest() had a raw DB check with no fallback
//
// Fix: Use ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id
// to upsert the canonical UUIDs. If a legacy record with the
// same slug exists, its ID gets overwritten with the correct
// canonical UUID.
//
// Idempotent — safe to run multiple times.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run this fix migration.");
}

async function main() {
  const sql = postgres(connectionString, { max: 1 });

  try {
    console.log(
      "[fix-change-type-config-ids] Ensuring extended_explanation column exists…"
    );

    // Add extended_explanation column if it doesn't exist yet.
    // The runtime seedChangeTypeConfigs (in db.ts) tries to INSERT into
    // this column, so it must exist for seeding to work.
    await sql.unsafe(`
      ALTER TABLE change_type_config
      ADD COLUMN IF NOT EXISTS extended_explanation text
    `);

    console.log(
      "[fix-change-type-config-ids] Upserting canonical change type config IDs…"
    );

    await sql.unsafe(`
      INSERT INTO change_type_config (id, slug, name, description, category, fields, cost, default_lead_days, stakeholders, workflow, process_flow, active, sort_order, created_at, updated_at) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'benchmark_switch', 'Benchmarkwissel', 'Wijzig de benchmark van een portefeuille naar een andere benchmark', 'benchmark', '[]'::jsonb, '{"baseCost":0,"costCurrency":"EUR","perItemCost":500,"description":"\\u20ac500 per portefeuille"}'::jsonb, 7, '[]'::jsonb, 'benchmark_switch', '[]'::jsonb, true, 10, now(), now()),
      ('a0000000-0000-0000-0000-000000000002', 'new_benchmark', 'Nieuwe benchmark', 'Voeg een nieuwe benchmark toe aan de catalogus', 'benchmark', '[]'::jsonb, '{"baseCost":5000,"costCurrency":"EUR","description":"\\u20ac5.000 eenmalige kost"}'::jsonb, 28, '[]'::jsonb, 'new_benchmark', '[]'::jsonb, true, 20, now(), now()),
      ('a0000000-0000-0000-0000-000000000003', 'fee_change', 'Tariefwijziging', 'Wijzig de beheervergoeding voor een portefeuille', 'fee', '[]'::jsonb, '{"baseCost":250,"costCurrency":"EUR","description":"\\u20ac250 vaste kost"}'::jsonb, 10, '[]'::jsonb, 'fee_change', '[]'::jsonb, true, 30, now(), now()),
      ('a0000000-0000-0000-0000-000000000004', 'mandate_change', 'Mandaatwijziging', 'Wijzig de mandaatvoorwaarden van een portefeuille', 'mandate', '[]'::jsonb, '{"baseCost":350,"costCurrency":"EUR","description":"\\u20ac350 vaste kost"}'::jsonb, 14, '[]'::jsonb, 'mandate_change', '[]'::jsonb, true, 40, now(), now()),
      ('a0000000-0000-0000-0000-000000000005', 'custodian_change', 'Custodianwijziging', 'Wijzig de custodian van een portefeuille', 'custodian', '[]'::jsonb, '{"baseCost":200,"costCurrency":"EUR","description":"\\u20ac200 vaste kost"}'::jsonb, 21, '[]'::jsonb, 'custodian_change', '[]'::jsonb, true, 50, now(), now()),
      ('a0000000-0000-0000-0000-000000000006', 'rebalance_trigger', 'Herbalanceringsdrempel', 'Stel een herbalanceringsdrempel of -frequentie in', 'rebalance', '[]'::jsonb, '{"baseCost":150,"costCurrency":"EUR","description":"\\u20ac150 vaste kost"}'::jsonb, 5, '[]'::jsonb, 'rebalance_trigger', '[]'::jsonb, true, 60, now(), now()),
      ('a0000000-0000-0000-0000-000000000007', 'customer_onboarding', 'Nieuwe klant', 'Onboard een nieuwe klant met FPR/SPR regeling en portfolio''s', 'client', '[]'::jsonb, '{"baseCost":0,"costCurrency":"EUR","description":"Geen kosten"}'::jsonb, 1, '[]'::jsonb, 'customer_onboarding', '[]'::jsonb, true, 5, now(), now()),
      ('a0000000-0000-0000-0000-000000000008', 'portfolio_addition', 'Nieuwe portfolio toevoegen', 'Voeg een nieuwe portefeuille toe aan een bestaande cli\u00ebnt', 'portfolio', '[]'::jsonb, '{"baseCost":500,"costCurrency":"EUR","description":"\\u20ac500 vaste kost voor toevoegen van een portefeuille"}'::jsonb, 5, '[]'::jsonb, 'portfolio_addition', '[]'::jsonb, true, 7, now(), now())
      ON CONFLICT (slug) DO UPDATE SET
        id = EXCLUDED.id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = now()
    `);

    const result = await sql`
      SELECT id, slug, name FROM change_type_config WHERE slug LIKE 'benchmark_switch'
    `;
    if (result.length > 0) {
      console.log(
        `[fix-change-type-config-ids] Verified: ${result[0].slug} → ${result[0].id}`
      );
    }

    console.log(
      "[fix-change-type-config-ids] Canonical change type config IDs ensured."
    );
  } finally {
    await sql.end();
  }
}

try {
  await main();
} catch (err) {
  console.error(
    "[fix-change-type-config-ids] Fatal error:",
    err instanceof Error ? err.message : err
  );
  throw err;
}