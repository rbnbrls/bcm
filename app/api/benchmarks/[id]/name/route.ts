import { NextResponse } from "next/server";
import { getBenchmarkNameById } from "@/lib/db";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

/**
 * UUID regex pattern for validating benchmark IDs.
 * Accepts any UUID variant (v1-v8, including nil UUID).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/benchmarks/[id]/name
 *
 * Returns the human-readable name and code for a benchmark identified by its
 * UUID. Used by the frontend to resolve opaque database identifiers to
 * meaningful benchmark names (e.g. during benchmark change requests).
 *
 * The `id` parameter must be a valid UUID. Invalid formats return HTTP 400.
 * Non-existent benchmarks return HTTP 404.
 *
 * Responses:
 *   200  { name: string, code: string }  — benchmark found
 *   400  { error: string }              — invalid UUID format
 *   404  { error: string }              — benchmark not found
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate that id is a proper UUID
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: `Ongeldig benchmark ID formaat: '${id}'. Een UUID wordt verwacht.` },
        { status: 400 }
      );
    }

    const result = await getBenchmarkNameById(id);

    if (!result) {
      return NextResponse.json(
        { error: "Benchmark niet gevonden." },
        { status: 404 }
      );
    }

    return NextResponse.json({ name: result.name, code: result.code });
  } catch (error) {
    captureError(error, { route: "/api/benchmarks/[id]/name", method: "GET", phase: "request" });
    return NextResponse.json(
      { error: "Interne serverfout bij het ophalen van de benchmark naam." },
      { status: 500 }
    );
  }
}
