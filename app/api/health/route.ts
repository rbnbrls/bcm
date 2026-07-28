/**
 * Health check endpoint for Docker HEALTHCHECK and monitoring.
 *
 * Returns the application and database connectivity status without
 * invoking SSR or heavy module imports. Fast and lightweight.
 *
 * Reuses the main connection pool from @/lib/db instead of creating a
 * separate health check pool — this reduces total database connections
 * by 2, which is significant on a memory-constrained PostgreSQL instance.
 *
 * Behavior by DATABASE_URL state:
 *   - Set + reachable   → 200 { status: "healthy",   db: "connected" }
 *   - Set + unreachable  → 503 { status: "degraded",  db: "error" }
 *   - Set but empty      → 500 { status: "degraded",  db: "misconfigured" }
 *   - Not set (demo)     → 200 { status: "healthy",   db: "disconnected" }
 */

import { NextResponse } from "next/server";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

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
      // Reuse the main connection pool from @/lib/db instead of creating
      // a separate health check pool. This eliminates 2 extra connections
      // to PostgreSQL, reducing memory pressure.
      const { sql } = await import("@/lib/db");
      if (!sql) {
        return NextResponse.json(
          { status: "degraded", timestamp, db: "disconnected" },
          { status: 503 },
        );
      }
      await sql`SELECT 1`;

      return NextResponse.json({
        status: "healthy",
        timestamp,
        db: "connected",
      });
    } catch (dbError) {
      captureError(dbError, { route: "/api/health", method: "GET", endpoint: "db_check" });
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
    captureError(error, { route: "/api/health", method: "GET", phase: "request" });

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
