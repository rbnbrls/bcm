/**
 * Health check endpoint for Docker HEALTHCHECK and monitoring.
 *
 * Returns the application and database connectivity status without
 * invoking SSR or heavy module imports. Fast and lightweight.
 *
 * Behavior by DATABASE_URL state:
 *   - Set + reachable   → 200 { status: "healthy",   db: "connected" }
 *   - Set + unreachable  → 503 { status: "degraded",  db: "error" }
 *   - Set but empty      → 500 { status: "degraded",  db: "misconfigured" }
 *   - Not set (demo)     → 200 { status: "healthy",   db: "disconnected" }
 */

import { NextResponse } from "next/server";

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

    // Dynamic import to avoid bundling postgres into the server component graph
    const { default: postgres } = await import("postgres");

    const sql = postgres(process.env.DATABASE_URL, {
      max: 1,
      connect_timeout: 3,
    });

    try {
      await sql`SELECT 1`;
      await sql.end();

      return NextResponse.json({
        status: "healthy",
        timestamp,
        db: "connected",
      });
    } catch (dbError) {
      await sql.end({ timeout: 2 }).catch(() => {});
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
