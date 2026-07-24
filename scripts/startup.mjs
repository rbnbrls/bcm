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
  execSync("node server.js", { stdio: "inherit" });
}

main().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});
