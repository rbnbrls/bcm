/**
 * Seed API Endpoint — Client Config 3NF Schema
 *
 * Thin HTTP wrapper around scripts/seed-client-config.mjs. That script is the
 * single executable seed source used by first-start migration, admin reset and
 * manual CLI seeding.
 *
 * Change-process bypass remains owned by the seed script:
 * SET LOCAL app.change_process_bypass = 'true'
 */
import { NextResponse } from "next/server";
import postgres from "postgres";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

type SeedModule = {
  seedClientConfig: (
    sql: postgres.Sql,
    options?: { silent?: boolean },
  ) => Promise<Record<string, number>>;
};

async function loadSeedModule(): Promise<SeedModule> {
  return import("../../../../scripts/seed-client-config.mjs") as Promise<SeedModule>;
}

export async function POST(request: Request) {
  const apiKey = process.env.SEED_API_KEY;
  if (apiKey) {
    const auth = request.headers.get("x-api-key") || "";
    const url = new URL(request.url);
    const queryKey = url.searchParams.get("key") || "";
    if (auth !== apiKey && queryKey !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL not set — running in demo mode, no database available" },
      { status: 400 },
    );
  }

  const sql = postgres(dbUrl, { max: 2, connect_timeout: 5 });
  try {
    const { seedClientConfig } = await loadSeedModule();
    const summary = await seedClientConfig(sql, { silent: true });
    return NextResponse.json({
      success: true,
      message: "Client config seed completed",
      summary,
    });
  } catch (error) {
    captureError(error, { route: "/api/seed/client-config", method: "POST", phase: "seed" });
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  } finally {
    await sql.end();
  }
}
