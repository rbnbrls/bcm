/**
 * Tests for the FactSet integration module (lib/factset.ts).
 *
 * Covers payload building, submission logic (mock HTTP), and configuration
 * edge cases without requiring a real FactSet endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the DB module — we don't need a real database for unit tests
vi.mock("@/lib/db", () => ({
  createFactSetSubmission: vi.fn().mockResolvedValue(undefined),
  updateFactSetSubmission: vi.fn().mockResolvedValue(undefined),
  getChangeRequest: vi.fn(),
}));

describe("FactSet integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("FACTSET_API_URL", "https://factset.example.com/api/process");
    vi.stubEnv("FACTSET_API_KEY", "test-api-key-12345");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("isFactSetConfigured", () => {
    it("should return true when both URL and key are set", async () => {
      const { isFactSetConfigured } = await import("@/lib/factset");
      expect(isFactSetConfigured()).toBe(true);
    });

    it("should return false when URL is missing", async () => {
      vi.stubEnv("FACTSET_API_URL", "");
      const { isFactSetConfigured } = await import("@/lib/factset");
      expect(isFactSetConfigured()).toBe(false);
    });

    it("should return false when key is missing", async () => {
      vi.stubEnv("FACTSET_API_KEY", "");
      const { isFactSetConfigured } = await import("@/lib/factset");
      expect(isFactSetConfigured()).toBe(false);
    });

    it("should return false when both are missing", async () => {
      vi.stubEnv("FACTSET_API_URL", "");
      vi.stubEnv("FACTSET_API_KEY", "");
      const { isFactSetConfigured } = await import("@/lib/factset");
      expect(isFactSetConfigured()).toBe(false);
    });
  });

  describe("buildSubmissionPayload", () => {
    it("should return null when change request is not found", async () => {
      const db = await import("@/lib/db");
      (db.getChangeRequest as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { buildSubmissionPayload } = await import("@/lib/factset");
      const result = await buildSubmissionPayload("nonexistent-id");
      expect(result).toBeNull();
    });

    it("should build a valid payload from a change request", async () => {
      const db = await import("@/lib/db");
      (db.getChangeRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "cr-123",
        reference: "BCM-2026-000001",
        clientName: "Test Client",
        clientId: "client-1",
        clientReference: "TC-001",
        effectiveDate: "2026-09-01",
        requestedBy: "Ruben Verboon",
        rationale: "Switch to MSCI World for better diversification.",
        items: [
          {
            portfolioName: "Portfolio A",
            portfolioReference: "PA-001",
            previousBenchmark: {
              code: "MSCI_ACWI_NR",
              name: "MSCI ACWI NR",
            },
            requestedBenchmark: {
              code: "MSCI_WORLD_NR",
              name: "MSCI World NR",
            },
          },
        ],
      });

      const { buildSubmissionPayload } = await import("@/lib/factset");
      const result = await buildSubmissionPayload("cr-123");

      expect(result).not.toBeNull();
      expect(result!.event).toBe("benchmark_change.submitted");
      expect(result!.change_request_reference).toBe("BCM-2026-000001");
      expect(result!.data.client.name).toBe("Test Client");
      expect(result!.data.client.external_reference).toBe("TC-001");
      expect(result!.data.changes).toHaveLength(1);
      expect(result!.data.changes[0].portfolio_name).toBe("Portfolio A");
      expect(result!.data.changes[0].previous_benchmark.code).toBe("MSCI_ACWI_NR");
      expect(result!.data.changes[0].requested_benchmark.code).toBe("MSCI_WORLD_NR");
      expect(result!.submission_id).toBeTruthy();
      expect(result!.timestamp).toBeTruthy();
    });

    it("should include a unique submission_id each time", async () => {
      const db = await import("@/lib/db");
      (db.getChangeRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "cr-123",
        reference: "BCM-2026-000001",
        clientName: "Test Client",
        clientId: "client-1",
        clientReference: "TC-001",
        effectiveDate: "2026-09-01",
        requestedBy: "Ruben Verboon",
        rationale: "Test",
        items: [],
      });

      const { buildSubmissionPayload } = await import("@/lib/factset");
      const result1 = await buildSubmissionPayload("cr-123");
      const result2 = await buildSubmissionPayload("cr-123");
      expect(result1!.submission_id).not.toBe(result2!.submission_id);
    });
  });

  describe("submitChangeToFactSet", () => {
    it("should skip submission when FACTSET_API_URL is not set", async () => {
      vi.stubEnv("FACTSET_API_URL", "");
      const { submitChangeToFactSet } = await import("@/lib/factset");
      const result = await submitChangeToFactSet("cr-123");
      expect(result.success).toBe(false);
      expect(result.submissionId).toBe("");
    });

    it("should throw when the change request does not exist", async () => {
      const db = await import("@/lib/db");
      (db.getChangeRequest as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { submitChangeToFactSet } = await import("@/lib/factset");
      await expect(submitChangeToFactSet("nonexistent")).rejects.toThrow(
        /not found/,
      );
    });

    it("should return success on 2xx response", async () => {
      const db = await import("@/lib/db");
      (db.getChangeRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "cr-123",
        reference: "BCM-2026-000001",
        clientName: "Test Client",
        clientId: "client-1",
        clientReference: "TC-001",
        effectiveDate: "2026-09-01",
        requestedBy: "Ruben Verboon",
        rationale: "Test",
        items: [],
      });

      // Mock fetch to return 200
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"status": "accepted"}'),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { submitChangeToFactSet } = await import("@/lib/factset");
      const result = await submitChangeToFactSet("cr-123");

      expect(result.success).toBe(true);
      expect(result.submissionId).toBeTruthy();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify the request was properly formed
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("https://factset.example.com/api/process");
      expect(callArgs[1].method).toBe("POST");
      expect(callArgs[1].headers["Authorization"]).toBe("Bearer test-api-key-12345");
      expect(callArgs[1].headers["X-API-Key"]).toBe("test-api-key-12345");
    });
  });

  describe("validateWebhookSignature", () => {
    it("should return true when no secret is configured", async () => {
      vi.stubEnv("FACTSET_WEBHOOK_SECRET", "");
      const { validateWebhookSignature } = await import("@/lib/factset");
      expect(validateWebhookSignature('{"test": true}', null)).toBe(true);
      expect(validateWebhookSignature('{"test": true}', "some-signature")).toBe(true);
    });

    it("should return true when a secret is configured (lenient for now)", async () => {
      vi.stubEnv("FACTSET_WEBHOOK_SECRET", "shared-secret");
      const { validateWebhookSignature } = await import("@/lib/factset");
      const result = validateWebhookSignature('{"test": true}', "some-signature");
      expect(result).toBe(true);
    });
  });
});
