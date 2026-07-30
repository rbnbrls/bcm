/**
 * Tests for GET /api/benchmarks/[id]/name — resolving a benchmark UUID to its name.
 *
 * Covers:
 * - UUID validation (400 on invalid format)
 * - Benchmark not found (404)
 * - Successful name resolution (200)
 * - Error handling safety net
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetBenchmarkNameById = vi.fn();

vi.mock("@/lib/db", () => ({
  getBenchmarkNameById: mockGetBenchmarkNameById,
}));

describe("GET /api/benchmarks/[id]/name — UUID validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return 400 when id is not a UUID", async () => {
    const { GET } = await import("@/app/api/benchmarks/[id]/name/route");
    const request = new Request("http://localhost:3000/api/benchmarks/not-a-uuid/name");
    const response = await GET(request, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldig benchmark ID formaat");
  });

  it("should return 400 when id is an empty string", async () => {
    const { GET } = await import("@/app/api/benchmarks/[id]/name/route");
    const request = new Request("http://localhost:3000/api/benchmarks//name");
    const response = await GET(request, {
      params: Promise.resolve({ id: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("should return 400 when id is a short hex string", async () => {
    const { GET } = await import("@/app/api/benchmarks/[id]/name/route");
    const request = new Request("http://localhost:3000/api/benchmarks/abc123/name");
    const response = await GET(request, {
      params: Promise.resolve({ id: "abc123" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/benchmarks/[id]/name — benchmark resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return 404 when benchmark UUID does not exist", async () => {
    mockGetBenchmarkNameById.mockResolvedValue(null);

    const { GET } = await import("@/app/api/benchmarks/[id]/name/route");
    const request = new Request("http://localhost:3000/api/benchmarks/00000000-0000-0000-0000-000000000000/name");
    const response = await GET(request, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe("Benchmark niet gevonden.");
  });

  it("should return 200 with name and code for a valid benchmark UUID", async () => {
    mockGetBenchmarkNameById.mockResolvedValue({
      name: "MSCI World Net Return",
      code: "MSCI-WORLD-NR",
    });

    const { GET } = await import("@/app/api/benchmarks/[id]/name/route");
    const request = new Request("http://localhost:3000/api/benchmarks/9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1/name");
    const response = await GET(request, {
      params: Promise.resolve({ id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1" }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.name).toBe("MSCI World Net Return");
    expect(body.code).toBe("MSCI-WORLD-NR");
  });

  it("should return 500 when database throws an unexpected error", async () => {
    mockGetBenchmarkNameById.mockRejectedValue(new Error("DB connection lost"));

    const { GET } = await import("@/app/api/benchmarks/[id]/name/route");
    const request = new Request("http://localhost:3000/api/benchmarks/9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1/name");
    const response = await GET(request, {
      params: Promise.resolve({ id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1" }),
    });
    expect(response.status).toBe(500);
  });
});
