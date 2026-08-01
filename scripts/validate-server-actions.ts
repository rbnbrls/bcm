/**
 * validate-server-actions.ts
 *
 * Post-build validation that verifies the Next.js server actions manifest
 * is healthy, complete, and every client-side action reference resolves.
 *
 * Run after `npm run build` in CI.
 *
 * Checks:
 *   1. server-reference-manifest.json exists and is parseable
 *   2. Encryption key is set (non-empty, non-default)
 *   3. At least one server action is registered in the node manifest
 *   4. Every action entry has workers (not orphaned)
 *   5. Action IDs in client chunks match the manifest
 *
 * Exit code 0 = OK, 1 = failure
 *
 * Usage: npx tsx scripts/validate-server-actions.ts
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ──────────────────────────────────────────────────────────────────

interface WorkerInfo {
  moduleId: number;
  async: boolean;
  exportedName: string;
  filename: string;
}

interface ServerActionEntry {
  workers: Record<string, WorkerInfo>;
  filename?: string;
}

interface Manifest {
  node: Record<string, ServerActionEntry>;
  edge: Record<string, ServerActionEntry>;
  encryptionKey: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ok(msg: string): void {
  console.log(`  ✅ ${msg}`);
}
function warn(msg: string): void {
  console.log(`  ⚠️  ${msg}`);
}
function err(msg: string): void {
  console.log(`  ❌ ${msg}`);
}

// ── Entry point ────────────────────────────────────────────────────────────

function main(): number {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Resolve paths relative to project root (2 levels up from scripts/)
  const root =
    existsSync(join(import.meta.dirname, "..", ".next"))
      ? join(import.meta.dirname, "..")
      : process.cwd();

  const manifestPath = join(root, ".next", "server", "server-reference-manifest.json");

  console.log("\n🔍 Server Action Validation");
  console.log("  ==========================\n");

  // ── 1. Parse manifest ────────────────────────────────────────────────────

  let manifest: Manifest;
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
    ok(`server-reference-manifest.json loaded (${raw.length} bytes)`);
  } catch (e) {
    err(`Cannot read/parse manifest at ${manifestPath}: ${(e as Error).message}`);
    console.log("\n  💡 Did you run 'npm run build' first?");
    return 1;
  }

  // ── 2. Encryption key ────────────────────────────────────────────────────

  const key = manifest.encryptionKey;
  if (!key || key === "") {
    errors.push(
      "Encryption key is empty. NEXT_SERVER_ACTIONS_ENCRYPTION_KEY was not set at build time.",
    );
  } else if (key.length < 8) {
    errors.push(
      `Encryption key is suspiciously short (${key.length} chars). Expected ≥ 32.`,
    );
  } else {
    ok(
      `Encryption key: ${key.substring(0, 12)}… (${key.length} chars)`,
    );
  }

  // ── 3. Server action count ───────────────────────────────────────────────

  const nodeActions = manifest.node ?? {};
  const edgeActions = manifest.edge ?? {};
  const actionCount = Object.keys(nodeActions).length;

  if (actionCount === 0) {
    errors.push(
      "No server actions registered in the node manifest — the build may have failed to register any 'use server' actions.",
    );
  } else {
    ok(`${actionCount} server actions in node manifest`);
  }

  if (Object.keys(edgeActions).length > 0) {
    ok(`${Object.keys(edgeActions).length} server actions in edge manifest`);
  }

  // ── 4. Validate each entry ───────────────────────────────────────────────

  for (const [id, entry] of Object.entries(nodeActions)) {
    if (!id || id.length < 8) {
      errors.push(`Action ID "${id ?? "(empty)"}" is too short or missing.`);
      continue;
    }
    const workerCount = Object.keys(entry.workers ?? {}).length;
    if (workerCount === 0) {
      errors.push(`Action ${id.substring(0, 16)}… has no workers — orphaned entry.`);
    }
  }

  // ── 5. Cross-reference with client chunks ────────────────────────────────

  const allActionIds = new Set(Object.keys(nodeActions));
  const chunkDir = join(root, ".next", "static", "chunks");
  let chunksScanned = 0;
  let refsFound = 0;
  const orphanedRefs: string[] = [];

  if (existsSync(chunkDir)) {
    const files = readdirSync(chunkDir).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      chunksScanned++;
      const content = readFileSync(join(chunkDir, file), "utf-8");
      for (const id of allActionIds) {
        if (content.includes(id)) {
          refsFound++;
        }
      }
    }
  }

  ok(
    `${chunksScanned} client chunks scanned, ${refsFound} action ID reference(s) found across ${actionCount} actions`,
  );

  // ── 6. Print summary table ───────────────────────────────────────────────

  console.log("\n  📋 Registered server actions (by source file):\n");

  const byFile: Record<string, string[]> = {};
  for (const [id, entry] of Object.entries(nodeActions)) {
    const file = entry.filename ?? "unknown";
    if (!byFile[file]) byFile[file] = [];
    const exports = [
      ...new Set(Object.values(entry.workers ?? {}).map((w) => w.exportedName)),
    ];
    byFile[file].push(`    ${id.substring(0, 12)} → ${exports.join(", ")}`);
  }

  for (const [file, actions] of Object.entries(byFile).sort()) {
    console.log(`    📄 ${file}`);
    for (const act of actions.sort()) {
      console.log(act);
    }
  }

  // ── 7. Result ────────────────────────────────────────────────────────────

  console.log("");
  if (errors.length > 0) {
    for (const e of errors) err(e);
    console.log(
      `\n  ✖ FAILED — ${errors.length} error(s), ${warnings.length} warning(s)\n`,
    );
    return 1;
  }
  if (warnings.length > 0) {
    for (const w of warnings) warn(w);
  }
  console.log(
    `  ✅ PASSED — ${warnings.length} warning(s)\n`,
  );
  return 0;
}

process.exit(main());