#!/usr/bin/env node
/**
 * Report the current record counts in the local e2e database, to compare
 * against the recorded baseline (see documentation/development/benchmark-change-test-environment.md).
 * Usage: DATABASE_URL=postgres://bcm@localhost:5432/bcm node scripts/check-baseline-counts.mjs
 */
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://bcm@localhost:5432/bcm";
const client = new Client({ connectionString: DATABASE_URL });

const COUNTS = [
  ["portfolios", "portfolios"],
  ["clients", "clients"],
  ["benchmark_catalog", "benchmark catalog entries"],
  ["change_requests", "change requests"],
  ["workflow_definition", "workflow definitions"],
  ["workflow_instance", "workflow instances"],
];

try {
  await client.connect();
  for (const [table, label] of COUNTS) {
    const { rows } = await client.query(`SELECT count(*) AS n FROM ${table}`);
    console.log(`${label}: ${rows[0].n}`);
  }
  await client.end();
} catch (error) {
  console.error(`❌ Count check failed: ${error.message}`);
  process.exit(1);
}
