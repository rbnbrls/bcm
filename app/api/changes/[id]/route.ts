import { NextRequest, NextResponse } from "next/server";
import { getChangeRequest } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/changes/[id]
 *
 * Returns full change request details including SLA information
 * (daysOpen, slaStatus) and status history.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const changeRequest = await getChangeRequest(id);

    if (!changeRequest) {
      return NextResponse.json(
        { error: "Change request niet gevonden." },
        { status: 404 }
      );
    }

    // Include status history in the response
    const { getStatusHistory } = await import("@/lib/db");
    const statusHistory = await getStatusHistory(id);

    return NextResponse.json({ change: changeRequest, statusHistory });
  } catch (error) {
    console.error(`GET /api/changes/[id] error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch change request." },
      { status: 500 }
    );
  }
}
