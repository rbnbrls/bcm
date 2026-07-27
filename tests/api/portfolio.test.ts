/**
 * Tests for GET /api/portfolio/[id]
 *
 * Three scenarios:
 * 1. Invalid ID (non-UUID, like 'abc')  → 400 { error: "..." }
 * 2. Valid UUID but not found           → 404 { error: "..." }
 * 3. Valid UUID and found               → 200 { portfolio: ... }
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock portfolio data
const mockPortfolio = {
  id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
  name: "Rendementsportefeuille",
  externalReference: "HOR-RP",
  currentBenchmarkId: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
  currentBenchmark: {
    id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
    code: "MSCI-WORLD-NR",
    name: "MSCI World Net Return",
    assetClass: "Aandelen",
    currency: "EUR",
    cost: 1000,
    provider: "MSCI",
  },
};

// Top-level hoisted mock controller — avoids vi.mock hoisting collisions
const { mockGetPortfolioById } = vi.hoisted(() => ({
  mockGetPortfolioById: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPortfolioById: mockGetPortfolioById,
}));

describe("GET /api/portfolio/[id] — UUID validation (no db needed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when id is 'abc' (not a UUID)", async () => {
    const { GET } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request("http://localhost:3000/api/portfolio/abc");
    const response = await GET(request, {
      params: Promise.resolve({ id: "abc" }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("should return 400 when id is numeric string '123' (not a UUID)", async () => {
    const { GET } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request("http://localhost:3000/api/portfolio/123");
    const response = await GET(request, {
      params: Promise.resolve({ id: "123" }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("should return 400 when id is an empty string", async () => {
    const { GET } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request("http://localhost:3000/api/portfolio/");
    const response = await GET(request, {
      params: Promise.resolve({ id: "" }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("should be force-dynamic (no caching)", async () => {
    const mod = await import("@/app/api/portfolio/[id]/route");
    expect((mod as any).dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/portfolio/[id] — with mocked db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when a valid UUID does not exist", async () => {
    mockGetPortfolioById.mockResolvedValue(null);

    const { GET } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/00000000-0000-0000-0000-000000000000"
    );
    const response = await GET(request, {
      params: Promise.resolve({
        id: "00000000-0000-0000-0000-000000000000",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBeDefined();
    expect(body.error).toContain("niet gevonden");
  });

  it("should return 200 with portfolio data when found", async () => {
    mockGetPortfolioById.mockResolvedValue(mockPortfolio);

    const { GET } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff"
    );
    const response = await GET(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.portfolio).toBeDefined();
    expect(body.portfolio.id).toBe("c4707067-b98a-4a0f-92c7-5ee510dc70ff");
    expect(body.portfolio.name).toBe("Rendementsportefeuille");
    expect(body.portfolio.currentBenchmark.code).toBe("MSCI-WORLD-NR");
  });
});
