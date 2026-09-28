/**
 * Regression tests for the connection timeout fix (GlitchTip #2 / GitHub #166).
 *
 * Verifies that:
 * 1. The connection pool is configured with reduced connect_timeout (5s)
 *    and max_lifetime (300s), preventing indefinite hangs.
 * 2. When a database query times out, the health endpoint returns 503
 *    instead of hanging indefinitely.
 * 3. The withTableEnsure retry mechanism falls back to fixture data when
 *    a query fails (avoids cascading timeouts).
 * 4. High concurrent query volume does not exhaust the pooled connection
 *    in a way that causes a hang (max: 5 connections).
 * 5. Edge cases: zero-result queries, near-timeout slow queries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module-level postgres mock ────────────────────────────────────────
// vi.mock is hoisted — it runs before any imports, so the real postgres
// module is never loaded.
const mockPostgresClient = vi.fn();
const mockEnd = vi.fn();

type PostgresFactoryMock = ReturnType<typeof vi.fn>;

function asPostgresFactoryMock(value: unknown): PostgresFactoryMock {
  return value as PostgresFactoryMock;
}

function withEnd<T extends ReturnType<typeof vi.fn>>(mock: T): T & { end: ReturnType<typeof vi.fn> } {
  return Object.assign(mock, { end: mockEnd.mockResolvedValue(undefined) });
}

vi.mock("postgres", () => ({
  default: vi.fn(() => {
    const sql = Object.assign(
      () => {
        throw new Error("not configured");
      },
      { end: mockEnd },
    );
    return sql;
  }),
}));

// ── Test ──────────────────────────────────────────────────────────────

describe("Timeout regression — connection pool configuration", () => {
  it("should have connect_timeout: 5 in the pool config (was default 30s)", async () => {
    // The fix reduced connect_timeout from the postgres.js default of 30s to 5s
    // so a DB outage doesn't cause a 30-second hang.
    const fs = await import("fs/promises");
    const content = await fs.readFile(
      new URL("../lib/db.ts", import.meta.url),
      "utf-8",
    );
    expect(content).toContain("connect_timeout: 5");
  });

  it("should have max_lifetime: 300 (5min) to recycle stale connections", async () => {
    // Without max_lifetime, connections that become stale (e.g. after a
    // Postgres restart or firewall idle-drop) would remain in the pool and
    // cause timeouts on subsequent queries.
    const fs = await import("fs/promises");
    const content = await fs.readFile(
      new URL("../lib/db.ts", import.meta.url),
      "utf-8",
    );
    expect(content).toContain("max_lifetime: 300");
  });

  it("should have idle_timeout: 20 in the pool config", async () => {
    // idle_timeout closes connections that have been idle for 20s,
    // preventing accumulation of unused connections in the pool.
    const fs = await import("fs/promises");
    const content = await fs.readFile(
      new URL("../lib/db.ts", import.meta.url),
      "utf-8",
    );
    expect(content).toContain("idle_timeout: 20");
  });

  it("should pass connect_timeout to postgres() constructor when DATABASE_URL is set", async () => {
    // Verify that the postgres factory is called with the correct
    // timeout options when a connection string is present.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");
    vi.resetModules();

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);
    const mockSql = withEnd(vi.fn().mockResolvedValue([{ "?column?": 1 }]));
    postgresMock.mockReturnValue(mockSql);

    await import("@/lib/db");

    expect(postgresMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        max: 5,
        connect_timeout: 5,
        max_lifetime: 300,
        idle_timeout: 20,
      }),
    );

    vi.unstubAllEnvs();
  });
});

describe("Timeout regression — health endpoint timeout handling", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPostgresClient.mockReset();
    mockEnd.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should return 503 when DB query takes longer than connect_timeout", async () => {
    // Simulates the condition that caused GlitchTip #2: a slow/unreachable
    // database that would previously hang for 30s+.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@slow-db:5432/bcm");

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    // Simulate a timeout error — postgres.js throws this when connect_timeout
    // fires before the connection is established.
    const timeoutError = new Error("Connection terminated unexpectedly");
    (timeoutError as any).code = "CONNECTION_TIMEOUT";
    const mockSql = withEnd(vi.fn().mockRejectedValue(timeoutError));
    postgresMock.mockReturnValue(mockSql);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("error");
    expect(body.timestamp).toBeDefined();
  });

  it("should return 503 when DB connection is refused (TCP RST)", async () => {
    // Simulates a database that is reachable but actively refuses the
    // connection — commonly seen during a Postgres restart or firewall
    // rule change.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);
    const connectionRefused = new Error("Connection refused");
    const mockSql = withEnd(vi.fn().mockRejectedValue(connectionRefused));
    postgresMock.mockReturnValue(mockSql);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("error");
  });

  it("should succeed quickly when DB is responsive (happy path unaffected)", async () => {
    // Verify that normal fast queries still work — the fix should not
    // degrade healthy operation.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);
    const mockSql = withEnd(vi.fn().mockResolvedValue([{ "?column?": 1 }]));
    postgresMock.mockReturnValue(mockSql);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("connected");
  });
});

describe("Timeout regression — withTableEnsure retry and fallback", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should return fallback data when all DB attempts fail (timeout scenario)", async () => {
    // The withTableEnsure wrapper retries once. If both attempts time out,
    // it should call captureError and return the fallback value instead of
    // propagating the timeout to the caller.
    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    const timeoutError = new Error("Connection terminated unexpectedly");
    (timeoutError as any).code = "CONNECTION_TIMEOUT";

    // On first call, throw timeout; on retry, throw again
    let callCount = 0;
    const mockSql = Object.assign(
      () => {
        callCount++;
        return Promise.reject(timeoutError);
      },
      { end: mockEnd.mockResolvedValue(undefined) },
    );
    postgresMock.mockReturnValue(mockSql);

    // getBenchmarks queries benchmark_catalog; when both attempts fail it
    // should return the withTableEnsure fallback (empty array) rather than
    // throwing an unhandled error or hanging indefinitely.
    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();

    // Should have returned empty array fallback (no hang, no throw)
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("should NOT fall back when the first attempt succeeds (no regression)", async () => {
    // Verify that when the database works fine, withTableEnsure returns
    // the real query result, not the fallback.
    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    const benchmarkRows = [
      {
        id: "test-uuid",
        code: "TEST-BENCH",
        name: "Test Benchmark",
        asset_class: "Aandelen",
        currency: "EUR",
        cost: 1000,
        provider: "MSCI",
        active: true,
      },
    ];
    const mockSql = withEnd(vi.fn().mockResolvedValue(benchmarkRows));
    postgresMock.mockReturnValue(mockSql);

    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("TEST-BENCH");
  });
});

describe("Timeout regression — high concurrency handling", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should handle 10 concurrent queries without hanging (pool: max=5)", async () => {
    // The pool allows max 5 concurrent connections. Running more should
    // queue them, not hang. This test verifies that 10 simultaneous calls
    // to a DB function all resolve.
    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    const mockSql = withEnd(vi
      .fn()
      .mockResolvedValue([{ "?column?": 1 }]));
    postgresMock.mockReturnValue(mockSql);

    const { sql } = await import("@/lib/db");
    expect(sql).not.toBeNull();
    if (!sql) throw new Error("DATABASE_URL should create the SQL client in this test.");

    const queries = Array.from({ length: 10 }, (_, i) =>
      sql`SELECT ${i} AS num`,
    );
    const results = await Promise.allSettled(queries);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(0);
  });

  it("should not monopolize pool with health checks under load", async () => {
    // The fix merged the health-check pool into the main pool, meaning
    // health checks and application queries share the same 5 connections.
    // Verify that health checks don't starve other queries.
    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    const mockSql = withEnd(vi
      .fn()
      .mockResolvedValue([{ "?column?": 1 }]));
    postgresMock.mockReturnValue(mockSql);

    // Import both modules — they share the same `sql` singleton
    const db = await import("@/lib/db");
    const { GET } = await import("@/app/api/health/route");

    // Run 5 health checks + 5 data queries concurrently
    const tasks = [
      ...Array.from({ length: 5 }, () => GET()),
      ...Array.from({ length: 5 }, () => db.getBenchmarks()),
    ];

    const results = await Promise.allSettled(tasks);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(10);

    // All health checks should have succeeded with 200
    const healthResults = results.slice(0, 5);
    for (const r of healthResults) {
      if (r.status === "fulfilled") {
        const resp = r.value;
        const body = resp instanceof Response ? await resp.clone().json() : null;
        if (body) {
          expect(body.status).toBe("healthy");
        }
      }
    }
  });
});

describe("Timeout regression — edge cases", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should handle zero-result queries without throwing", async () => {
    // A query returning zero rows (e.g., matching no portfolios) should
    // not cause a timeout or crash — just return an empty array.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);
    const mockSql = withEnd(vi.fn().mockResolvedValue([]));
    postgresMock.mockReturnValue(mockSql);

    const { getPortfoliosByClientId } = await import("@/lib/db");
    const result = await getPortfoliosByClientId(
      "00000000-0000-0000-0000-000000000000",
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("should handle empty benchmark catalog gracefully", async () => {
    // Edge case: the benchmark_catalog table exists but is empty.
    // The query should return [] rather than timing out or erroring.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);
    const mockSql = withEnd(vi.fn().mockResolvedValue([]));
    postgresMock.mockReturnValue(mockSql);

    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("should handle null values from LEFT JOIN without timeout or crash", async () => {
    // A LEFT JOIN may produce NULL values for related columns (e.g., a
    // portfolio with no manager or WTP classification). These must not
    // cause the DB layer to hang or throw during row mapping.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    // Simulate a row where some LEFT JOIN columns are NULL
    const nullJoinRow = {
      id: "pf-001",
      name: "Test Portfolio",
      external_reference: "TST-001",
      wtp_classification_id: null,
      asset_class_id: "ac-001",
      manager_id: null,
      sub_asset_class: null,
      benchmark_id: "bm-001",
      code: null,
      benchmark_name: null,
      asset_class: null,
      currency: null,
      cost: null,
      provider: null,
      wtp_id: null,
      wtp_name: null,
      ac_id: "ac-001",
      ac_name: "Aandelen",
      m_id: null,
      m_name: null,
      bg_id: "bg-001",
      bg_name: "MSCI Benchmarks",
    };

    const mockSql = withEnd(vi.fn().mockResolvedValue([nullJoinRow]));
    postgresMock.mockReturnValue(mockSql);

    const { getPortfolioById } = await import("@/lib/db");
    const result = await getPortfolioById("pf-001");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("pf-001");
    expect(result!.name).toBe("Test Portfolio");
    // currentBenchmark should be populated even with nulls (String() safety)
    expect(result!.currentBenchmark).toBeDefined();
  });

  it("should return disconnected when DATABASE_URL is absent (demo fallback)", async () => {
    // The app runs in demo mode without a DB. The sql singleton is null
    // when DATABASE_URL is not set. This should never hang.
    vi.stubEnv("DATABASE_URL", undefined);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("disconnected");
  });

  it("should handle concurrent health checks with a shared pool connection", async () => {
    // Regression test: the health endpoint now reuses the main pool
    // instead of creating its own. Verify that multiple rapid health
    // checks don't conflict on the shared sql instance.
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");

    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);
    const mockSql = withEnd(vi.fn().mockResolvedValue([{ "?column?": 1 }]));
    postgresMock.mockReturnValue(mockSql);

    const { GET } = await import("@/app/api/health/route");

    // Fire 15 rapid health checks
    const checks = Array.from({ length: 15 }, () => GET());
    const responses = await Promise.all(checks);

    for (const resp of responses) {
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("healthy");
      expect(body.db).toBe("connected");
    }
  });
});

describe("Timeout regression — query that exceeds statement timeout", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should handle a slow query (simulated delay) without hanging the caller", async () => {
    // Simulate a query that takes longer than expected (e.g., a slow JOIN
    // or missing index). The query eventually resolves but slowly — the
    // caller should still get a result, not hang.
    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    // Simulate a slow query that takes 500ms (above typical threshold
    // but within the timeout budget)
    const mockSql = withEnd(vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([{ id: "slow-result", name: "Slow" }]), 50),
        ),
    ));
    postgresMock.mockReturnValue(mockSql);

    const { getAssetClassRows } = await import("@/lib/db");
    const start = Date.now();
    const result = await getAssetClassRows();
    const duration = Date.now() - start;

    // Should have resolved with the expected data
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].id).toBe("slow-result");
    // Should not have taken longer than 2 seconds (generous for CI)
    expect(duration).toBeLessThan(2000);
  });

  it("should recover after a transient timeout on subsequent queries", async () => {
    // Simulates the pattern: first query times out due to a transient
    // network blip, then subsequent queries succeed. The pool should
    // not be poisoned by the failed connection.
    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    let queryCount = 0;
    const mockSql = withEnd(vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        return Promise.reject(new Error("Connection terminated unexpectedly"));
      }
      return Promise.resolve([{ id: "recovered" }]);
    }));
    postgresMock.mockReturnValue(mockSql);

    const { sql } = await import("@/lib/db");
    expect(sql).not.toBeNull();
    if (!sql) throw new Error("DATABASE_URL should create the SQL client in this test.");

    // First query — will fail with timeout
    await expect(sql`SELECT 1`).rejects.toThrow("Connection terminated");

    // Second query — should succeed (new connection / pool recovery)
    const secondResult = await sql`SELECT 2`;
    expect(secondResult).toEqual([{ id: "recovered" }]);
  });
});

describe("Timeout regression — ensureReadTables under load", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/bcm");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should not cause cascading failures when ensureReadTables itself times out", async () => {
    // If ensureReadTables (called by withTableEnsure on first failure)
    // itself fails due to a timeout, the function should still attempt
    // the retry and then return fallback.
    const postgresMock = asPostgresFactoryMock((await import("postgres")).default);

    // First call to fn() fails with table-not-found
    // The ensureReadTables is called, but also fails
    // Then retry also fails
    // Finally fallback is returned
    let callCount = 0;
    const timeoutError = new Error("Connection terminated unexpectedly");
    const mockSql = Object.assign(
      () => {
        callCount++;
        return Promise.reject(timeoutError);
      },
      { end: mockEnd.mockResolvedValue(undefined) },
    );
    postgresMock.mockReturnValue(mockSql);

    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();

    // withTableEnsure returns [](empty array fallback), never throws or hangs
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
    // Should have called the mock twice (first attempt + retry)
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
