/**
 * FactSet API client — submit change requests & process webhook feedback.
 *
 * This module handles communication with FactSet's processing endpoint:
 *  - Builds the submission payload from a change request
 *  - Sends it to FactSet via HTTP POST
 *  - Handles retries, errors, and response parsing
 *  - Logs the result in the database
 *
 * Configuration (environment variables):
 *   FACTSET_API_URL      — FactSet processing endpoint URL
 *   FACTSET_API_KEY      — API key for authentication
 *   FACTSET_WEBHOOK_URL  — Public URL where FactSet sends feedback callbacks
 */

import { randomUUID } from "crypto";
import { createFactSetSubmission, updateFactSetSubmission, getChangeRequest } from "@/lib/db";
import type { FactSetSubmissionPayload } from "@/lib/factset-types";

// ── Configuration ────────────────────────────────────────────────────────────

const FACTSET_API_URL = process.env.FACTSET_API_URL || "";
const FACTSET_API_KEY = process.env.FACTSET_API_KEY || "";
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "BCM-FactSet-Integration/1.0",
  };
  if (FACTSET_API_KEY) {
    headers["X-API-Key"] = FACTSET_API_KEY;
    headers["Authorization"] = `Bearer ${FACTSET_API_KEY}`;
  }
  return headers;
}

/**
 * Build the submission payload for a change request.
 */
export async function buildSubmissionPayload(
  changeRequestId: string,
): Promise<FactSetSubmissionPayload | null> {
  const change = await getChangeRequest(changeRequestId);
  if (!change) return null;

  return {
    event: "benchmark_change.submitted",
    submission_id: randomUUID(),
    change_request_reference: change.reference,
    data: {
      client: {
        id: change.clientId,
        name: change.clientName,
        external_reference: change.clientReference,
      },
      effective_date: change.effectiveDate,
      requested_by: change.requestedBy,
      rationale: change.rationale,
      changes: change.items.map((item) => ({
        portfolio_name: item.portfolioName,
        portfolio_reference: item.portfolioReference,
        previous_benchmark: {
          code: item.previousBenchmark.code,
          name: item.previousBenchmark.name,
        },
        requested_benchmark: {
          code: item.requestedBenchmark.code,
          name: item.requestedBenchmark.name,
        },
      })),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Submit a change request to FactSet for processing.
 *
 * Steps:
 *  1. Build the payload from the change request data.
 *  2. Save a pending submission record in the database.
 *  3. POST the payload to FactSet's API endpoint.
 *  4. Update the submission record with the result.
 *  5. Retry on transient errors up to MAX_RETRIES times.
 *
 * Returns the submission ID on success or throws on terminal failure.
 */
export async function submitChangeToFactSet(
  changeRequestId: string,
): Promise<{ submissionId: string; success: boolean }> {
  if (!FACTSET_API_URL) {
    console.warn("[factset] FACTSET_API_URL not configured — skipping submission.");
    return { submissionId: "", success: false };
  }

  // 1. Build the payload
  const payload = await buildSubmissionPayload(changeRequestId);
  if (!payload) {
    throw new Error(`Change request ${changeRequestId} not found — cannot submit to FactSet.`);
  }

  const submissionId = payload.submission_id;
  const requestBody = { ...payload } as Record<string, unknown>;

  // 2. Create a pending submission record
  try {
    await createFactSetSubmission({
      id: submissionId,
      changeRequestId,
      requestBody,
    });
  } catch (err) {
    console.error("[factset] Failed to save submission record:", err);
    // Continue — the database might be unavailable, but we should still try the API call
  }

  // 3. POST to FactSet with retries
  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(FACTSET_API_URL, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();

      // Update the submission record with the response
      try {
        await updateFactSetSubmission(submissionId, {
          responseStatus: response.status,
          responseBody: responseText.slice(0, 10_000), // keep reasonable size
          status: response.ok ? "accepted" : "rejected",
          retryCount: retries,
        });
      } catch (dbErr) {
        console.error("[factset] Failed to update submission record:", dbErr);
      }

      if (response.ok) {
        console.log(
          `[factset] Submission ${submissionId} accepted by FactSet (HTTP ${response.status})`,
        );
        return { submissionId, success: true };
      }

      // Non-2xx — treat as terminal unless it's a 5xx (server error, retriable)
      lastError = new Error(`FactSet API returned HTTP ${response.status}: ${responseText.slice(0, 500)}`);
      if (response.status < 500) {
        // 4xx errors are terminal — don't retry
        await updateFactSetSubmission(submissionId, {
          status: "rejected",
          errorMessage: lastError.message,
          retryCount: retries,
        }).catch((dbErr) => {
          console.error("[factset] Failed to update terminal rejection:", dbErr);
        });
        throw lastError;
      }
      // 5xx — retry
      retries++;
    } catch (err: any) {
      lastError = err;

      if (err.name === "AbortError") {
        console.warn(`[factset] Submission ${submissionId} timed out (attempt ${attempt}/${MAX_RETRIES})`);
      } else {
        console.warn(`[factset] Submission ${submissionId} failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
      }

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  const errorMsg = lastError?.message || "Max retries exceeded — FactSet API unreachable";
  try {
    await updateFactSetSubmission(submissionId, {
      status: "error",
      errorMessage: errorMsg,
      retryCount: retries,
    });
  } catch (dbErr) {
    console.error("[factset] Failed to update submission error status:", dbErr);
  }

  console.error(`[factset] Submission ${submissionId} failed after ${retries} retries: ${errorMsg}`);
  throw new Error(errorMsg);
}

/**
 * Validate an incoming FactSet webhook signature.
 *
 * FactSet should include a signature header (X-FactSet-Signature or similar)
 * that we can verify against our shared secret. The exact mechanism depends
 * on the FactSet integration setup.
 *
 * Returns true if the signature is valid or if no secret is configured.
 */
export function validateWebhookSignature(
  _payload: string,
  _signatureHeader: string | null,
): boolean {
  // If no secret is configured, skip validation (lenient mode for development)
  const secret = process.env.FACTSET_WEBHOOK_SECRET;
  if (!secret) return true;

  // TODO: Implement HMAC signature verification once FactSet's
  //       webhook signing mechanism is confirmed.
  // Typical approaches:
  //   - HMAC-SHA256 of the raw body with the shared secret
  //   - Compare against X-FactSet-Signature header
  // For now, warn and accept.
  console.warn("[factset] Webhook signature validation not yet implemented — accepting without verification.");
  return true;
}

/**
 * Check whether FactSet integration is configured and available.
 */
export function isFactSetConfigured(): boolean {
  return !!(process.env.FACTSET_API_URL && process.env.FACTSET_API_KEY);
}
