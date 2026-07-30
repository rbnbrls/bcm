import { spawn } from "child_process";
import { writeFileSync } from "fs";

const LOG = "/tmp/startup.log";
function log(...args) {
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  writeFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`, { flag: "a" });
  console.log(msg);
}

let childProcess = null;

// Graceful shutdown — forward SIGTERM/SIGINT to Next.js child process
// Without this, startup.mjs (PID 1) is killed immediately by docker stop,
// leaving the Next.js server orphaned.
function shutdown(signal) {
  log(`[startup] Received ${signal}, shutting down gracefully…`);
  if (childProcess) {
    childProcess.kill(signal);
    // Give the child a moment to finish its current request, then exit
    setTimeout(() => process.exit(0), 5000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

function startServer() {
  log("[startup] Starting Next.js server…");

  childProcess = spawn("node", ["server.js"], {
    stdio: "inherit",
    env: { ...process.env, HOSTNAME: "0.0.0.0" },
  });

  childProcess.on("exit", (code, signal) => {
    childProcess = null;
    if (signal) {
      log(`[startup] Next.js server was killed by signal ${signal}. Exiting.`);
      // A kill signal means we're shutting down (from shutdown() above or
      // from Docker stopping the container). Don't restart — just exit.
      process.exit(0);
    } else if (code === 0) {
      log("[startup] Next.js server exited normally (code 0). Exiting.");
      process.exit(0);
    } else {
      const msg = `[startup] Next.js server crashed (code: ${code}), restarting in 3s…`;
      log(msg);
      console.error(msg);
      // Auto-restart with a delay instead of exiting the container.
      // This prevents Docker/Coolify from seeing a restart loop while
      // giving the crash reason time to be logged and observed.
      setTimeout(startServer, 3000);
    }
  });

  childProcess.on("error", (err) => {
    childProcess = null;
    log(`[startup] Failed to spawn Next.js server: ${err.message}`);
    setTimeout(startServer, 3000);
  });
}

async function main() {
  log("[startup] Environment:", JSON.stringify(process.env, (k, v) =>
    /token|password|secret|key/i.test(k) ? "***" : v
  ));
  if (process.env.DATABASE_URL) {
    // Retry the migration up to 3 times before giving up.
    // The migrate.mjs itself retries individual DDL statements,
    // so this is an outer retry for connection-level issues.
    let migrated = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      log(`[startup] Running database migration (attempt ${attempt}/3)…`);
      try {
        await import("./migrate.mjs");
        log("[startup] Migration completed successfully.");
        // Run the fix for canonical change type config IDs. This ensures that
        // legacy records (auto-created with random UUIDs) get their IDs
        // overwritten with the canonical UUIDs via ON CONFLICT (slug) DO UPDATE.
        try {
          await import("./fix-change-type-config-ids.mjs");
          log("[startup] Change type config ID fix completed.");
        } catch (fixErr) {
          log(
            "[startup] Change type config ID fix warning:",
            fixErr.message || fixErr
          );
          console.warn(
            "[startup] Change type config ID fix warning (non-fatal):",
            fixErr.message || fixErr
          );
        }
        migrated = true;
        break;
      } catch (err) {
        const delayMs = 5000 * attempt;
        log(
          `[startup] Migration failed (attempt ${attempt}/3):`,
          err.stack || err.message
        );
        console.error(
          `[startup] Migration failed (attempt ${attempt}/3):`,
          err.stack || err.message
        );
        if (attempt < 3) {
          log(`[startup] Retrying migration in ${delayMs / 1000}s…`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    if (!migrated) {
      log(
        "[startup] Migration FAILED after 3 attempts — the app may start but database features will not work."
      );
      console.error(
        "[startup] Migration FAILED after 3 attempts — the app may start but database features will not work."
      );
    }
  } else {
    log("[startup] No DATABASE_URL set — skipping migration (demo mode).");
  }

  startServer();
}

main().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});
