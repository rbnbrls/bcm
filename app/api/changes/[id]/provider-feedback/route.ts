import { NextRequest, NextResponse } from "next/server";
import { updateChangeStatus } from "@/lib/db";
import type { ChangeStatus } from "@/lib/types";

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
    const userName = body.userName as string;
    const processedDate = body.processedDate as string | undefined;

    if (!userName || !userName.trim()) {
      return NextResponse.json(
        { error: "Vul uw naam in." },
        { status: 400 }
      );
    }

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

    // Validate date format if provided
    if (processedDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(processedDate)) {
        return NextResponse.json(
          { error: "Ongeldige datumnotatie. Gebruik YYYY-MM-DD." },
          { status: 400 }
        );
      }
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
    console.error(`POST /api/changes/[id]/provider-feedback error:`, error);
    return NextResponse.json(
      { error: "Verwerken van de change is mislukt." },
      { status: 500 }
    );
  }
}
