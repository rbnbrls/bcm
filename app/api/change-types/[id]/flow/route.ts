import { NextResponse } from "next/server";
import { getChangeTypeBySlug } from "@/lib/db";
import type { FlowStep } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/change-types/[id]/flow
 *
 * Returns the ordered process flow steps for a change type, identified
 * by its slug (e.g. "benchmark_switch") or UUID.
 *
 * Each step contains:
 *   - stepOrder    — position in the sequence
 *   - stakeholder  — who performs the step
 *   - action       — what action is taken
 *   - leadTime     — expected duration
 *   - description  — detailed explanation
 *
 * Returns 404 when the change type is not found or has no defined process flow.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const changeType = await getChangeTypeBySlug(id);

    if (!changeType) {
      return NextResponse.json(
        { error: "Change type niet gevonden.", id },
        { status: 404 }
      );
    }

    const flow = changeType.processFlow;

    if (!flow || flow.length === 0) {
      return NextResponse.json(
        {
          error: "Geen procesflow gedefinieerd voor dit change type.",
          changeType: { id: changeType.id, slug: changeType.slug, name: changeType.name },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      changeType: {
        id: changeType.id,
        slug: changeType.slug,
        name: changeType.name,
        description: changeType.description,
        defaultLeadDays: changeType.defaultLeadDays,
      },
      flow: flow satisfies FlowStep[],
    });
  } catch (error) {
    console.error(`GET /api/change-types/[...]/flow error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch change type process flow." },
      { status: 500 }
    );
  }
}
