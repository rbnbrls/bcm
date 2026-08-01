// ─────────────────────────────────────────────────────────────
// fix-change-type-configs.mjs
// Fix: Correctly seed/upsert change_type_config records with
// canonical UUIDs using parameterized queries.
//
// Unlike fix-change-type-config-ids.mjs, this version uses
// parameterized queries from the postgres npm library instead of
// raw SQL string interpolation, completely avoiding the JSON
// escaping issues that caused previous attempts to silently fail.
//
// Idempotent — safe to run multiple times.
// ─────────────────────────────────────────────────────────────

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run this migration.");
}

const CANONICAL_CONFIGS = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    slug: "benchmark_switch",
    name: "Benchmarkwissel",
    description: "Wijzig de benchmark van een portefeuille naar een andere benchmark",
    extendedExplanation:
      "Een benchmarkwissel wijzigt de referentie-index (benchmark) waartegen een portefeuille wordt beheerd en gemeten.",
    category: "benchmark",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "current_benchmark_id", label: "Huidige benchmark (IST)", type: "benchmark", required: true, referenceTable: "benchmark_catalog", readOnly: true },
      { key: "requested_benchmark_id", label: "Gewenste benchmark (SOLL)", type: "benchmark", required: true, referenceTable: "benchmark_catalog" },
    ],
    istSollMapping: [
      { ist: "current_benchmark_id", soll: "requested_benchmark_id", labelIst: "Huidige benchmark (IST)", labelSoll: "Gewenste benchmark (SOLL)" },
    ],
    cost: { baseCost: 0, costCurrency: "EUR", perItemCost: 500, description: "€500 per portefeuille" },
    defaultLeadDays: 7,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
      { id: "factset", name: "FactSet", role: "data_provider", notifyOn: ["on_completion"], mandatory: false, contactType: "webhook" },
    ],
    workflow: "benchmark_switch",
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de benchmarkwissel op en dient de aanvraag in ter goedkeuring." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "Asset service provider controleert de aangevraagde wijziging en accordeert deze." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Uitvoeren benchmarkwissel", leadTime: "2 werkdagen", description: "Asset service provider voert de benchmarkwissel door in de systemen." },
      { stepOrder: 4, stakeholder: "FactSet", stakeholderId: "factset", action: "Verwerken en bevestigen", leadTime: "1 werkdag", description: "FactSet verwerkt de wijziging en stuurt een bevestiging van de verwerking." },
      { stepOrder: 5, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de verwerking en meldt de change gereed." },
    ],
    active: true,
    sortOrder: 10,
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    slug: "new_benchmark",
    name: "Nieuwe benchmark",
    description: "Voeg een nieuwe benchmark toe aan de catalogus",
    extendedExplanation: "Een nieuwe benchmark aanvraag voegt een nog niet bestaande referentie-index toe aan de benchmarkcatalogus.",
    category: "benchmark",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "asset_class", label: "Asset class", type: "select", required: true, options: [
        { value: "Aandelen", label: "Aandelen" },
        { value: "Obligaties", label: "Obligaties" },
        { value: "Vastgoed", label: "Vastgoed" },
        { value: "Alternatieven", label: "Alternatieven" },
        { value: "Liquidity", label: "Liquiditeiten" },
        { value: "Private Equity", label: "Private Equity" },
      ]},
      { key: "currency", label: "Valuta", type: "select", required: true, defaultValue: "EUR", options: [{ value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }, { value: "GBP", label: "GBP" }] },
      { key: "long_name", label: "Volledige benchmark naam", type: "text", required: true },
    ],
    istSollMapping: [],
    cost: { baseCost: 5000, costCurrency: "EUR", description: "€5.000 eenmalige kost" },
    defaultLeadDays: 28,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
    ],
    workflow: "new_benchmark",
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de aanvraag voor een nieuwe benchmark op en dient deze in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "5 werkdagen", description: "Asset service provider controleert de benchmarkgegevens en accordeert de toevoeging." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Toevoegen aan catalogus", leadTime: "10 werkdagen", description: "Asset service provider voegt de nieuwe benchmark toe aan de benchmarkcatalogus." },
      { stepOrder: 4, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de toevoeging en meldt de change gereed." },
    ],
    active: true,
    sortOrder: 20,
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    slug: "fee_change",
    name: "Tariefwijziging",
    description: "Wijzig de beheervergoeding voor een portefeuille",
    extendedExplanation: "Een tariefwijziging past de beheervergoeding aan die voor een portefeuille in rekening wordt gebracht.",
    category: "fee",
    fields: [
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
      { key: "current_fee", label: "Huidig tarief (IST)", type: "currency", required: true },
      { key: "requested_fee", label: "Nieuw tarief (SOLL)", type: "currency", required: true },
      { key: "fee_type", label: "Type tarief", type: "select", required: true, options: [
        { value: "management_fee", label: "Beheervergoeding" },
        { value: "performance_fee", label: "Prestatievergoeding" },
        { value: "fixed_fee", label: "Vast tarief" },
      ]},
      { key: "effective_date", label: "Ingangsdatum", type: "date", required: true },
      { key: "rationale", label: "Reden wijziging", type: "longtext", required: true },
    ],
    istSollMapping: [
      { ist: "current_fee", soll: "requested_fee", labelIst: "Huidig tarief (IST)", labelSoll: "Nieuw tarief (SOLL)" },
    ],
    cost: { baseCost: 250, costCurrency: "EUR", description: "€250 vaste kost" },
    defaultLeadDays: 10,
    stakeholders: [
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit", "on_approval"], mandatory: true, contactType: "webhook" },
      { id: "asset_service", name: "Asset service provider", role: "executor", notifyOn: ["on_approval"], mandatory: true, contactType: "email" },
      { id: "factset", name: "FactSet", role: "data_provider", notifyOn: ["on_completion"], mandatory: false, contactType: "webhook" },
    ],
    workflow: "fee_change",
    processFlow: [
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Interne administratie stelt de tariefwijziging op en dient de aanvraag in." },
      { stepOrder: 2, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Controleren en accorderen", leadTime: "3 werkdagen", description: "Asset service provider controleert het nieuwe tarief en accordeert." },
      { stepOrder: 3, stakeholder: "Asset service provider", stakeholderId: "asset_service", action: "Verwerken tariefwijziging", leadTime: "2 werkdagen", description: "Asset service provider verwerkt het nieuwe tarief in de systemen." },
      { stepOrder: 4, stakeholder: "FactSet", stakeholderId: "factset", action: "Doorvoeren in rapportages", leadTime: "1 werkdag", description: "FactSet werkt het tarief door in de rapportagestromen." },
      { stepOrder: 5, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Gereedmelding", leadTime: "—", description: "Interne administratie controleert de verwerking en meldt de change gereed." },
    ],
    active: true,
    sortOrder: 30,
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    slug: "mandate_change",
    name: "Mandaatwijziging",
    description: "Wijzig de mandaatvoorwaarden van een portefeuille",
    category: "mandate",
    fields: [{ key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" }],
    istSollMapping: [],
    cost: { baseCost: 350, costCurrency: "EUR", description: "€350 vaste kost" },
    defaultLeadDays: 14,
    stakeholders: [],
    workflow: "mandate_change",
    processFlow: [],
    active: true,
    sortOrder: 40,
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    slug: "custodian_change",
    name: "Custodianwijziging",
    description: "Wijzig de custodian van een portefeuille",
    category: "custodian",
    fields: [{ key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" }],
    istSollMapping: [],
    cost: { baseCost: 200, costCurrency: "EUR", description: "€200 vaste kost" },
    defaultLeadDays: 21,
    stakeholders: [],
    workflow: "custodian_change",
    processFlow: [],
    active: true,
    sortOrder: 50,
  },
  {
    id: "a0000000-0000-0000-0000-000000000006",
    slug: "rebalance_trigger",
    name: "Herbalanceringsdrempel",
    description: "Stel een herbalanceringsdrempel of -frequentie in",
    category: "rebalance",
    fields: [{ key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" }],
    istSollMapping: [],
    cost: { baseCost: 150, costCurrency: "EUR", description: "€150 vaste kost" },
    defaultLeadDays: 5,
    stakeholders: [],
    workflow: "rebalance_trigger",
    processFlow: [],
    active: true,
    sortOrder: 60,
  },
  {
    id: "a0000000-0000-0000-0000-000000000007",
    slug: "customer_onboarding",
    name: "Nieuwe klant",
    description: "Onboard een nieuwe klant met FPR/SPR regeling en portfolio's",
    category: "client",
    fields: [],
    istSollMapping: [],
    cost: { baseCost: 0, costCurrency: "EUR", description: "Geen kosten" },
    defaultLeadDays: 1,
    stakeholders: [],
    workflow: "customer_onboarding",
    processFlow: [],
    active: true,
    sortOrder: 5,
  },
  {
    id: "a0000000-0000-0000-0000-000000000008",
    slug: "portfolio_addition",
    name: "Nieuwe portfolio toevoegen",
    description: "Voeg een nieuwe portefeuille toe aan een bestaande cliënt",
    category: "portfolio",
    fields: [{ key: "client_id", label: "Klant", type: "select", required: true, referenceTable: "clients" }],
    istSollMapping: [],
    cost: { baseCost: 500, costCurrency: "EUR", description: "€500 vaste kost voor toevoegen van een portefeuille" },
    defaultLeadDays: 5,
    stakeholders: [],
    workflow: "portfolio_addition",
    processFlow: [],
    active: true,
    sortOrder: 7,
  },
  {
    id: "a0000000-0000-0000-0000-000000000009",
    slug: "new_asset_class",
    name: "Nieuwe asset class",
    description: "Voeg een nieuwe asset class toe aan de client-config referentiedata",
    category: "mandate",
    fields: [],
    istSollMapping: [],
    cost: { baseCost: 2500, costCurrency: "EUR", description: "€2.500 eenmalige kost" },
    defaultLeadDays: 21,
    stakeholders: [],
    workflow: "new_asset_class",
    processFlow: [],
    active: true,
    sortOrder: 25,
  },
  {
    id: "a0000000-0000-0000-0000-000000000010",
    slug: "new_sub_asset_class",
    name: "Nieuwe sub asset class",
    description: "Voeg een nieuwe sub asset class toe onder een bestaande asset class",
    category: "mandate",
    fields: [],
    istSollMapping: [],
    cost: { baseCost: 1500, costCurrency: "EUR", description: "€1.500 eenmalige kost" },
    defaultLeadDays: 14,
    stakeholders: [],
    workflow: "new_sub_asset_class",
    processFlow: [],
    active: true,
    sortOrder: 26,
  },
];

async function main() {
  const sql = postgres(connectionString, { max: 1 });

  try {
    // Ensure extended_explanation column exists
    console.log("[fix-change-type-configs] Ensuring extended_explanation column exists…");
    await sql.unsafe(`
      ALTER TABLE change_type_config
      ADD COLUMN IF NOT EXISTS extended_explanation text
    `);
    console.log("[fix-change-type-configs] Column check done.");

    // Upsert each config individually using parameterized queries
    let upserted = 0;
    let failed = 0;

    for (const cfg of CANONICAL_CONFIGS) {
      try {
        await sql`
          INSERT INTO change_type_config (
            id, slug, name, description, extended_explanation, category,
            fields, ist_soll_mapping, cost, default_lead_days, stakeholders,
            workflow, process_flow, active, sort_order, created_at, updated_at
          ) VALUES (
            ${cfg.id}, ${cfg.slug}, ${cfg.name}, ${cfg.description},
            ${cfg.extendedExplanation ?? null}, ${cfg.category},
            ${JSON.stringify(cfg.fields)}::jsonb,
            ${cfg.istSollMapping ? JSON.stringify(cfg.istSollMapping) : null}::jsonb,
            ${JSON.stringify(cfg.cost)}::jsonb,
            ${cfg.defaultLeadDays},
            ${JSON.stringify(cfg.stakeholders)}::jsonb,
            ${cfg.workflow},
            ${cfg.processFlow ? JSON.stringify(cfg.processFlow) : '[]'}::jsonb,
            ${cfg.active}, ${cfg.sortOrder},
            now(), now()
          )
          ON CONFLICT (slug) DO UPDATE SET
            id = EXCLUDED.id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            extended_explanation = EXCLUDED.extended_explanation,
            category = EXCLUDED.category,
            fields = EXCLUDED.fields,
            ist_soll_mapping = EXCLUDED.ist_soll_mapping,
            cost = EXCLUDED.cost,
            default_lead_days = EXCLUDED.default_lead_days,
            stakeholders = EXCLUDED.stakeholders,
            workflow = EXCLUDED.workflow,
            process_flow = EXCLUDED.process_flow,
            active = EXCLUDED.active,
            sort_order = EXCLUDED.sort_order,
            updated_at = now()
        `;
        console.log(`  ✓ ${cfg.slug} → ${cfg.id}`);
        upserted++;
      } catch (err) {
        console.error(`  ✗ ${cfg.slug}: ${err instanceof Error ? err.message : err}`);
        failed++;
      }
    }

    console.log(`[fix-change-type-configs] Done: ${upserted} upserted, ${failed} failed.`);

    // Verify
    const count = await sql`SELECT COUNT(*) AS cnt FROM change_type_config`;
    console.log(`[fix-change-type-configs] Total change_type_config records: ${count[0]?.cnt ?? 0}`);

    const bmSwitch = await sql`
      SELECT id, slug, name FROM change_type_config WHERE slug = 'benchmark_switch'
    `;
    if (bmSwitch.length > 0) {
      console.log(`[fix-change-type-configs] Verified benchmark_switch → ${bmSwitch[0].id}`);
    } else {
      console.error("[fix-change-type-configs] ERROR: benchmark_switch NOT FOUND after fix!");
    }
  } finally {
    await sql.end();
  }
}

try {
  await main();
} catch (err) {
  console.error("[fix-change-type-configs] Fatal error:", err instanceof Error ? err.message : err);
  throw err;
}
