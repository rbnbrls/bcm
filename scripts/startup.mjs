import { execSync } from "child_process";

async function main() {
  if (process.env.DATABASE_URL) {
    console.log("[startup] Running database migration…");
    try {
      await import("./migrate.mjs");
      console.log("[startup] Migration completed successfully.");
    } catch (err) {
      console.error("[startup] Migration failed:", err.message);
      process.exit(1);
    }
  } else {
    console.log("[startup] No DATABASE_URL set — skipping migration (demo mode).");
  }

  console.log("[startup] Starting Next.js server…");
  // Explicitly set HOSTNAME=0.0.0.0 for the child process.
  // Docker auto-sets HOSTNAME to the container ID at runtime, which overrides
  // the Dockerfile ENV instruction, causing Next.js to bind to a non-existent
  // hostname and crash immediately. See: Next.js Docker HOSTNAME bug.
  execSync("node server.js", {
    stdio: "inherit",
    env: { ...process.env, HOSTNAME: "0.0.0.0" },
  });
}

main().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});
