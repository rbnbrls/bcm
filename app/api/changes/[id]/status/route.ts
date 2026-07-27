import { NextRequest, NextResponse } from "next/server";
import { updateChangeStatus } from "@/lib/db";
import type { ChangeStatus } from "@/lib/types";
import { CHANGE_STATUS_NEXT } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/changes/[id]/status
 *
 * Transition a change request to the next status.
 * Body (JSON):
 *   - status: the target status to transition to
 *   - userName: optional name of the person performing the action
 *
 * Only forward transitions (next status in the workflow) are allowed.
 * Returns the updated change request with SLA info.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const targetStatus = body.status as ChangeStatus;
    const userName = body.userName as string | undefined;

    if (!targetStatus) {
      return NextResponse.json(
        { error: "Missing required field: status." },
        { status: 400 }
      );
    }

    // Validate the transition is allowed
    const { getChangeRequest } = await import("@/lib/db");
    const current = await getChangeRequest(id);
    if (!current) {
      return NextResponse.json(
        { error: "Change request niet gevonden." },
        { status: 404 }
      );
    }

    const currentStatus = current.status as ChangeStatus;
    const allowedNext = CHANGE_STATUS_NEXT[currentStatus];
    const isBackward = currentStatus === (await import("@/lib/types")).CHANGE_STATUS_PREV[targetStatus as ChangeStatus];

    if (allowedNext !== targetStatus && !isBackward) {
      return NextResponse.json(
        {
          error: `Statusovergang van '${currentStatus}' naar '${targetStatus}' is niet toegestaan.`,
          allowedNext,
        },
        { status: 400 }
      );
    }

    await updateChangeStatus(id, targetStatus, userName);

    let change = { ...current, status: targetStatus };

    // Auto-trigger stakeholder notifications when transitioning to 'submitted'
    if (targetStatus === 'submitted') {
      const { sendChangeNotifications } = await import("@/lib/notifications");
      // Fire-and-forget — don't block the response on notification delivery
      sendChangeNotifications(change as any).catch((e) =>
        console.error(`[notifications] Auto-send failed for ${id}:`, e)
      );
    }

    return NextResponse.json({ success: true, change });
  } catch (error) {
    console.error(`POST /api/changes/[id]/status error:`, error);
    return NextResponse.json(
      { error: "Status update mislukt." },
      { status: 500 }
    );
  }
}
