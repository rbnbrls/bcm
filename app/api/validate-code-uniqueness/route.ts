import { NextRequest, NextResponse } from "next/server";
import { checkCodeUniqueness } from "@/lib/client-config-db";
import { CLIENT_CODE_PATTERN, PORTFOLIO_CODE_PATTERN } from "@/lib/validation-rules";
import { captureError } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

/**
 * GET /api/validate-code-uniqueness?clientCode=HOR&portfolioCode=HOR-RP
 *
 * Verifies that a client code and/or portfolio code are not already in use,
 * so the onboarding wizard can show inline validation errors before the user
 * submits the change request.
 *
 * Query parameters (at least one required):
 *   - clientCode   — 1-3 uppercase alphanumeric chars (client_config.client.client_code)
 *   - portfolioCode — 2-15 uppercase alphanumeric chars (client_config.portfolio.portfolio_code)
 *
 * Responses:
 *   200  { clientCodeTaken, portfolioCodeTaken, clientCodeMessage, portfolioCodeMessage }
 *   400  { error } — no codes supplied, or a code fails its format pattern
 *   500  { error } — unexpected server error
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientCode = (searchParams.get("clientCode") ?? "").trim().toUpperCase();
    const portfolioCode = (searchParams.get("portfolioCode") ?? "").trim().toUpperCase();

    if (!clientCode && !portfolioCode) {
      return NextResponse.json(
        { error: "Geef minimaal clientCode of portfolioCode op." },
        { status: 400 }
      );
    }

    if (clientCode && !CLIENT_CODE_PATTERN.test(clientCode)) {
      return NextResponse.json(
        { error: `Ongeldige klantcode '${clientCode}'. 1-3 hoofdletters of cijfers worden verwacht.` },
        { status: 400 }
      );
    }
    if (portfolioCode && !PORTFOLIO_CODE_PATTERN.test(portfolioCode)) {
      return NextResponse.json(
        { error: `Ongeldige portfoliocode '${portfolioCode}'. 2-15 hoofdletters of cijfers worden verwacht.` },
        { status: 400 }
      );
    }

    const result = await checkCodeUniqueness({
      clientCode: clientCode || undefined,
      portfolioCode: portfolioCode || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    captureError(error, { route: "/api/validate-code-uniqueness", method: "GET", phase: "request" });
    return NextResponse.json(
      { error: "Interne serverfout bij het controleren van code-beschikbaarheid." },
      { status: 500 }
    );
  }
}
