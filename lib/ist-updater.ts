/**
 * IST (Internal Status Tracking) Updater
 * ─────────────────────────────────────
 * Automatically updates IST fields in client config records after
 * processing is confirmed by the asset servicer or FactSet.
 *
 * The IST update lifecycle:
 *   1. Processing completion event received (from asset servicer callback
 *      or FactSet webhook feedback).
 *   2. Change request status → "processed".
 *   3. Fields JSONB updated: `istValue` set to the realized value
 *      (typically the `sollValue`, since the target has been achieved).
 *   4. `processed_at` / `processed_by` set on the change request row.
 *   5. Audit log entry recorded.
 *
 * Architecture:
 *   ┌──────────────────────┐     ┌──────────────────────┐
 *   │  Asset Servicer      │     │  FactSet             │
 *   │  (Python webhook)    │     │  (TypeScript webhook)│
 *   └─────┬────────────────┘     └──────┬───────────────┘
 *         │ POST /api/ist-update       │ internal call
 *         ▼                             ▼
 *   ┌────────────────────────────────────────────┐
 *   │         lib/ist-updater.ts                 │
 *   │  (core IST update orchestrator)            │
 *   └────────────────┬───────────────────────────┘
 *                    │ calls
 *                    ▼
 *   ┌────────────────────────────────────────────┐
 *   │              lib/db.ts                     │
 *   │  (updateChangeStatus, updateFields, audit) │
 *   └────────────────────────────────────────────┘
 *
 * @module ist-updater
 */

import {
  getChangeRequest,
  updateChangeStatus,
  updateChangeRequestFields,
  saveFactSetFeedback,
} from "@/lib/db";
import type { ChangeFieldValue } from "@/lib/types";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Default processor name when none is supplied. */
const DEFAULT_PROCESSOR = "system";

/** Status values that indicate processing is complete. */
const COMPLETED_OUTCOMES = ["processed", "completed"] as const;

/** Status values that indicate processing failed. */
const FAILED_OUTCOMES = ["failed", "rejected"] as const;

/** Maximum length for a processor name stored in the DB. */
const MAX_PROCESSOR_LENGTH = 200;

// ── Types ──────────────────────────────────────────────────────────────────────

/** Outcome of processing as reported by the external system. */
export type ProcessingOutcome =
  | "processed"
  | "completed"
  | "partial"
  | "failed"
  | "rejected";

/** Input to the IST updater when a processing completion event fires. */
export interface ISTUpdateInput {
  /** The change request UUID that was processed. */
  changeRequestId: string;

  /**
   * Processing outcome reported by the external system.
   *
   * - `"processed"` / `"completed"` → IST fields updated, status set to "processed".
   * - `"partial"` → IST fields updated (some changes applied), status set to "processed".
   * - `"failed"` / `"rejected"` → No IST field update; status set to "failed".
   */
  outcome: ProcessingOutcome;

  /**
   * Name of the processor that completed the work.
   * This is stored in `processed_by` on the change request.
   * Typical values: `"asset_servicer"`, `"factset"`, or a human name.
   */
  processedBy?: string;

  /**
   * Optional actual processed values keyed by field key.
   *
   * When the external system returns concrete values (e.g. the actual
   * benchmark that was applied, or the real cost), these override the
   * default behaviour of setting `istValue = sollValue`.
   *
   * Example: `{ "current_benchmark_id": "uuid-of-actual-benchmark" }`
   */
  resultData?: Record<string, unknown>;

  /**
   * Optional external reference (e.g. a ticket or job ID from the
   * asset servicer or FactSet).
   */
  externalReference?: string;

  /**
   * Optional message or notes about the processing outcome.
   */
  message?: string;
}

/** Result of an IST update operation. */
export interface ISTUpdateResult {
  /** Whether the update was applied successfully. */
  success: boolean;

  /** The change request ID that was targeted. */
  changeRequestId: string;

  /** The new status after the update. */
  newStatus: string;

  /** Human-readable message about the outcome. */
  message: string;

  /** Number of field values that were updated. */
  fieldsUpdated: number;

  /** Error message if the operation failed. */
  error?: string;
}

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Validate that the input is well-formed before processing.
 */
function validateInput(input: ISTUpdateInput): string | null {
  if (!input.changeRequestId) {
    return "Missing required field: changeRequestId";
  }
  if (!input.outcome) {
    return "Missing required field: outcome";
  }
  if (
    input.processedBy &&
    input.processedBy.length > MAX_PROCESSOR_LENGTH
  ) {
    return `processedBy exceeds maximum length of ${MAX_PROCESSOR_LENGTH} characters`;
  }
  return null;
}

// ── Core IST Update Logic ──────────────────────────────────────────────────────

/**
 * Update IST (Internal Status Tracking) fields after processing is confirmed.
 *
 * This is the central function called by both the asset servicer bridge
 * (via the HTTP API endpoint) and the FactSet webhook handler.
 *
 * Steps:
 * 1. Validate the input.
 * 2. Look up the change request.
 * 3. Determine the new status based on outcome.
 * 4. Update the change request status (which sets processed_at/processed_by).
 * 5. Update the `fields` JSONB column: istValue = sollValue (or resultData override).
 * 6. Record the outcome.
 *
 * @param input - The IST update parameters.
 * @returns A result object describing what was done.
 */
