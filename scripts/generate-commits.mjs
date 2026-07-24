#!/usr/bin/env node
/**
 * Generates public/commits.json from the git log.
 * Runs at build time so the commit history is available in production
 * even without the .git directory.
 */
import { execSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outPath = resolve(root, "public", "commits.json");

try {
  const log = execSync(
    'git log --all --format="%H|%ai|%an|%s" -100',
    { cwd: root, encoding: "utf-8", timeout: 10000 }
  );

  const commits = log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, date, author, ...msgParts] = line.split("|");
      return {
        hash: hash.slice(0, 7),
        fullHash: hash,
        date,
        author,
        message: msgParts.join("|"),
      };
    });

  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(outPath, JSON.stringify(commits, null, 2), "utf-8");
  console.log(`✓ Generated ${outPath} (${commits.length} commits)`);
} catch (err) {
  console.error("⚠ Could not generate commits.json:", err.message);
  // Write empty array so the page can still load
  writeFileSync(outPath, "[]", "utf-8");
}
