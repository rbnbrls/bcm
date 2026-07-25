/**
 * Health check endpoint for Docker HEALTHCHECK and monitoring.
 *
 * Returns the application and database connectivity status without
 * invoking SSR or heavy module imports. Fast and lightweight.
 *
 * Behavior by DATABASE_URL state:
 *   - Set + reachable   → 200 { status: "healthy",   db: "connected" }
 *   - Set + unreachable  → 503 { status: "degraded",  db: "error" }
 *   - Not set (demo)     → 200 { status: "healthy",   db: "disconnected" }
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    if (!process.env.DATABASE_URL) {
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
