/**
 * Webhook endpoint for FactSet processing feedback callbacks.
 *
 * FactSet POSTs feedback to this endpoint after processing a submitted
 * benchmark change request. The endpoint:
 *  1. Validates the incoming payload
 *  2. Correlates it with the original submission
 *  3. Stores the feedback in the database
 *  4. Updates the submission status
 *
 * Endpoint:  POST /api/factset-webhook
 * Payload:   JSON  (see FactSetWebhookPayload type)
 * Auth:      X-FactSet-Signature header + shared secret (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveFactSetFeedback } from "@/lib/db";
import { validateWebhookSignature } from "@/lib/factset";
import type { FactSetWebhookPayload } from "@/lib/factset-types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  try {
    // ── Step 1: Read raw body ─────────────────────────────────────────────
    const rawBody = await request.text();

    if (!rawBody || !rawBody.trim()) {
      console.warn(`[factset-webhook] Empty body from ${clientIp}`);
      return NextResponse.json(
        { error: "Empty request body" },
        { status: 400 },
      );
    }

    // ── Step 2: Validate signature (if configured) ─────────────────────────
    const signature = request.headers.get("x-factset-signature");
    if (!validateWebhookSignature(rawBody, signature)) {
      console.warn(`[factset-webhook] Invalid signature from ${clientIp}`);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }

    // ── Step 3: Parse the payload ─────────────────────────────────────────
    let payload: FactSetWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as FactSetWebhookPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 },
      );
    }

    // ── Step 4: Validate required fields ──────────────────────────────────
    if (!payload.event) {
      return NextResponse.json(
        { error: "Missing 'event' field" },
        { status: 400 },
      );
    }

    if (payload.event !== "processing.feedback" && payload.event !== "benchmark_change.feedback") {
      // Unknown event — acknowledge but don't process
      console.log(`[factset-webhook] Ignoring unknown event type: ${payload.event}`);
      return NextResponse.json({ status: "ignored", event: payload.event });
    }

    const data = payload.data;
    if (!data) {
      return NextResponse.json(
        { error: "Missing 'data' field in payload" },
        { status: 400 },
      );
    }

    const changeRequestId = data.change_request_id;
    const submissionId = data.submission_id || "unknown";

    if (!changeRequestId) {
      return NextResponse.json(
        { error: "Missing 'change_request_id' in data" },
        { status: 400 },
      );
    }

    // ── Step 5: Store the feedback ────────────────────────────────────────
    const feedbackId = randomUUID();

    await saveFactSetFeedback({
      id: feedbackId,
      submissionId,
      changeRequestId,
      outcome: data.outcome || "unknown",
      message: data.message || "",
      externalReference: data.external_reference || null,
      rawPayload: rawBody,
    });

    console.log(
      `[factset-webhook] Received feedback for change ${changeRequestId}: ` +
        `outcome="${data.outcome}", ref="${data.external_reference || "none"}"`,
    );

    return NextResponse.json({
      status: "ok",
      feedback_id: feedbackId,
    });
  } catch (error) {
    console.error("[factset-webhook] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
