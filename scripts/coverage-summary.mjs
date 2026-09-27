#!/usr/bin/env node
/**
 * Print the line-coverage total measured by `npm run test:coverage`.
 *
 * Reads the json-summary report written by the vitest v8 coverage provider
 * (see vitest.config.ts) and emits a single machine-readable line so CI logs
 * and the workflow step summary always carry the line total. Exits non-zero
 * when the report is missing or malformed: a coverage run that cannot state
 * its line total must fail the job instead of silently reporting nothing.
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import path from "node:path";

const summaryPath = path.resolve(
  process.argv[2] ?? path.join("coverage", "coverage-summary.json"),
);

if (!existsSync(summaryPath)) {
  console.error(`coverage summary not found: ${summaryPath}`);
  console.error("run `npm run test:coverage` first");
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(summaryPath, "utf8"));
} catch (error) {
  console.error(`coverage summary is not valid JSON: ${summaryPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const total = summary?.total?.lines;
if (!total || typeof total.pct !== "number" || typeof total.total !== "number") {
  console.error("coverage summary has no line total");
  process.exit(1);
}

const line = `Line coverage: ${total.pct}% (${total.covered}/${total.total} lines)`;

console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
