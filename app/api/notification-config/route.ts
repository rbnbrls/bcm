import { NextRequest, NextResponse } from "next/server";
import { getNotificationConfigs, saveNotificationConfig, deleteNotificationConfig } from "@/lib/db";
import { STAKEHOLDERS } from "@/lib/notifications";

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
    const stakeholder = searchParams.get("stakeholder") || undefined;
    const changeRequestId = searchParams.get("change_request_id") || undefined;

    const configs = await getNotificationConfigs({
      stakeholder,
      changeRequestId: changeRequestId ?? null,
    });

    return NextResponse.json({ configs });
  } catch (error) {
    console.error("GET /api/notification-config error:", error);
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
    const { stakeholder, channel, recipient, isActive, changeRequestId } = body;

    if (!stakeholder || !channel || !recipient) {
      return NextResponse.json(
        { error: "Missing required fields: stakeholder, channel, recipient." },
        { status: 400 }
      );
    }

    const validStakeholders = STAKEHOLDERS.map((s) => s.id);
    if (!validStakeholders.includes(stakeholder)) {
      return NextResponse.json(
        { error: `Invalid stakeholder. Must be one of: ${validStakeholders.join(", ")}` },
        { status: 400 }
      );
    }

    if (channel !== "webhook" && channel !== "email") {
      return NextResponse.json(
        { error: 'Channel must be "webhook" or "email".' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    await saveNotificationConfig({
      id,
      stakeholder,
      channel,
      recipient,
      isActive: isActive !== false,
      changeRequestId: changeRequestId || null,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("POST /api/notification-config error:", error);
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
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Missing required query parameter: id." },
        { status: 400 }
      );
    }

    await deleteNotificationConfig(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notification-config error:", error);
    return NextResponse.json(
      { error: "Failed to delete notification config." },
      { status: 500 }
    );
  }
}
