import { NextRequest, NextResponse } from "next/server";
import { updateChangeStatus } from "@/lib/db";
import type { ChangeStatus } from "@/lib/types";
import { changeStatusUpdateSchema } from "@/lib/schemas";
import { captureError } from "@/lib/sentry-helper";
import { ACCESS_DENIED_MESSAGES } from "@/lib/rbac";
import { requirePermission } from "@/lib/rbac-request";
import { getChangeTypePermission, getStatusFlowForChangeType } from "@/lib/change-type-registry";

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
    const parsed = changeStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 }
      );
    }
    const { status: targetStatus, userName } = parsed.data;
    // Validate the transition is allowed
    const { getChangeRequest } = await import("@/lib/db");
    const current = await getChangeRequest(id);
    if (!current) {
      return NextResponse.json(
        { error: "Change request niet gevonden." },
        { status: 404 }
      );
    }

    if (targetStatus === "accepted") {
      const permission = getChangeTypePermission(current.changeType, "approve");
      const access = await requirePermission(permission, request);
      if (!access.authorized) {
        return NextResponse.json(
          { error: ACCESS_DENIED_MESSAGES[permission] },
          { status: 403 },
        );
      }
    }

    const currentStatus = current.status as ChangeStatus;
    const statusFlow = getStatusFlowForChangeType(current.changeType);
    const allowedNext = statusFlow[currentStatus];
    const { CHANGE_STATUS_PREV } = await import("@/lib/types");
    const isBackward = currentStatus === CHANGE_STATUS_PREV[targetStatus as ChangeStatus];

    if (allowedNext !== targetStatus && !isBackward) {
      return NextResponse.json(
        {
          error: `Statusovergang van '${currentStatus}' naar '${targetStatus}' is niet toegestaan.`,
          allowedNext,
        },
        { status: 400 }
      );
    }

    const actor = await import("@/lib/identity/request").then(({ getIdentityContext }) => getIdentityContext(request));
    await updateChangeStatus(id, targetStatus as ChangeStatus, actor.displayName || userName);

    let change = { ...current, status: targetStatus };

    // Auto-trigger stakeholder notifications when transitioning to 'submitted'
    if (targetStatus === 'submitted') {
      const { sendChangeNotifications } = await import("@/lib/notifications");
      // Fire-and-forget — don't block the response on notification delivery
      sendChangeNotifications(change as any).catch((e) =>
        captureError(e, { route: "/api/changes/[id]/status", method: "POST", phase: "notification" })
      );
    }

    return NextResponse.json({ success: true, change });
  } catch (error) {
    captureError(error, { route: "/api/changes/[id]/status", method: "POST", phase: "request" });
    return NextResponse.json(
      { error: "Status update mislukt." },
      { status: 500 }
    );
  }
}
