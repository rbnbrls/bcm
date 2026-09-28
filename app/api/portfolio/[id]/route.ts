import { NextResponse } from "next/server";
import { getPortfolioById, updatePortfolioAssetClassFields } from "@/lib/db";
import { validatePortfolioFields } from "@/lib/portfolio-validation";
import { portfolioUpdateSchema } from "@/lib/schemas";
import { captureError } from "@/lib/sentry-helper";

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
  _request: Request,
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
    captureError(error, { route: "/api/portfolio/[id]", method: "GET", phase: "request" });
    return NextResponse.json(
      { error: "Failed to fetch portfolio." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/portfolio/[id]
 *
 * Updates a portfolio's assetClass and/or subAssetClass fields.
 * Both body fields are optional — only provided fields are validated and saved.
 *
 * Request body (JSON):
 *   { assetClass?: string, subAssetClass?: string }
 *
 * Validation:
 *   - assetClass must be a known key (CASH, EQUITIES, …)
 *   - subAssetClass must be a valid sub-class for the (new or existing) assetClass
 *   - If assetClass changes and current subAssetClass becomes invalid, it's cleared
 *
 * Responses:
 *   200  { success: true }
 *   400  { error: "..." }    — invalid input or validation failure
 *   404  { error: "..." }    — portfolio not found
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Validate UUID
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: `Ongeldig portfolio ID formaat: '${id}'.` },
        { status: 400 },
      );
    }

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Ongeldige JSON in request body." },
        { status: 400 },
      );
    }

    const parsed = portfolioUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const assetClass = parsed.data.assetClass?.trim();
    const subAssetClass = parsed.data.subAssetClass?.trim();

    if (assetClass === undefined && subAssetClass === undefined) {
      return NextResponse.json(
        { error: "Geen wijzigingen aangeleverd. Stuur assetClass en/of subAssetClass." },
        { status: 400 },
      );
    }

    // Fetch current portfolio to validate against existing values
    const portfolio = await getPortfolioById(id);
    if (!portfolio) {
      return NextResponse.json(
        { error: "Portfolio niet gevonden." },
        { status: 404 },
      );
    }

    const currentAssetClass = assetClass ?? portfolio.assetClass;
    const currentSubAssetClass = subAssetClass ?? portfolio.subAssetClass;

    // Validate the pair
    const errors = validatePortfolioFields({
      assetClass: currentAssetClass,
      subAssetClass: currentSubAssetClass || undefined,
    });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }

    // Save
    const dbFields: { assetClass?: string; subAssetClass?: string } = {};
    if (assetClass !== undefined) dbFields.assetClass = currentAssetClass;
    if (subAssetClass !== undefined) dbFields.subAssetClass = currentSubAssetClass;

    await updatePortfolioAssetClassFields(id, dbFields);

    return NextResponse.json({ success: true });
  } catch (error) {
    captureError(error, { route: "/api/portfolio/[id]", method: "PATCH", phase: "request" });
    return NextResponse.json(
      { error: "Interne serverfout." },
      { status: 500 },
    );
  }
}
