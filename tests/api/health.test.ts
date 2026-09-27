/**
 * Tests for the /api/health route.
 *
 * Three scenarios:
 * 1. DATABASE_URL set + DB reachable       → 200 { status: "healthy", db: "connected" }
 * 2. DATABASE_URL set + DB unreachable     → 503 { status: "degraded", db: "error" }
 * 3. DATABASE_URL not set (demo mode)      → 200 { status: "healthy", db: "disconnected" }
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock postgres at module level — vi.mock is hoisted to top
const mockPostgresClient = vi.fn();
const mockEnd = vi.fn();

vi.mock("postgres", () => ({
  default: vi.fn(() => {
    // The returned "sql" function is used as a tagged template: sql`SELECT 1`
    const sql = Object.assign(
      () => { throw new Error("not configured"); },
      { end: mockEnd },
    );
    // Override prototype so tagged template call works
    return sql;
  }),
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPostgresClient.mockReset();
    mockEnd.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should return 200 with db connected when DATABASE_URL is set and DB is reachable", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    // Make postgres() return a function that resolves when called as tagged template
    const postgresMock = (await import("postgres")).default as unknown as ReturnType<typeof vi.fn>;
    const mockSql = Object.assign(vi.fn().mockResolvedValue(undefined), {
      end: mockEnd.mockResolvedValue(undefined),
    });
    postgresMock.mockReturnValue(mockSql);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("connected");
    expect(body.timestamp).toBeDefined();
  });

  it("should return 503 with db error when DB is unreachable", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    const postgresMock = (await import("postgres")).default as unknown as ReturnType<typeof vi.fn>;
    const mockSql = Object.assign(vi.fn().mockRejectedValue(new Error("Connection refused")), {
      end: mockEnd.mockResolvedValue(undefined),
    });
    postgresMock.mockReturnValue(mockSql);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("error");
    expect(body.timestamp).toBeDefined();
  });

  it("should return 200 with db disconnected when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", undefined);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("disconnected");
    expect(body.timestamp).toBeDefined();
  });

  it("should return 500 when DATABASE_URL is set but empty", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("misconfigured");
    expect(body.timestamp).toBeDefined();
  });

  it("should be force-dynamic (no caching)", async () => {
    const mod = await import("@/app/api/health/route");
    expect((mod as any).dynamic).toBe("force-dynamic");
  });
});
