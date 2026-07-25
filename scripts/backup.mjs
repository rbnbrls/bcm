#!/usr/bin/env node
/**
 * PostgreSQL backup script — pg_dump wrapper with compression and retention.
 *
 * USAGE
 *   node scripts/backup.mjs              # Run backup
 *   node scripts/backup.mjs --dry-run    # Show what would be done
 *   node scripts/backup.mjs --help       # Show this help
 *
 * ENVIRONMENT VARIABLES
 *   DATABASE_URL          (required)  PostgreSQL connection string
 *   BACKUP_DIR            (optional)  Output directory, default: /backups
 *   BACKUP_RETENTION_DAYS (optional)  Remove backups older than N days, default: 7
 *
 * SCHEDULING
 *   Automated (docker-compose):
 *     The backup service in docker-compose.yml / docker-compose.yaml runs
 *     this script daily at 3 AM via cron inside a postgres:17-alpine container.
 *
 *   Manual (one-liner):
 *     docker compose exec db pg_dump --dbname="$DATABASE_URL" \
 *       --no-owner --clean --if-exists --no-privileges \
 *       --format=custom --compress=9 \
 *       -f /backups/bcm-$(date +%Y-%m-%d-%H%M%S).dump
 *
 *   Coolify scheduled task:
 *     Coolify can run `node scripts/backup.mjs` as a scheduled task with
 *     the DATABASE_URL env var configured on the service.
 *
 * RESTORE
 *   pg_restore --dbname="$DATABASE_URL" --clean --if-exists \
 *     /backups/bcm-<timestamp>.dump
 *
 *   Or with docker-compose:
 *     docker compose exec -T db pg_restore --dbname="$DATABASE_URL" \
 *       --clean --if-exists < /backups/bcm-<timestamp>.dump
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";

function help() {
  console.log(`
Usage: node scripts/backup.mjs [options]

Options:
  --dry-run   Show what would be done without executing pg_dump
  --help      Show this help

Environment:
  DATABASE_URL           PostgreSQL connection string (required)
  BACKUP_DIR             Output directory (default: /backups)
  BACKUP_RETENTION_DAYS  Remove backups older than N days (default: 7)
`);
  process.exit(0);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { dryRun: false };

  for (const arg of args) {
    if (arg === "--help") help();
    if (arg === "--dry-run") flags.dryRun = true;
  }

  return flags;
}

function log(...args) {
  console.log("[backup]", ...args);
}

function error(...args) {
  console.error("[backup] ERROR:", ...args);
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function applyRetention(backupDir, retentionDays) {
  if (retentionDays <= 0) {
    log(`Retention disabled (BACKUP_RETENTION_DAYS=${retentionDays}).`);
    return;
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  if (!existsSync(backupDir)) {
    log(`Backup directory does not exist: ${backupDir}`);
    return;
  }

  const files = readdirSync(backupDir);
  const backupFiles = files.filter(
    (f) => f.startsWith("bcm-") && f.endsWith(".dump"),
  );

  let removed = 0;
  for (const file of backupFiles) {
    const filePath = join(backupDir, file);
    try {
      const stats = statSync(filePath);
      if (stats.mtimeMs < cutoff) {
        unlinkSync(filePath);
        log(`Removed old backup: ${file}`);
        removed++;
      }
    } catch (err) {
      error(`Could not process ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (removed === 0) {
    log(`No backups older than ${retentionDays} days to remove.`);
  } else {
    log(`Retention cleanup: removed ${removed} old backup(s).`);
  }
}

function main() {
  const flags = parseArgs();
  const { dryRun } = flags;

  // Validate DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  // Parse connection string for display
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    error(`Invalid DATABASE_URL: ${databaseUrl}`);
    process.exit(1);
  }

  const backupDir = process.env.BACKUP_DIR || "/backups";
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || "7", 10) || 7;

  // Ensure backup directory exists
  if (!existsSync(backupDir)) {
    if (dryRun) {
      log(`DRY RUN: Would create backup directory: ${backupDir}`);
    } else {
      mkdirSync(backupDir, { recursive: true });
      log(`Created backup directory: ${backupDir}`);
    }
  }

  // Generate output filename
  const timestamp = formatTimestamp(new Date());
  const outputPath = join(backupDir, `bcm-${timestamp}.dump`);

  // Build pg_dump command — use --dbname=connection_string for safety
  // (handles URL-encoded characters correctly without shell injection risk)
  const pgDumpArgs = [
    `--dbname=${databaseUrl}`,
    "--no-owner",
    "--clean",
    "--if-exists",
    "--no-privileges",
    "--format=custom",
    "--compress=9",
    `--file=${outputPath}`,
  ];

  if (dryRun) {
    log(`DRY RUN — would execute:`);
    log(`  pg_dump ${pgDumpArgs.join(" \\\n    ")}`);
    log(`DRY RUN — would enforce retention (${retentionDays} days) on: ${backupDir}`);
    process.exit(0);
  }

  // Execute pg_dump
  log(`Starting backup of "${parsed.hostname}:${parsed.port || 5432}/${parsed.pathname.slice(1)}"...`);
  log(`Output: ${outputPath}`);

  try {
    execFileSync("pg_dump", pgDumpArgs, {
      stdio: "inherit",
      timeout: 300_000, // 5 minutes max
    });

    log(`Backup completed successfully: ${outputPath}`);

    // Enforce retention
    applyRetention(backupDir, retentionDays);

    process.exit(0);
  } catch (err) {
    error(`Backup failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
