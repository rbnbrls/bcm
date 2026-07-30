/**
 * Tests for the /api/seed/client-config route.
 *
 * This endpoint populates the client_config (3NF) schema tables with
 * reference data and portfolio configurations, so the admin client-config
 * page can display them.
 *
 * Scenarios:
 * 1. DATABASE_URL not set → 400 with error message
 * 2. Successful seed → 200 with summary containing counts of inserted records
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock postgres at module level
const mockPostgresClient = vi.fn();
const mockEnd = vi.fn();

vi.mock("postgres", () => ({
  default: vi.fn(() => {
    const sql = Object.assign(
      () => { throw new Error("not configured"); },
      { end: mockEnd },
    );
    return sql;
  }),
}));

describe("POST /api/seed/client-config", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPostgresClient.mockReset();
    mockEnd.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should return 400 when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const { POST } = await import("@/app/api/seed/client-config/route");
    const request = new Request("https://bcm.7rb.nl/api/seed/client-config", {
      method: "POST",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("DATABASE_URL");
  });

  it("should return 200 with summary on successful seed", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:***@localhost:5432/bcm");

    // Mock the postgres tagged template function
    const postgresMock = (await import("postgres")).default as ReturnType<typeof vi.fn>;
    
    // Track all SQL calls
    const sqlCalls: string[] = [];
    const mockSql = vi.fn().mockImplementation((...args: unknown[]) => {
      const query = String(args[0] ?? "");
      sqlCalls.push(query);
      // Return mock data based on the query
      if (query.includes("SET LOCAL")) {
        return Promise.resolve([]);
      }
      if (query.includes("ON CONFLICT") || query.includes("INSERT") || query.includes("DELETE")) {
        return Promise.resolve([]);
      }
      if (query.includes("SELECT npc_classification_id")) {
        return Promise.resolve([{ npc_classification_id: 1 }]);
      }
      if (query.includes("SELECT COUNT")) {
        return Promise.resolve([{ managers: "3", benchmarks: "17", npc_classifications: "3", portfolios: "83", configurations: "83" }]);
      }
      return Promise.resolve([]);
    });
    mockSql.end = mockEnd.mockResolvedValue(undefined);
    
    // Add a `begin` method for transactions
    mockSql.begin = vi.fn().mockImplementation(async (cb: any) => {
      // Pass the mockSql as the transaction client
      return cb(mockSql);
    });
    
    postgresMock.mockReturnValue(mockSql);

    const { POST } = await import("@/app/api/seed/client-config/route");
    const request = new Request("https://bcm.7rb.nl/api/seed/client-config", {
      method: "POST",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary).toBeDefined();
    expect(body.summary.managers).toBeGreaterThanOrEqual(0);
    expect(body.summary.benchmarks).toBeGreaterThanOrEqual(0);
    expect(body.summary.npcClassifications).toBeGreaterThanOrEqual(0);
    expect(body.summary.portfolios).toBeGreaterThanOrEqual(0);
    expect(body.summary.configurations).toBeGreaterThanOrEqual(0);
  });
});