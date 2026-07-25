/**
 * Tests for the /api/export/[id] route.
 *
 * Covers CSV format, PDF format, and error handling scenarios.
 * Uses mocked getChangeRequest for deterministic test data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChangeRequest } from "@/lib/types";

vi.mock("@/lib/db", () => ({ getChangeRequest: vi.fn() }));

const { getChangeRequest } = await import("@/lib/db");
const mockGetChangeRequest = vi.mocked(getChangeRequest);

const MOCK_REQUEST: ChangeRequest = {
  id: "6a1f8e7b-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
  reference: "BCM-2026-001",
  clientName: "Pensioenfonds Horizon",
  clientReference: "PF-HOR-001",
  requestedBy: "Jan Jansen",
  rationale: "Wijziging van benchmark voor betere spreiding",
  effectiveDate: "2026-09-01",
  changeType: "benchmark_switch",
  status: "submitted",
  createdAt: "2026-07-20T10:00:00Z",
  items: [
    {
      portfolioName: "Rendementsportefeuille",
      portfolioReference: "HOR-RP",
      previousBenchmark: {
        id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
        code: "MSCI-WORLD-NR",
        name: "MSCI World Net Return",
        assetClass: "Aandelen",
        currency: "EUR",
        cost: 1000,
        provider: "MSCI",
      },
      requestedBenchmark: {
        id: "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d",
        code: "MSCI-ACWI-NR",
        name: "MSCI ACWI Net Return",
        assetClass: "Aandelen",
        currency: "EUR",
        cost: 1200,
        provider: "MSCI",
      },
    },
    {
      portfolioName: "Matchingportefeuille",
      portfolioReference: "HOR-MP",
      previousBenchmark: {
        id: "7c8bd971-b05c-4141-9a27-7ee0d02137a5",
        code: "BLOOMBERG-EU-AGG",
        name: "Bloomberg Euro Aggregate",
        assetClass: "Obligaties",
        currency: "EUR",
        cost: 1000,
        provider: "Bloomberg",
      },
      requestedBenchmark: {
        id: "9644a84d-59d6-40fa-aee9-062fbc1ef9fc",
        code: "ICE-BOFA-EU-CORP",
        name: "ICE BofA Euro Corporate",
        assetClass: "Obligaties",
        currency: "EUR",
        cost: 1000,
        provider: "ICE BofA",
      },
    },
  ],
};

describe("GET /api/export/[id] — CSV format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetChangeRequest.mockResolvedValue(MOCK_REQUEST);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return CSV with correct Content-Type and Content-Disposition", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=csv"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain(
      "BCM-2026-001"
    );
  });

  it("should return CSV with BOM prefix and semicolon delimiters", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=csv"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });
    // Check BOM via raw bytes (EF BB BF = UTF-8 BOM). Response.text()
    // may strip the BOM during UTF-8 decoding in the test environment,
    // so we check the ArrayBuffer directly.
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    // Semiolons present in CSV body
    const text = new TextDecoder("utf-8").decode(buffer);
    expect(text).toContain(";");
    // Dutch column headers
    expect(text).toContain("Portefeuille");
    expect(text).toContain("IST Benchmark Code");
    expect(text).toContain("SOLL Benchmark Code");
    expect(text).toContain("Kosten (EUR)");
  });

  it("should include request metadata as header rows", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=csv"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });
    const text = await response.text();

    expect(text).toContain("BCM-2026-001");
    expect(text).toContain("Pensioenfonds Horizon");
    expect(text).toContain("Jan Jansen");
    expect(text).toContain("Wijziging van benchmark voor betere spreiding");
  });

  it("should include per-portfolio IST/SOLL diff data", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=csv"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });
    const text = await response.text();

    // Portfolio names
    expect(text).toContain("Rendementsportefeuille");
    expect(text).toContain("Matchingportefeuille");
    // IST benchmark codes
    expect(text).toContain("MSCI-WORLD-NR");
    expect(text).toContain("BLOOMBERG-EU-AGG");
    // SOLL benchmark codes
    expect(text).toContain("MSCI-ACWI-NR");
    expect(text).toContain("ICE-BOFA-EU-CORP");
  });

  it("should use CRLF line endings", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=csv"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });
    const text = await response.text();

    expect(text).toContain("\r\n");
  });
});

describe("GET /api/export/[id] — PDF format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetChangeRequest.mockResolvedValue(MOCK_REQUEST);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return PDF with correct Content-Type", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=pdf"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("should include reference in PDF Content-Disposition filename", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=pdf"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });

    const disposition = response.headers.get("Content-Disposition") || "";
    expect(disposition).toContain("BCM-2026-001");
    expect(disposition).toContain(".pdf");
  });

  it("should return binary PDF body", async () => {
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=pdf"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });

    const buffer = await response.arrayBuffer();
    // PDF header magic bytes: %PDF
    const header = new Uint8Array(buffer, 0, 4);
    expect(header[0]).toBe(0x25); // '%'
    expect(header[1]).toBe(0x50); // 'P'
    expect(header[2]).toBe(0x44); // 'D'
    expect(header[3]).toBe(0x46); // 'F'
  });
});

describe("GET /api/export/[id] — error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 400 for invalid format", async () => {
    mockGetChangeRequest.mockResolvedValue(MOCK_REQUEST);
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=docx"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldig exportformaat");
  });

  it("should return 404 for non-existent change request", async () => {
    mockGetChangeRequest.mockResolvedValue(null);
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=csv"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "nonexistent-id" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("niet gevonden");
  });

  it("should return 500 when database throws", async () => {
    mockGetChangeRequest.mockRejectedValue(new Error("DB connection failed"));
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request(
      "http://localhost/api/export/test-id?format=csv"
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("Export mislukt");
  });

  it("should return 400 when no format param provided", async () => {
    mockGetChangeRequest.mockResolvedValue(MOCK_REQUEST);
    const { GET } = await import("@/app/api/export/[id]/route");
    const request = new Request("http://localhost/api/export/test-id");
    const response = await GET(request, {
      params: Promise.resolve({ id: "test-id" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldig exportformaat");
  });
});
