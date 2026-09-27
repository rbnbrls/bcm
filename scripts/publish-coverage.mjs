#!/usr/bin/env node
/**
 * Turn the coverage run's summary into the report this repository publishes.
 *
 * `npm run test:coverage` writes `coverage/coverage-summary.json`, but its keys
 * are absolute per-machine paths and it carries no ordering guarantee, so the
 * generated file is not something another checkout can read and diff. This
 * script normalises it in place, keeping the istanbul json-summary shape
 * unchanged (`total` plus one entry per file) and only:
 *
 *   - rewriting every file key relative to the repository root, so the report is
 *     the same file in a worker checkout and in CI, and
 *   - sorting the entries, so a change to the report is a change to coverage
 *     and not a change to iteration order.
 *
 * It refuses to publish a report whose paths belong to another checkout: a
 * published number that describes someone else's tree is worse than no report.
 *
 * Why the summary and not `coverage/lcov.info`: the quality lane reads a
 * committed report with a 400 000-character limit, and this suite's lcov report
 * is ~484 KB — read back it would be truncated mid-file and the lane would
 * record the lines of the first ~80% of the tree (measured: 60.24% instead of
 * 65.08%). The summary carries the same line total in ~88 KB, so the published
 * percentage is the whole suite's. The full lcov/html reports stay CI artifacts.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const reportPath = path.resolve(process.argv[2] ?? "coverage/coverage-summary.json");

if (!existsSync(reportPath)) {
  console.error(`coverage summary not found: ${reportPath}`);
  console.error("run `npm run test:coverage` first");
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (error) {
  console.error(`coverage summary is not valid JSON: ${reportPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const total = summary?.total?.lines;
if (!total || typeof total.pct !== "number" || typeof total.total !== "number") {
  console.error("coverage summary has no line total");
  process.exit(1);
}

let root;
try {
  root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
} catch {
  root = process.cwd();
}

const foreign = [];
const entries = new Map();
for (const [key, value] of Object.entries(summary)) {
  if (key === "total") continue;
  if (key.startsWith(`${root}/`)) {
    entries.set(key.slice(root.length + 1), value);
  } else if (key.startsWith("/")) {
    foreign.push(key);
  } else {
    entries.set(key, value);
  }
}

if (foreign.length) {
  console.error(
    `coverage summary describes files outside this checkout (${foreign.length}, e.g. ${foreign[0]})`,
  );
  console.error(`expected every path under ${root}`);
  process.exit(1);
}

// istanbul's own layout: `{"total": {…}` then one line per file entry. Keeping
// it means a refresh diffs as the files whose coverage changed, nothing else.
const body = [`{"total": ${JSON.stringify(summary.total)}`];
for (const key of [...entries.keys()].sort()) {
  body.push(`,${JSON.stringify(key)}: ${JSON.stringify(entries.get(key))}`);
}
const published = `${body.join("\n")}\n}\n`;

// Never write a report that does not parse: the committed copy is the evidence.
try {
  JSON.parse(published);
} catch (error) {
  console.error("published coverage summary would not parse; refusing to write it");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

writeFileSync(reportPath, published);

const line = `Published line coverage: ${total.pct}% (${total.covered}/${total.total} lines)`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${line} (committed as ${path.relative(root, reportPath)})\n`,
    );
  } catch {
    /* the step summary is a convenience, never a reason to fail */
  }
}
