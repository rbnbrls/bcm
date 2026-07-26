import { NextRequest, NextResponse } from "next/server";
import { getAllChangeRequests, getChangesByStatus } from "@/lib/db";
import type { SlaStatus } from "@/lib/types";

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
    const statusFilter = searchParams.get("status");
    const slaStatusFilter = searchParams.get("sla_status");

    let changes = statusFilter
      ? await getChangesByStatus(statusFilter)
      : await getAllChangeRequests();

    if (slaStatusFilter) {
      changes = changes.filter((c) => c.slaStatus === slaStatusFilter);
    }

    return NextResponse.json({ changes });
  } catch (error) {
    console.error("GET /api/changes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch changes." },
      { status: 500 }
    );
  }
}
