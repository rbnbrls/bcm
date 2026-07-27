/**
 * Tests for PATCH /api/portfolio/[id] — updating assetClass / subAssetClass.
 *
 * Covers:
 * - UUID validation (400 on invalid format)
 * - Body validation (400 on missing fields, invalid JSON)
 * - Portfolio not found (404)
 * - Successful updates with assetClass only, subAssetClass only, both
 * - Validation failure (400 on invalid pair)
 * - Error handling safety net
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetPortfolioById = vi.fn();
const mockUpdatePortfolioAssetClassFields = vi.fn();

vi.mock("@/lib/db", () => ({
  getPortfolioById: mockGetPortfolioById,
  updatePortfolioAssetClassFields: mockUpdatePortfolioAssetClassFields,
}));

const existingPortfolio = {
  id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
  name: "Rendementsportefeuille",
  assetClass: "EQUITIES",
  subAssetClass: "AC WORLD",
};

describe("PATCH /api/portfolio/[id] — UUID validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return 400 when id is not a UUID", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request("http://localhost:3000/api/portfolio/abc", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetClass: "CASH" }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "abc" }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldig portfolio ID formaat");
  });

  it("should return 400 when id is empty string", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request("http://localhost:3000/api/portfolio/", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetClass: "CASH" }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("should return 400 when id is numeric (not a UUID)", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request("http://localhost:3000/api/portfolio/123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetClass: "CASH" }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "123" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/portfolio/[id] — body validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return 400 when body is invalid JSON", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldige JSON");
  });

  it("should return 400 when neither assetClass nor subAssetClass is provided", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Geen wijzigingen");
  });

  it("should return 400 when body has only unrelated fields", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New name" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/portfolio/[id] — portfolio existence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return 404 when portfolio is not found", async () => {
    mockGetPortfolioById.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetClass: "CASH" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "00000000-0000-0000-0000-000000000000",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toContain("niet gevonden");
  });
});

describe("PATCH /api/portfolio/[id] — successful updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPortfolioById.mockResolvedValue(existingPortfolio);
  });

  it("should update assetClass only (EQUITIES → CASH) and succeed (existing subAssetClass is cleared for pair validation)", async () => {
    mockUpdatePortfolioAssetClassFields.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetClass: "CASH" }),
      },
    );
    // The portfolio has subAssetClass "AC WORLD" which is NOT valid for CASH,
    // so the endpoint should reject this combination.
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    // When changing asset class only, the existing subAssetClass is used in
    // pair validation — AC WORLD is not valid for CASH, so this returns 400.
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("AC WORLD");
    expect(body.error).toContain("CASH");
    // DB should NOT have been called
    expect(mockUpdatePortfolioAssetClassFields).not.toHaveBeenCalled();
  });

  it("should update subAssetClass only and succeed", async () => {
    mockUpdatePortfolioAssetClassFields.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subAssetClass: "DEVELOPED MARKETS" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // subAssetClass only — assetClass (existing) is used for pair validation
    expect(mockUpdatePortfolioAssetClassFields).toHaveBeenCalledWith(
      "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      { subAssetClass: "DEVELOPED MARKETS" },
    );
  });

  it("should update both assetClass and subAssetClass and succeed", async () => {
    mockUpdatePortfolioAssetClassFields.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClass: "REAL_ASSETS",
          subAssetClass: "INFRASTRUCTURE",
        }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpdatePortfolioAssetClassFields).toHaveBeenCalledWith(
      "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      { assetClass: "REAL_ASSETS", subAssetClass: "INFRASTRUCTURE" },
    );
  });

  it("should trim whitespace from values before validation", async () => {
    mockUpdatePortfolioAssetClassFields.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClass: "  FIXED_INCOME  ",
          subAssetClass: "  SOVEREIGN EUROPE  ",
        }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpdatePortfolioAssetClassFields).toHaveBeenCalledWith(
      "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      { assetClass: "FIXED_INCOME", subAssetClass: "SOVEREIGN EUROPE" },
    );
  });
});

describe("PATCH /api/portfolio/[id] — validation failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPortfolioById.mockResolvedValue(existingPortfolio);
  });

  it("should return 400 when subAssetClass is invalid for the new assetClass", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClass: "CASH",
          subAssetClass: "AC WORLD", // AC WORLD is not valid for CASH
        }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("AC WORLD");
    expect(body.error).toContain("CASH");
    // DB should NOT have been called
    expect(mockUpdatePortfolioAssetClassFields).not.toHaveBeenCalled();
  });

  it("should return 400 when asset class is unknown", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetClass: "INVALID" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    expect(response.status).toBe(400);
    expect(mockUpdatePortfolioAssetClassFields).not.toHaveBeenCalled();
  });

  it("should return 400 when subAssetClass is empty string", async () => {
    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClass: "EQUITIES",
          subAssetClass: "",
        }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    expect(response.status).toBe(400);
    expect(mockUpdatePortfolioAssetClassFields).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/portfolio/[id] — error handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return 500 when getPortfolioById throws", async () => {
    mockGetPortfolioById.mockRejectedValue(new Error("DB connection failed"));

    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetClass: "CASH" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    expect(response.status).toBe(500);
  });

  it("should return 500 when updatePortfolioAssetClassFields throws", async () => {
    mockGetPortfolioById.mockResolvedValue(existingPortfolio);
    mockUpdatePortfolioAssetClassFields.mockRejectedValue(
      new Error("DB write failed"),
    );

    const { PATCH } = await import("@/app/api/portfolio/[id]/route");
    const request = new Request(
      "http://localhost:3000/api/portfolio/c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subAssetClass: "DEVELOPED MARKETS" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({
        id: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
      }),
    });
    expect(response.status).toBe(500);
  });
});
