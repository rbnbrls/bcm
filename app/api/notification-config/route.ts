import { NextRequest, NextResponse } from "next/server";
import { getNotificationConfigs, saveNotificationConfig, deleteNotificationConfig } from "@/lib/db";
import { notificationConfigCreateSchema, notificationConfigDeleteQuerySchema, notificationConfigQuerySchema } from "@/lib/schemas";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

/**
 * GET /api/notification-config
 *
 * Query parameters:
 *   - stakeholder: filter by stakeholder id (e.g. "eigen_administratie")
 *   - change_request_id: filter by change request id for per-change config
 *
 * Returns an array of notification configuration entries.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams);
    const parsed = notificationConfigQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const configs = await getNotificationConfigs({
      stakeholder: parsed.data.stakeholder,
      changeRequestId: parsed.data.change_request_id ?? null,
    });

    return NextResponse.json({ configs });
  } catch (error) {
    captureError(error, { route: "/api/notification-config", method: "GET", phase: "request" });
    return NextResponse.json(
      { error: "Failed to fetch notification configs." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notification-config
 *
 * Create or update a notification configuration entry.
 * Body (JSON):
 *   - stakeholder: stakeholder id (e.g. "eigen_administratie")
 *   - channel: "webhook" or "email"
 *   - recipient: webhook URL or email address
 *   - isActive: optional boolean (default true)
 *   - changeRequestId: optional UUID for per-change config (omitted for app-wide)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = notificationConfigCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { stakeholder, channel, recipient, isActive, changeRequestId } = parsed.data;
    const id = crypto.randomUUID();
    await saveNotificationConfig({
      id,
      stakeholder,
      channel,
      recipient,
      isActive,
      changeRequestId: changeRequestId || null,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    captureError(error, { route: "/api/notification-config", method: "POST", phase: "request" });
    return NextResponse.json(
      { error: "Failed to save notification config." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notification-config?id=...
 *
 * Delete a notification configuration entry by ID.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams);
    const parsed = notificationConfigDeleteQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameter", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    await deleteNotificationConfig(parsed.data.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { route: "/api/notification-config", method: "DELETE", phase: "request" });
    return NextResponse.json(
      { error: "Failed to delete notification config." },
      { status: 500 }
    );
  }
}
