/**
 * IST Update API Endpoint
 * ───────────────────────
 * HTTP endpoint that the asset servicer (Python webhook) calls when
 * processing completes, so that IST fields in the client config are
 * updated automatically.
 *
 * Endpoint:  POST /api/ist-update
 * Auth:      Via query param ?token= or X-API-Key header (if IST_API_TOKEN is set)
 *
 * Payload:
 *   {
 *     "changeRequestId": "uuid-of-change-request",
 *     "outcome": "processed" | "completed" | "partial" | "failed" | "rejected",
 *     "processedBy": "asset_servicer",
 *     "resultData": { "fieldKey": "actualValue", ... },
 *     "externalReference": "ticket-or-job-id",
 *     "message": "Optional human-readable note"
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "changeRequestId": "...",
 *     "newStatus": "processed",
 *     "message": "...",
 *     "fieldsUpdated": 3
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { updateISTFields } from "@/lib/ist-updater";
import type { ISTUpdateInput } from "@/lib/ist-updater";

export const dynamic = "force-dynamic";

// ── Authentication ─────────────────────────────────────────────────────────────

/**
 * Optional simple bearer-token authentication for the IST update endpoint.
 *
 * The asset servicer should send the token matching `IST_API_TOKEN`
 * environment variable. If the env var is not set, authentication is
 * skipped (development mode).
 */
function isAuthorized(request: NextRequest): boolean {
  const configuredToken = process.env.IST_API_TOKEN;
  if (!configuredToken) {
    return true; // No token configured — allow all (dev mode)
  }

  // Check query param: ?token=...
  const queryToken = request.nextUrl.searchParams.get("token");
  if (queryToken === configuredToken) {
    return true;
  }

  // Check Authorization header: Bearer ...
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken === configuredToken) {
      return true;
    }
  }

  // Check X-API-Key header
  const apiKey = request.headers.get("x-api-key") || "";
  if (apiKey === configuredToken) {
    return true;
  }

  return false;
}

// ── POST Handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Authorization ──────────────────────────────────────────────────────
  if (!isAuthorized(request)) {
    console.warn(
      `[ist-update-api] Unauthorized request from ${
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
      }`,
    );
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    // ── Parse request body ───────────────────────────────────────────
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    // ── Extract and validate input ──────────────────────────────────
    const input: ISTUpdateInput = {
      changeRequestId: body.changeRequestId,
      outcome: body.outcome,
      processedBy: body.processedBy || "asset_servicer",
      resultData: body.resultData,
      externalReference: body.externalReference,
      message: body.message,
    };

    if (!input.changeRequestId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: changeRequestId" },
        { status: 400 },
      );
    }

    if (!input.outcome) {
      return NextResponse.json(
        { success: false, error: "Missing required field: outcome" },
        { status: 400 },
      );
    }

    // ── Execute IST update ──────────────────────────────────────────
    const result = await updateISTFields(input);

    console.log(
      `[ist-update-api] IST update for ${input.changeRequestId}: ` +
        `success=${result.success} status=${result.newStatus} ` +
        `fieldsUpdated=${result.fieldsUpdated}`,
    );

    // ── Response ────────────────────────────────────────────────────
    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 422 });
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    console.error("[ist-update-api] Unexpected error:", errorMsg);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
