/**
 * Types for FactSet integration — processing submissions & feedback.
 *
 * FactSet is the external financial data vendor that processes benchmark
 * change requests and provides feedback. This module defines the data
 * shapes for the submission/feedback lifecycle.
 */

/**
 * Status of a FactSet submission.
 *
 * - pending  : submitted to FactSet, awaiting response
 * - accepted : FactSet confirmed receipt, processing in progress
 * - rejected : FactSet rejected the submission
 * - completed: FactSet finished processing successfully
 * - error    : a communication or internal error occurred
 */
export type FactSetSubmissionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "completed"
  | "error";

/**
 * A single submission sent to FactSet for processing.
 *
 * Each approved change request generates one submission containing
 * the full change details (changed benchmarks per portfolio) that
 * FactSet needs to update its records.
 */
export type FactSetSubmission = {
  /** Primary key (UUID) */
  id: string;
  /** Change request this submission belongs to */
  changeRequestId: string;
  /** Current processing status */
  status: FactSetSubmissionStatus;
  /** JSON payload that was sent to FactSet */
  requestBody: Record<string, unknown>;
  /** HTTP status code returned by FactSet (if available) */
  responseStatus: number | null;
  /** Response body from FactSet (raw) */
  responseBody: string | null;
  /** Error message if the submission failed */
  errorMessage: string | null;
  /** Number of times this submission was retried */
  retryCount: number;
  /** When the submission was created */
  createdAt: string;
  /** When the status was last updated */
  updatedAt: string;
};

/**
 * Feedback received from FactSet via webhook callback.
 *
 * FactSet sends feedback asynchronously after processing a submission.
 * Each feedback entry contains the processing result, any remarks,
 * and an optional reference to the processed entity.
 */
export type FactSetFeedbackEntry = {
  /** Primary key (UUID) */
  id: string;
  /** Reference to the submission this feedback is for */
  submissionId: string;
  /** Change request this feedback relates to */
  changeRequestId: string;
  /** Processing outcome reported by FactSet ("processed", "failed", "partial") */
  outcome: string;
  /** Descriptive message from FactSet */
  message: string;
  /** Optional FactSet-side reference (e.g. ticket or job ID) */
  externalReference: string | null;
  /** Raw payload as received from FactSet */
  rawPayload: string;
  /** When the feedback was received */
  receivedAt: string;
};

/**
 * Shape of the incoming FactSet webhook payload.
 *
 * FactSet POSTs to this system's webhook endpoint with a JSON body
 * that contains the processing result. This type defines the expected
 * structure for validation.
 */
export type FactSetWebhookPayload = {
  /** Event type — FactSet should send "processing.feedback" */
  event: string;
  /** Unique idempotency key from FactSet */
  idempotency_key?: string;
  /** The processing result */
  data: {
    /** Our submission UUID (echoed back so we can correlate) */
    submission_id?: string;
    /** Our change request UUID */
    change_request_id?: string;
    /** Final outcome: "processed", "failed", "partial" */
    outcome: string;
    /** Human-readable feedback message */
    message?: string;
    /** FactSet-side reference */
    external_reference?: string;
    /** ISO timestamp of when FactSet completed processing */
    processed_at?: string;
  };
};

/**
 * Shape sent to FactSet when submitting a change request.
 */
export type FactSetSubmissionPayload = {
  /** Event type */
  event: "benchmark_change.submitted";
  /** Our unique submission idempotency key */
  submission_id: string;
  /** Our change request reference */
  change_request_reference: string;
  /** Client name / portfolio details */
  data: {
    client: {
      id: string;
      name: string;
      external_reference: string;
    };
    effective_date: string;
    requested_by: string;
    rationale: string;
    changes: Array<{
      portfolio_name: string;
      portfolio_reference: string;
      previous_benchmark: {
        code: string;
        name: string;
      };
      requested_benchmark: {
        code: string;
        name: string;
      };
    }>;
  };
  /** ISO timestamp */
  timestamp: string;
};
