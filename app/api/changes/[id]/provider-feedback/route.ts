import { NextRequest, NextResponse } from "next/server";
import { updateChangeStatus } from "@/lib/db";
import type { ChangeStatus } from "@/lib/types";
import { providerFeedbackSchema } from "@/lib/schemas";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

/**
 * POST /api/changes/[id]/provider-feedback
 *
 * Service provider endpoint: marks a change as "verwerkt" (processed).
 * The provider submits a processed date and their name.
 *
 * Body (JSON):
 *   - userName (required): name of the service provider who processed the change
 *   - processedDate (optional): YYYY-MM-DD date, defaults to today
 *
 * The change must be in "in_progress" status. On success:
 *   - Status advances to "processed"
 *   - processed_at and processed_by are stored
 *   - IST config is synced (portfolio current_benchmark_id updated)
 *   - Status history is recorded
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = providerFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 }
      );
    }
    const { userName, processedDate } = parsed.data;

    // Validate the change is in the right state
    const { getChangeRequest } = await import("@/lib/db");
    const current = await getChangeRequest(id);
    if (!current) {
      return NextResponse.json(
        { error: "Change request niet gevonden." },
        { status: 404 }
      );
    }

    if (current.status !== "in_progress") {
      return NextResponse.json(
        {
          error: `Deze change heeft status '${current.status}'. Alleen changes met status 'In behandeling' kunnen worden verwerkt.`,
        },
        { status: 400 }
      );
    }

    // Transition to processed with IST sync
    await updateChangeStatus(id, "processed" as ChangeStatus, userName.trim());

    // If a custom date was given, override the processed_at via helper
    if (processedDate) {
      const { setCustomProcessedDate } = await import("@/lib/db");
      await setCustomProcessedDate(id, processedDate);
    }

    // Return the updated change request
    const updated = await getChangeRequest(id);

    return NextResponse.json({
      success: true,
      message: `Change ${current.reference} is gemarkeerd als verwerkt per ${processedDate || "vandaag"}. IST-configuratie is gesynchroniseerd.`,
      change: updated,
    });
  } catch (error) {
    captureError(error, { route: "/api/changes/[id]/provider-feedback", method: "POST", phase: "request" });
    return NextResponse.json(
      { error: "Verwerken van de change is mislukt." },
      { status: 500 }
    );
  }
}
