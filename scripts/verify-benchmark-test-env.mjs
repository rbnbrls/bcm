#!/usr/bin/env node
/**
 * Verify the benchmark-change test environment and report the baseline
 * benchmark configuration.
 *
 * Checks:
 *   1. Database reachable and seeded (portfolios, clients, benchmark catalog)
 *   2. benchmark-wijziging workflow definition published + role bindings
 *   3. Baseline benchmark per test portfolio
 *   4. Required feature-flag env vars (warns when missing)
 *
 * Usage:
 *   DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/verify-benchmark-test-env.mjs
 *
 * Exit code: 0 when all checks pass, 1 otherwise (flags missing => warn only).
 */
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm";
const TEST_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff"; // HOR-RP

const REQUIRED_FLAGS = [
  ["BCM_FEATURE_WORKFLOW_STUDIO_BUILDER", "Workflow Studio builder"],
  ["BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH", "Workflow Studio publish"],
  ["BCM_FEATURE_WORKFLOW_RUNTIME_START", "Workflow runtime start"],
];

function flagFragment(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

let failures = 0;
let warnings = 0;

function ok(message) {
  console.log(`  ✅ ${message}`);
}

function fail(message) {
  failures += 1;
  console.log(`  ❌ ${message}`);
}

function warn(message) {
  warnings += 1;
  console.log(`  ⚠️  ${message}`);
}

const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  console.log("\n📦 Database connection");
  ok(`connected to ${DATABASE_URL}`);

  // --- Portfolios ---------------------------------------------------------
  console.log("\n🏦 Test portfolio");
  const { rows: portfolios } = await client.query(
    `SELECT p.id, p.name, p.external_reference, p.active, c.name AS client_name
     FROM portfolios p LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1`,
    [TEST_PORTFOLIO_ID],
  );
  if (portfolios.length === 1) {
    const p = portfolios[0];
    ok(`portfolio ${p.name} (${p.external_reference}) active=${p.active}, client=${p.client_name}`);
  } else {
    fail(`test portfolio ${TEST_PORTFOLIO_ID} not found (run npm run db:seed)`);
  }

  // --- Baseline benchmarks ------------------------------------------------
  console.log("\n📊 Baseline benchmark configuration");
  const { rows: baselines } = await client.query(
    `SELECT p.name AS portfolio, p.external_reference, bc.code, bc.name AS benchmark_name
     FROM portfolios p
     LEFT JOIN benchmark_catalog bc ON bc.id = p.current_benchmark_id
     ORDER BY p.name`,
  );
  for (const row of baselines) {
    ok(`${row.portfolio} (${row.external_reference}) -> ${row.code} (${row.benchmark_name})`);
  }

  // --- Workflow definition ------------------------------------------------
  console.log("\n⚙️  benchmark-wijziging workflow");
  const { rows: defs } = await client.query(
    `SELECT id, slug, status, tenant, business_unit, client_ids
     FROM workflow_definition WHERE slug = 'benchmark-wijziging'`,
  );
  if (defs.length === 0) {
    fail("benchmark-wijziging definition not found (POST /api/workflows/benchmark-change once to create it)");
  } else {
    const def = defs[0];
    ok(`definition ${def.slug} status=${def.status} tenant=${def.tenant} bu=${def.business_unit} clients=${JSON.stringify(def.client_ids)}`);

    const { rows: versions } = await client.query(
      `SELECT id, version_number, status FROM workflow_version
       WHERE workflow_definition_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [def.id],
    );
    if (versions.length === 1) {
      ok(`version v${versions[0].version_number} status=${versions[0].status}`);

      const { rows: bindings } = await client.query(
        `SELECT workflow_role, permissions FROM workflow_role_binding WHERE workflow_version_id = $1 ORDER BY workflow_role`,
        [versions[0].id],
      );
      const roleMap = Object.fromEntries(bindings.map((b) => [b.workflow_role, b.permissions]));
      if (roleMap.change_manager?.includes("workflow:start")) ok("role binding change_manager -> workflow:start");
      else fail("role binding change_manager -> workflow:start missing");
      if (roleMap.account_manager?.includes("workflow:approve")) ok("role binding account_manager -> workflow:approve");
      else fail("role binding account_manager -> workflow:approve missing");
    } else {
      fail("no published workflow version");
    }
  }

  // --- Feature flags ------------------------------------------------------
  console.log("\n🚩 Feature flags");
  for (const [envName, label] of REQUIRED_FLAGS) {
    const value = process.env[envName];
    if (value && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) {
      ok(`${envName}=${value} (${label})`);
    } else {
      warn(`${envName} not enabled (${label}); workflow will not be startable`);
    }
  }
  const defId = defs[0]?.id;
  if (defId) {
    const flag = `BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_${flagFragment(defId)}`;
    const value = process.env[flag];
    if (value && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) {
      ok(`${flag}=true (per-workflow cutover)`);
    } else {
      warn(`${flag} not enabled; workflow stays on "classic" and cannot be started`);
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`❌ ${failures} check(s) failed`);
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} warning(s) — environment runs but workflow may not be fully startable`);
  } else {
    console.log("✅ All checks passed — environment ready for benchmark change testing");
  }
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Environment verification failed: ${error.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