export async function updateISTFields(
  input: ISTUpdateInput,
): Promise<ISTUpdateResult> {
  // ── Step 1: Validate ────────────────────────────────────────────────────
  const validationError = validateInput(input);
  if (validationError) {
    return {
      success: false,
      changeRequestId: input.changeRequestId,
      newStatus: "",
      message: validationError,
      fieldsUpdated: 0,
      error: validationError,
    };
  }

  const processor =
    input.processedBy?.trim() || DEFAULT_PROCESSOR;
  const isCompleted = (
    [...COMPLETED_OUTCOMES, "partial"] as readonly string[]
  ).includes(input.outcome);
  const isFailed = (FAILED_OUTCOMES as readonly string[]).includes(
    input.outcome,
  );

  try {
    // ── Step 2: Look up change request ───────────────────────────────────
    const changeRequest = await getChangeRequest(input.changeRequestId);
    if (!changeRequest) {
      const msg = `Change request ${input.changeRequestId} not found`;
      return {
        success: false,
        changeRequestId: input.changeRequestId,
        newStatus: "",
        message: msg,
        fieldsUpdated: 0,
        error: msg,
      };
    }

    // ── Step 3: Determine new status ───────────────────────────────────
    let newStatus: string;
    if (isCompleted) {
      newStatus = "processed";
    } else if (isFailed) {
      newStatus = "failed";
    } else {
      // Fallback — leave current status unchanged
      newStatus = changeRequest.status;
    }

    // ── Step 4: Update change request status ───────────────────────────
    // updateChangeStatus sets processed_at & processed_by when status is "processed"
    await updateChangeStatus(input.changeRequestId, newStatus as any, processor);

    // ── Step 5: Update IST field values ──────────────────────────────
    let fieldsUpdated = 0;

    if (isCompleted && changeRequest.fields && changeRequest.fields.length > 0) {
      const updatedFields: ChangeFieldValue[] = changeRequest.fields.map(
        (field) => {
          // Use resultData override if provided, otherwise set ist = soll
          const actualValue =
            input.resultData?.[field.fieldKey] ?? field.sollValue;

          // Only count as updated if the value actually changed
          const changed =
            JSON.stringify(field.istValue) !== JSON.stringify(actualValue);
          if (changed) fieldsUpdated++;

          return {
            ...field,
            istValue: actualValue,
          };
        },
      );

      // Persist the updated fields back to the database
      await updateChangeRequestFields(input.changeRequestId, updatedFields);
    }

    // ── Step 6: Return result ──────────────────────────────────────────
    const outcome =
      isCompleted
        ? `IST fields updated — status set to "${newStatus}"`
        : isFailed
          ? `Processing failed — status set to "${newStatus}"`
          : `Unexpected outcome "${input.outcome}" — no IST update applied`;

    const message =
      input.message
        ? `${outcome}. ${input.message}`
        : outcome + (input.externalReference
            ? ` (ref: ${input.externalReference})`
            : "");

    return {
      success: true,
      changeRequestId: input.changeRequestId,
      newStatus,
      message,
      fieldsUpdated,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    console.error(
      `[ist-updater] Failed to update IST for ${input.changeRequestId}: ${errorMsg}`,
    );
    return {
      success: false,
      changeRequestId: input.changeRequestId,
      newStatus: "",
      message: `IST update failed: ${errorMsg}`,
      fieldsUpdated: 0,
      error: errorMsg,
    };
  }
}

// ── Convenience: Save FactSet Feedback + Trigger IST Update ───────────────────

/**
 * Save a FactSet feedback record and trigger IST update if the feedback
 * indicates successful processing.
 *
 * This is a convenience wrapper used by the FactSet webhook handler to
 * combine feedback storage with the IST update in a single operation.
 *
 * @param params - Feedback data plus IST update options.
 * @returns The feedback ID and IST update result.
 */
export async function saveFactSetFeedbackAndUpdateIST(params: {
  id: string;
  submissionId: string;
  changeRequestId: string;
  outcome: string;
  message: string;
  externalReference: string | null;
  rawPayload: string;
  processedAt?: string;
}): Promise<{
  feedbackId: string;
  istUpdate: ISTUpdateResult;
}> {
  // Save the feedback record first
  await saveFactSetFeedback({
    id: params.id,
    submissionId: params.submissionId,
    changeRequestId: params.changeRequestId,
    outcome: params.outcome,
    message: params.message,
    externalReference: params.externalReference,
    rawPayload: params.rawPayload,
  });

  // Trigger IST update if the outcome indicates successful processing
  const istOutcome = mapFeedbackOutcomeToProcessingOutcome(params.outcome);
  const istUpdate = await updateISTFields({
    changeRequestId: params.changeRequestId,
    outcome: istOutcome,
    processedBy: "factset",
    externalReference: params.externalReference ?? undefined,
    message: params.message,
  });

  return {
    feedbackId: params.id,
    istUpdate,
  };
}

/**
 * Map a FactSet feedback outcome string to a ProcessingOutcome.
 */
function mapFeedbackOutcomeToProcessingOutcome(
  outcome: string,
): ProcessingOutcome {
  switch (outcome) {
    case "processed":
    case "completed":
      return "processed";
    case "partial":
      return "partial";
    case "failed":
    case "rejected":
      return "failed";
    default:
      // Unknown outcomes are treated as processed to avoid blocking progress
      console.warn(
        `[ist-updater] Unknown FactSet outcome "${outcome}" — treating as "processed"`,
      );
      return "processed";
  }
}
