import { NextRequest, NextResponse } from "next/server";
import { getPortfolioById } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * UUID regex pattern for validating portfolio IDs.
 * Accepts any UUID variant (v1-v8, including nil UUID).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/portfolio/[id]
 *
 * Returns the full details of a single portfolio, including its
 * current benchmark, client reference, and name.
 *
 * The `id` parameter must be a valid UUID. Invalid formats
 * (e.g. 'abc', '123') return HTTP 400. Non-existent portfolios
 * return HTTP 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate that id is a proper UUID
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: `Ongeldig portfolio ID formaat: '${id}'. Een UUID wordt verwacht.` },
        { status: 400 }
      );
    }

    const portfolio = await getPortfolioById(id);

    if (!portfolio) {
      return NextResponse.json(
        { error: "Portfolio niet gevonden." },
        { status: 404 }
      );
    }

    return NextResponse.json({ portfolio });
  } catch (error) {
    console.error(`GET /api/portfolio/[id] error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio." },
      { status: 500 }
    );
  }
}
