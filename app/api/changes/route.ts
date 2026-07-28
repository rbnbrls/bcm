import { NextRequest, NextResponse } from "next/server";
import { getAllChangeRequests, getChangesByStatus } from "@/lib/db";
import { changesListQuerySchema } from "@/lib/schemas";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

/**
 * GET /api/changes
 *
 * Query parameters:
 *   - status: filter by status value (e.g. "submitted", "accepted")
 *   - sla_status: filter by SLA status ("ok", "at_risk", "overdue")
 *
 * Returns an array of change request summaries with SLA information.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams);
    const parsed = changesListQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { status: statusFilter, sla_status: slaStatusFilter } = parsed.data;

    let changes = statusFilter
      ? await getChangesByStatus(statusFilter)
      : await getAllChangeRequests();

    if (slaStatusFilter) {
      changes = changes.filter((c) => c.slaStatus === slaStatusFilter);
    }

    return NextResponse.json({ changes });
  } catch (error) {
    captureError(error, { route: "/api/changes", method: "GET", phase: "request" });
    return NextResponse.json(
      { error: "Failed to fetch changes." },
      { status: 500 }
    );
  }
}
