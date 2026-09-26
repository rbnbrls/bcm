#!/usr/bin/env node
/**
 * Report — and gate — the coverage report committed to the default branch.
 *
 * The factory's quality lane can only read a repository's coverage percentage
 * from a machine-readable report that lives *in the tree*
 * (`coverage/coverage-summary.json` is the one this repository publishes): a CI
 * artifact expires, a badge is an image and a log line is not durable evidence.
 *
 * Reading the *committed* copy is deliberately not the same as reading the file
 * on disk: in CI the coverage run has already overwritten the report by the time
 * a later step looks at it. The committed copy is therefore taken from
 * `git show HEAD:<path>`, which is what a reader on the default branch sees.
 *
 * Modes:
 *   (default)  print the committed report's line total; fail when the report is
 *              missing, does not parse, or carries absolute per-machine paths —
 *              that is the published-coverage acceptance criterion, and it must
 *              never regress silently.
 *   --compare  additionally compare the committed total against this run's report
 *              (`coverage/coverage-summary.json` on disk): print both and the
 *              delta, warn when the committed report is behind, and fail only
 *              when it claims *more* coverage than the run produced (a number
 *              that overstates reality cannot be excused as staleness).
 *
 * The staleness itself is a warning, not a failure: the report is generated, and
 * failing every unrelated pull request whose diff moves a covered line would make
 * the suite red for work that did not touch coverage. The ratchet on the number
 * belongs to the quality lane, which compares samples across revisions; the floor
 * belongs to the vitest thresholds.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The committed report, at a path the quality lane reads. */
const COMMITTED_PATH = "coverage/coverage-summary.json";
/** Overstatement tolerated, in percentage points, before --compare fails. */
const OVERSTATEMENT_TOLERANCE = 0.5;

/** Line total and per-file paths from an istanbul json-summary report, or null. */
function parseSummary(text) {
  if (!text) return null;
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  const lines = payload?.total?.lines;
  if (!lines || typeof lines.pct !== "number" || typeof lines.total !== "number") {
    return null;
  }
  const files = Object.keys(payload).filter((key) => key !== "total");
  return {
    hit: Number(lines.covered) || 0,
    found: Number(lines.total) || 0,
    pct: lines.pct,
    files,
    absolute: files.filter((key) => key.startsWith("/")),
  };
}

function committedText(reportPath, ref) {
  try {
    return execFileSync("git", ["show", `${ref}:${reportPath}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // Keep git's own diagnostic out of the log: the failure this script
      // reports is "not published on <ref>", and it says exactly that.
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function summarise(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
    } catch {
      /* the step summary is a convenience, never a reason to fail */
    }
  }
}

const args = process.argv.slice(2);
const compare = args.includes("--compare");
const positional = args.filter((arg) => !arg.startsWith("--"));
const reportPath = positional[0] ?? COMMITTED_PATH;
const ref = positional[1] ?? "HEAD";

const text = committedText(reportPath, ref);
if (text === null) {
  console.error(
    `published coverage report is not committed: ${ref}:${reportPath}\n` +
      "run `npm run test:coverage && npm run coverage:publish` and commit the report",
  );
  process.exit(1);
}

const published = parseSummary(text);
if (published === null) {
  console.error(`published coverage report has no line total: ${ref}:${reportPath}`);
  process.exit(1);
}
if (published.absolute.length) {
  console.error(
    `published coverage report carries absolute per-machine paths ` +
      `(${published.absolute.length}, e.g. ${published.absolute[0]})`,
  );
  console.error("run `npm run coverage:publish` and commit the report it writes");
  process.exit(1);
}
summarise(
  `Published line coverage (${ref}:${reportPath}): ${published.pct}% ` +
    `(${published.hit}/${published.found} lines, ${published.files.length} files)`,
);

if (!compare) process.exit(0);

const freshPath = path.resolve(reportPath);
if (!existsSync(freshPath)) {
  console.error(
    `this run's coverage report not found: ${freshPath}\n` +
      "run `npm run test:coverage` first",
  );
  process.exit(1);
}

const fresh = parseSummary(readFileSync(freshPath, "utf8"));
if (fresh === null) {
  console.error(`this run's coverage report has no line total: ${freshPath}`);
  process.exit(1);
}

const delta = Math.round((published.pct - fresh.pct) * 100) / 100;
summarise(
  `This run's line coverage: ${fresh.pct}% (${fresh.hit}/${fresh.found} lines); ` +
    `committed report is ${delta > 0 ? "+" : ""}${delta} pt away`,
);

if (delta > OVERSTATEMENT_TOLERANCE) {
  console.error(
    `published coverage report claims ${published.pct}% but this run measured ` +
      `${fresh.pct}%: a published number may lag the tree, never exceed what the ` +
      "suite produces",
  );
  process.exit(1);
}

if (Math.abs(delta) > 0.005) {
  console.log(
    `::warning::committed ${reportPath} is behind this run (${published.pct}% vs ` +
      `${fresh.pct}%) — refresh it with \`npm run test:coverage && ` +
      "npm run coverage:publish` in the next change that touches covered lines",
  );
}
