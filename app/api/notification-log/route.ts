import { NextRequest, NextResponse } from "next/server";
import { getNotificationLog } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/notification-log?change_request_id=...
 *
 * Returns delivery log entries for a specific change request,
 * ordered by most recent first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const changeRequestId = searchParams.get("change_request_id");

    if (!changeRequestId) {
      return NextResponse.json(
        { error: "Missing required query parameter: change_request_id." },
        { status: 400 }
      );
    }

    const log = await getNotificationLog(changeRequestId);
    return NextResponse.json({ log });
  } catch (error) {
    console.error("GET /api/notification-log error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notification log." },
      { status: 500 }
    );
  }
}
