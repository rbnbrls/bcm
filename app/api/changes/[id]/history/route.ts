import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/sentry-helper";
import { getStatusHistory } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/changes/[id]/history
 *
 * Returns the full status transition audit trail for a change request,
 * ordered chronologically.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const history = await getStatusHistory(id);

    return NextResponse.json({ history });
  } catch (error) {
    captureError(error, { route: "/api/changes/[id]/history", method: "GET", phase: "request" });
    return NextResponse.json(
      { error: "Failed to fetch status history." },
      { status: 500 }
    );
  }
}
