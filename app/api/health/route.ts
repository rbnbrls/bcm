/**
 * Health check endpoint for Docker HEALTHCHECK and monitoring.
 *
 * Returns the application and database connectivity status without
 * invoking SSR or heavy module imports. Fast and lightweight.
 *
 * Uses a lazy-initialized connection pool (reused across checks) to
 * avoid creating a new TCP connection to PostgreSQL on every health
 * probe — this reduces connection churn from ~12 conns/min to near zero.
 *
 * Behavior by DATABASE_URL state:
 *   - Set + reachable   → 200 { status: "healthy",   db: "connected" }
 *   - Set + unreachable  → 503 { status: "degraded",  db: "error" }
 *   - Set but empty      → 500 { status: "degraded",  db: "misconfigured" }
 *   - Not set (demo)     → 200 { status: "healthy",   db: "disconnected" }
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Module-level connection pool — reused across health checks in standalone
// (long-lived server) mode. On first call we verify connectivity; subsequent
// calls reuse the same pool without opening new connections.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let healthPool: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poolInitPromise: Promise<any> | null = null;

async function getHealthPool() {
  if (healthPool) return healthPool;
  if (poolInitPromise) return poolInitPromise;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

  poolInitPromise = (async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, {
      max: 2,             // Small pool — just for health checks
      max_lifetime: 300,  // Reconnect every 5 minutes to avoid stale connections
      connect_timeout: 3,
    });
    // Verify the pool actually works
    await sql`SELECT 1`;
    healthPool = sql;
    return sql;
  })();

  return poolInitPromise;
}

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      // Check if the variable is literally set (even if empty) vs. unset
      if ("DATABASE_URL" in process.env && dbUrl === "") {
        console.warn("[health] DATABASE_URL is set but empty — possible misconfiguration");
        return NextResponse.json(
          { status: "degraded", timestamp, db: "misconfigured" },
          { status: 500 },
        );
      }
      // No database configured — app works in demo mode with fixture data
      return NextResponse.json({
        status: "healthy",
        timestamp,
        db: "disconnected",
      });
    }

    try {
      const pool = await getHealthPool();
      if (!pool) {
        return NextResponse.json(
          { status: "degraded", timestamp, db: "error" },
          { status: 503 },
        );
      }
      // If the pool connection dropped, getHealthPool will throw on SELECT 1
      await pool`SELECT 1`;

      return NextResponse.json({
        status: "healthy",
        timestamp,
        db: "connected",
      });
    } catch (dbError) {
      // Reset the pool so the next check tries a fresh connection
      if (healthPool) {
        try { await healthPool.end({ timeout: 2 }); } catch (_) {}
        healthPool = null;
        poolInitPromise = null;
      }
      console.error("[health] Database connectivity check failed:", dbError);

      return NextResponse.json(
        {
          status: "degraded",
          timestamp,
          db: "error",
        },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error("[health] Unexpected error in health endpoint:", error);

    return NextResponse.json(
      {
        status: "degraded",
        timestamp,
        db: "error",
      },
      { status: 503 },
    );
  }
}
