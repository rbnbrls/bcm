/**
 * Tests for the IST Updater module (lib/ist-updater.ts).
 *
 * Covers the core IST update logic — validation, change request status
 * updates, field value propagation, error handling, and the FactSet
 * feedback + IST update convenience wrapper.
 *
 * All tests mock the database layer so they run without a real PostgreSQL
 * connection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock the database module ─────────────────────────────────────────────────

const mockGetChangeRequest = vi.fn();
const mockUpdateChangeStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateChangeRequestFields = vi.fn().mockResolvedValue(undefined);
const mockSaveFactSetFeedback = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  getChangeRequest: mockGetChangeRequest,
  updateChangeStatus: mockUpdateChangeStatus,
  updateChangeRequestFields: mockUpdateChangeRequestFields,
  saveFactSetFeedback: mockSaveFactSetFeedback,
}));

// ── Sample data ──────────────────────────────────────────────────────────────

function createMockChangeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "cr-123",
    reference: "BCM-2026-000001",
    changeType: "benchmark_switch",
    clientName: "Test Client",
    clientId: "client-1",
    clientReference: "TC-001",
    requestedBy: "Ruben Verboon",
    rationale: "Test",
    effectiveDate: "2026-09-01",
    status: "in_progress",
    slaLeadWeeks: 1,
    statusUpdatedAt: "2026-07-26T12:00:00Z",
    processedAt: null,
    processedBy: null,
    validatedAt: null,
    validatedBy: null,
    notificationSent: false,
    createdAt: "2026-07-26T10:00:00Z",
    items: [],
    fields: [
      {
        fieldKey: "current_benchmark_id",
        istValue: "benchmark-old-uuid",
        sollValue: "benchmark-old-uuid",
      },
      {
        fieldKey: "requested_benchmark_id",
        istValue: null,
        sollValue: "benchmark-new-uuid",
      },
    ],
    ...overrides,
  };
}

// ── Common hooks ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("IST Updater — validation", () => {
  it("should reject input without changeRequestId", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "",
      outcome: "processed",
    });
    expect(result.success).toBe(false);
    expect(result.fieldsUpdated).toBe(0);
    expect(result.error).toContain("changeRequestId");
  });

  it("should reject input without outcome", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "" as any,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("outcome");
  });

  it("should reject processor names that are too long", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "processed",
      processedBy: "x".repeat(201),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("processedBy exceeds");
  });
});

describe("IST Updater — change request not found", () => {
  it("should return error when the change request does not exist", async () => {
    mockGetChangeRequest.mockResolvedValue(null);

    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "nonexistent",
      outcome: "processed",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
    expect(mockGetChangeRequest).toHaveBeenCalledWith("nonexistent");
    expect(mockUpdateChangeStatus).not.toHaveBeenCalled();
  });
});

describe("IST Updater — successful processing", () => {
  beforeEach(() => {
    mockGetChangeRequest.mockResolvedValue(
      createMockChangeRequest(),
    );
  });

  it("should set status to 'processed' and update IST fields", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "processed",
      processedBy: "asset_servicer",
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("processed");
    expect(result.fieldsUpdated).toBe(1); // only the second field changed (istValue was null)
    expect(result.changeRequestId).toBe("cr-123");

    // Should have updated the change request status (which sets processed_at/by)
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(
      "cr-123",
      "processed",
      "asset_servicer",
    );

    // Should have updated the fields JSONB
    expect(mockUpdateChangeRequestFields).toHaveBeenCalledTimes(1);
    const updatedFields = mockUpdateChangeRequestFields.mock.calls[0][1];
    expect(updatedFields).toHaveLength(2);

    // First field: istValue should now equal sollValue (was already equal)
    expect(updatedFields[0].fieldKey).toBe("current_benchmark_id");
    expect(updatedFields[0].istValue).toBe("benchmark-old-uuid");

    // Second field: istValue should now be the sollValue
    expect(updatedFields[1].fieldKey).toBe("requested_benchmark_id");
    expect(updatedFields[1].istValue).toBe("benchmark-new-uuid");
  });

  it("should use resultData override when provided", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "completed",
      processedBy: "factset",
      resultData: {
        requested_benchmark_id: "actual-applied-benchmark-uuid",
      },
    });

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toBe(1);

    const updatedFields = mockUpdateChangeRequestFields.mock.calls[0][1];
    // The override value should be used instead of sollValue
    expect(updatedFields[1].istValue).toBe("actual-applied-benchmark-uuid");
  });

  it('should use "system" as default processor name', async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "processed",
    });

    expect(result.success).toBe(true);
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(
      "cr-123",
      "processed",
      "system",
    );
  });

  it("should handle 'partial' outcome like processed", async () => {
    mockGetChangeRequest.mockResolvedValue(
      createMockChangeRequest({ fields: [] }),
    );

    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "partial",
      processedBy: "asset_servicer",
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("processed");
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(
      "cr-123",
      "processed",
      "asset_servicer",
    );
  });

  it("should include external reference in message", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "processed",
      processedBy: "factset",
      externalReference: "FAC-2026-0042",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("FAC-2026-0042");
  });
});

describe("IST Updater — failed processing", () => {
  beforeEach(() => {
    mockGetChangeRequest.mockResolvedValue(
      createMockChangeRequest(),
    );
  });

  it("should set status to 'failed' and not update fields", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "failed",
      processedBy: "asset_servicer",
      message: "Asset servicer returned timeout",
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("failed");
    expect(result.fieldsUpdated).toBe(0);

    // Should have updated status but NOT fields
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(
      "cr-123",
      "failed",
      "asset_servicer",
    );
    expect(mockUpdateChangeRequestFields).not.toHaveBeenCalled();
  });

  it("should handle 'rejected' outcome like failed", async () => {
    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "rejected",
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("failed");
    expect(mockUpdateChangeRequestFields).not.toHaveBeenCalled();
  });
});

describe("IST Updater — error handling", () => {
  it("should catch DB errors and return failure result", async () => {
    mockGetChangeRequest.mockRejectedValue(
      new Error("Database connection lost"),
    );

    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "processed",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Database connection lost");
    expect(result.fieldsUpdated).toBe(0);
  });

  it("should handle empty fields array gracefully", async () => {
    mockGetChangeRequest.mockResolvedValue(
      createMockChangeRequest({ fields: [] }),
    );

    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "processed",
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("processed");
    expect(result.fieldsUpdated).toBe(0);
    // Should still update status even with no fields
    expect(mockUpdateChangeStatus).toHaveBeenCalled();
    // But not update fields
    expect(mockUpdateChangeRequestFields).not.toHaveBeenCalled();
  });

  it("should handle null/undefined fields", async () => {
    mockGetChangeRequest.mockResolvedValue(
      createMockChangeRequest({ fields: undefined }),
    );

    const { updateISTFields } = await import("@/lib/ist-updater");
    const result = await updateISTFields({
      changeRequestId: "cr-123",
      outcome: "processed",
    });

    expect(result.success).toBe(true);
    expect(result.fieldsUpdated).toBe(0);
    expect(mockUpdateChangeRequestFields).not.toHaveBeenCalled();
  });
});

describe("saveFactSetFeedbackAndUpdateIST wrapper", () => {
  beforeEach(() => {
    mockGetChangeRequest.mockResolvedValue(
      createMockChangeRequest(),
    );
  });

  it("should save feedback and trigger IST update on processed outcome", async () => {
    const { saveFactSetFeedbackAndUpdateIST } = await import(
      "@/lib/ist-updater"
    );

    const result = await saveFactSetFeedbackAndUpdateIST({
      id: "fb-001",
      submissionId: "sub-001",
      changeRequestId: "cr-123",
      outcome: "processed",
      message: "All changes applied",
      externalReference: "FAC-REF-001",
      rawPayload: '{"event":"processing.feedback","data":{...}}',
    });

    expect(result.feedbackId).toBe("fb-001");

    // Feedback was saved
    expect(mockSaveFactSetFeedback).toHaveBeenCalledWith({
      id: "fb-001",
      submissionId: "sub-001",
      changeRequestId: "cr-123",
      outcome: "processed",
      message: "All changes applied",
      externalReference: "FAC-REF-001",
      rawPayload: '{"event":"processing.feedback","data":{...}}',
    });

    // IST update was triggered with factset as processor
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(
      "cr-123",
      "processed",
      "factset",
    );
    expect(result.istUpdate.success).toBe(true);
  });

  it("should save feedback but set failed status on failed outcome", async () => {
    const { saveFactSetFeedbackAndUpdateIST } = await import(
      "@/lib/ist-updater"
    );

    const result = await saveFactSetFeedbackAndUpdateIST({
      id: "fb-002",
      submissionId: "sub-001",
      changeRequestId: "cr-123",
      outcome: "failed",
      message: "Processing error",
      externalReference: null,
      rawPayload: "{}",
    });

    expect(result.feedbackId).toBe("fb-002");
    expect(mockSaveFactSetFeedback).toHaveBeenCalled();
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(
      "cr-123",
      "failed",
      "factset",
    );
    expect(mockUpdateChangeRequestFields).not.toHaveBeenCalled();
    expect(result.istUpdate.newStatus).toBe("failed");
  });

  it("should save feedback with partial outcome mapping", async () => {
    const { saveFactSetFeedbackAndUpdateIST } = await import(
      "@/lib/ist-updater"
    );

    const result = await saveFactSetFeedbackAndUpdateIST({
      id: "fb-003",
      submissionId: "sub-001",
      changeRequestId: "cr-123",
      outcome: "partial",
      message: "Some changes applied",
      externalReference: null,
      rawPayload: "{}",
    });

    // Partial maps to "processed" status (some changes were applied)
    expect(mockUpdateChangeStatus).toHaveBeenCalledWith(
      "cr-123",
      "processed",
      "factset",
    );
    expect(result.istUpdate.success).toBe(true);
    expect(result.istUpdate.newStatus).toBe("processed");
  });
});
