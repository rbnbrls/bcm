import { execSync } from "child_process";
import { writeFileSync } from "fs";

const LOG = "/tmp/startup.log";
function log(...args) {
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  writeFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`, { flag: "a" });
  console.log(msg);
}

function startServer() {
  log("[startup] Starting Next.js server…");
  try {
    execSync("node server.js", {
      stdio: "inherit",
      env: { ...process.env, HOSTNAME: "0.0.0.0" },
    });
    // execSync only returns if the child exits
    log("[startup] Next.js server exited normally (code 0).");
  } catch (err) {
    const msg = `[startup] Next.js server crashed (code: ${err.status || "unknown"}): ${err.message}`;
    log(msg);
    console.error(msg);
    // Auto-restart with a delay instead of exiting the container.
    // This prevents Docker/Coolify from seeing a restart loop while
    // giving the crash reason time to be logged and observed.
    log("[startup] Restarting Next.js server in 3s…");
    try {
      execSync("sleep 3", { stdio: "inherit" });
    } catch (_) {
      // sleep shouldn't fail, but ignore if it does
    }
    startServer(); // recursive — crashes become internal restarts
  }
}

async function main() {
  log("[startup] Environment:", JSON.stringify(process.env, (k, v) =>
    /token|password|secret|key/i.test(k) ? "***" : v
  ));
  if (process.env.DATABASE_URL) {
    log("[startup] Running database migration…");
    try {
      await import("./migrate.mjs");
      log("[startup] Migration completed successfully.");
    } catch (err) {
      // Log the full error but don't crash — the app may still work
      // in a degraded state (e.g. demo mode with in-memory fixtures).
      log("[startup] Migration failed (non-fatal):", err.stack || err.message);
      console.error("[startup] Migration failed (non-fatal):", err.stack || err.message);
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
