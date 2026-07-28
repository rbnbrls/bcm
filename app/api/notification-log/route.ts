import { NextRequest, NextResponse } from "next/server";
import { getNotificationLog } from "@/lib/db";
import { notificationLogQuerySchema } from "@/lib/schemas";
import { captureError } from "@/lib/sentry-helper";

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
    const query = Object.fromEntries(searchParams);
    const parsed = notificationLogQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const log = await getNotificationLog(parsed.data.change_request_id);
    return NextResponse.json({ log });
  } catch (error) {
    captureError(error, { route: "/api/notification-log", method: "GET", phase: "request" });
    return NextResponse.json(
      { error: "Failed to fetch notification log." },
      { status: 500 }
    );
  }
}
