#!/usr/bin/env node
/**
 * Seed test data for staged config change-detail Playwright tests.
 *
 * Creates three change requests with change_portfolio_configuration rows:
 *   1. A draft change (test view + delete)
 *   2. A submitted change (test view + amend)
 *   3. A processed change (test view + apply outcomes)
 *
 * Idempotent: deletes any existing E2E test data first, then re-inserts.
 *
 * Usage: DATABASE_URL=postgres://bcm@localhost:5432/bcm node tests/e2e/seed-staged-config-e2e.mjs
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}

const sql = (await import("postgres")).default(connectionString, { max: 2 });

try {
  // ── Clean up any previous E2E test data ──
  const e2eIds = [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000003",
  ];
  for (const id of e2eIds) {
    await sql`DELETE FROM client_config.change_portfolio_configuration WHERE change_request_id = ${id}`;
    await sql`DELETE FROM change_requests WHERE id = ${id}`;
  }

  // ── Reference data (must match seeded DB) ──
  const [client] = await sql`SELECT id, name, external_reference FROM clients ORDER BY created_at LIMIT 1`;
  if (!client) throw new Error("No client found. Run seed.mjs first.");

  const [portfolioAdditionType] = await sql`
    SELECT id, slug, stakeholders FROM change_type_config WHERE slug = 'portfolio_addition' LIMIT 1
  `;
  if (!portfolioAdditionType) throw new Error("change_type_config portfolio_addition not found.");

  const clientId = client.id;

  // ── Create test change #1: DRAFT (2 rows) ──
  const draftId = "00000000-0000-0000-0000-000000000001";
  const draftRef = "E2E-DRAFT-001";

  await sql`
    INSERT INTO change_requests (id, reference, change_type, change_type_id, client_id, requested_by, rationale, effective_date, status, sla_lead_weeks, status_updated_at, fields, stakeholders)
    VALUES (${draftId}, ${draftRef}, 'portfolio_addition', ${portfolioAdditionType.id}, ${clientId}, 'E2E Test', 'E2E test: staged config draft change for delete scenario.', CURRENT_DATE + INTERVAL '30 days', 'draft', 1, now(), '[]'::jsonb, ${JSON.stringify(portfolioAdditionType.stakeholders ?? [])}::jsonb)
  `;

  await sql`
    INSERT INTO client_config.change_portfolio_configuration (change_request_id, action_type, client_code, portfolio_code, asset_class_code, sub_asset_class_code, manager_code, benchmark_code, npc_classification_id, long_name, short_name, effective_from)
    VALUES (${draftId}, 'CREATE', 'HOR', 'HORRP', 'EQ', 'DEV', 'EIG', 'MSCI-WORLD-NR', 1, 'E2E Draft Test Portfolio Long', 'E2E-DRAFT-PF', CURRENT_DATE + INTERVAL '30 days')
  `;
  await sql`
    INSERT INTO client_config.change_portfolio_configuration (change_request_id, action_type, client_code, portfolio_code, asset_class_code, sub_asset_class_code, manager_code, benchmark_code, npc_classification_id, long_name, short_name, effective_from)
    VALUES (${draftId}, 'UPDATE', 'HOR', 'HORMP', 'FI', 'SOV', 'ROB', 'BLOOMBERG-EU-AGG', 2, 'E2E Draft Second Row Long', 'E2E-DRAFT-PF2', CURRENT_DATE + INTERVAL '30 days')
  `;

  // ── Create test change #2: SUBMITTED (1 row) ──
  const submittedId = "00000000-0000-0000-0000-000000000002";
  const submittedRef = "E2E-SUBM-001";

  await sql`
    INSERT INTO change_requests (id, reference, change_type, change_type_id, client_id, requested_by, rationale, effective_date, status, sla_lead_weeks, status_updated_at, submitted_at, fields, stakeholders)
    VALUES (${submittedId}, ${submittedRef}, 'portfolio_addition', ${portfolioAdditionType.id}, ${clientId}, 'E2E Test', 'E2E test: staged config submitted change for amend scenario.', CURRENT_DATE + INTERVAL '30 days', 'submitted', 1, now(), now(), '[]'::jsonb, ${JSON.stringify(portfolioAdditionType.stakeholders ?? [])}::jsonb)
  `;

  await sql`
    INSERT INTO client_config.change_portfolio_configuration (change_request_id, action_type, client_code, portfolio_code, asset_class_code, sub_asset_class_code, manager_code, benchmark_code, npc_classification_id, long_name, short_name, effective_from)
    VALUES (${submittedId}, 'CREATE', 'HOR', 'HORRP', 'FI', 'COR', 'ROB', 'BLOOMBERG-EU-AGG', 1, 'E2E Amendable Test Portfolio Long', 'E2E-AMEND-PF', CURRENT_DATE + INTERVAL '30 days')
  `;

  // ── Create test change #3: PROCESSED (3 rows with apply outcomes) ──
  const processedId = "00000000-0000-0000-0000-000000000003";
  const processedRef = "E2E-PROC-001";

  await sql`
    INSERT INTO change_requests (id, reference, change_type, change_type_id, client_id, requested_by, rationale, effective_date, status, sla_lead_weeks, status_updated_at, submitted_at, processed_at, processed_by, fields, stakeholders)
    VALUES (${processedId}, ${processedRef}, 'portfolio_addition', ${portfolioAdditionType.id}, ${clientId}, 'E2E Test', 'E2E test: staged config processed change for apply outcome scenario.', CURRENT_DATE + INTERVAL '30 days', 'processed', 1, now(), now(), CURRENT_DATE, 'E2E Processor', '[]'::jsonb, ${JSON.stringify(portfolioAdditionType.stakeholders ?? [])}::jsonb)
  `;

  // Row 1: applied
  await sql`
    INSERT INTO client_config.change_portfolio_configuration (change_request_id, action_type, client_code, portfolio_code, asset_class_code, sub_asset_class_code, manager_code, benchmark_code, npc_classification_id, long_name, short_name, effective_from, apply_status)
    VALUES (${processedId}, 'CREATE', 'HOR', 'HORRP', 'EQ', 'DEV', 'EIG', 'MSCI-WORLD-NR', 1, 'E2E Applied Portfolio Long', 'E2E-APPLIED', CURRENT_DATE, 'applied')
  `;

  // Row 2: skipped with error
  await sql`
    INSERT INTO client_config.change_portfolio_configuration (change_request_id, action_type, client_code, portfolio_code, asset_class_code, sub_asset_class_code, manager_code, benchmark_code, npc_classification_id, long_name, short_name, effective_from, apply_status, apply_error)
    VALUES (${processedId}, 'UPDATE', 'HOR', 'HORMP', 'FI', 'SOV', 'ROB', 'BLOOMBERG-EU-AGG', 2, 'E2E Skipped Portfolio Long', 'E2E-SKIPPED', CURRENT_DATE, 'skipped', 'Duplicate entry already exists')
  `;

  // Row 3: failed with error
  await sql`
    INSERT INTO client_config.change_portfolio_configuration (change_request_id, action_type, client_code, portfolio_code, asset_class_code, sub_asset_class_code, manager_code, benchmark_code, npc_classification_id, long_name, short_name, effective_from, apply_status, apply_error)
    VALUES (${processedId}, 'DELETE', 'HOR', 'ZEKRET', 'EQ', 'EME', 'ROB', 'MSCI-EM-NR', 3, 'E2E Failed Portfolio Long', 'E2E-FAILED', CURRENT_DATE, 'failed', 'Benchmark code not found in FactSet')
  `;

  console.log("Staged config E2E test data seeded:");
  console.log(`  Draft change:     ${draftId} (${draftRef}) — 2 rows`);
  console.log(`  Submitted change: ${submittedId} (${submittedRef}) — 1 row`);
  console.log(`  Processed change: ${processedId} (${processedRef}) — 3 rows`);
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
