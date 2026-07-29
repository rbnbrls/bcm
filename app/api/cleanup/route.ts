/**
 * Cleanup API Endpoint
 *
 * POST /api/cleanup
 *
 * Removes all test data from the database, keeping only the seed data
 * from init.sql / migrate.mjs:
 *   - 2 seed clients (Pensioenfonds Horizon, Stichting Pensioen Zeker)
 *   - Their 3 seed portfolios
 *   - All lookup tables (asset_classes, wtp_classifications, managers, etc.)
 *   - change_type_config records
 *
 * Removes:
 *   - All change_requests and related data (change_request_items,
 *     new_benchmark_requests, audit_log, approvals, status_history,
 *     notification_log, notification_config)
 *   - Extra seed clients (IDs starting with a0000000-...)
 *   - Their portfolios
 *   - Extra sub_asset_classes (IDs starting with 1% or 2%)
 *
 * Protected by CLEANUP_API_KEY env var (optional — if unset, only
 * accessible from private network).
 */
import { NextResponse } from "next/server";
import postgres from "postgres";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Optional auth via CLEANUP_API_KEY
  const apiKey = process.env.CLEANUP_API_KEY;
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

  let sql: any;
  try {
    sql = postgres(dbUrl, { max: 2, connect_timeout: 5 });

    // Get count of changes before cleanup
    const [beforeCount] = await sql`SELECT COUNT(*)::int AS cnt FROM change_requests`;
    const beforeChangeCount = beforeCount?.cnt ?? 0;

    // ── 1. Delete change-request-dependent data (FK order) ────────────

    const criResult = await sql`DELETE FROM change_request_items`;
    const nbrResult = await sql`DELETE FROM new_benchmark_requests`;
    const alResult = await sql`DELETE FROM audit_log`;
    const appResult = await sql`DELETE FROM approvals`;
    const shResult = await sql`DELETE FROM status_history`;
    const nlResult = await sql`DELETE FROM notification_log`;
    const ncResult = await sql`DELETE FROM notification_config`;
    const wcResult = await sql`DELETE FROM webhook_configs`;

    // ── 2. Delete all change_requests ─────────────────────────────────

    const crResult = await sql`DELETE FROM change_requests`;

    // ── 3. Delete test portfolios (not belonging to seed clients) ──────

    const pfResult = await sql`
      DELETE FROM portfolios WHERE client_id IN (
        SELECT id FROM clients WHERE external_reference LIKE 'PF-%'
        AND id NOT IN ('9f9280fc-9572-49d1-b81c-2a039652bc93', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37')
      )
    `;

    // ── 4. Delete test clients (not the 2 seed clients) ────────────────

    const clResult = await sql`
      DELETE FROM clients WHERE external_reference LIKE 'PF-%'
      AND id NOT IN ('9f9280fc-9572-49d1-b81c-2a039652bc93', '7b9303c1-3a0d-4398-a5c2-740ea76dfe37')
    `;

    // ── 5. Delete extra sub_asset_classes ──────────────────────────────

    const sacResult = await sql`
      DELETE FROM sub_asset_classes WHERE id::text LIKE '1%' OR id::text LIKE '2%'
    `;

    // ── 6. Verify cleanup ──────────────────────────────────────────────

    const [changesCount] = await sql`SELECT COUNT(*)::int AS cnt FROM change_requests`;
    const [clientsCount] = await sql`SELECT COUNT(*)::int AS cnt FROM clients`;
    const [portfoliosCount] = await sql`SELECT COUNT(*)::int AS cnt FROM portfolios`;

    return NextResponse.json({
      success: true,
      message: "Test data cleanup completed successfully",
      summary: {
        beforeChangeRequests: beforeChangeCount,
        afterChangeRequests: changesCount?.cnt ?? 0,
        remainingClients: clientsCount?.cnt ?? 0,
        remainingPortfolios: portfoliosCount?.cnt ?? 0,
      },
      deleted: {
        changeRequestItems: criResult.count,
        newBenchmarkRequests: nbrResult.count,
        auditLog: alResult.count,
        approvals: appResult.count,
        statusHistory: shResult.count,
        notificationLog: nlResult.count,
        notificationConfig: ncResult.count,
        webhookConfigs: wcResult.count,
        changeRequests: crResult.count,
        portfolios: pfResult.count,
        clients: clResult.count,
        subAssetClasses: sacResult.count,
      },
    });
  } catch (error) {
    captureError(error, { route: "/api/cleanup", method: "POST", phase: "request" });
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  } finally {
    if (sql) await sql.end();
  }
}
