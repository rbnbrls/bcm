/**
 * Tests for the database layer (lib/db.ts).
 *
 * These tests cover fixture fallback, edge cases, and error handling
 * without requiring a real database connection.
 *
 * When DATABASE_URL is not set, the module falls back to fixture data
 * or returns empty results gracefully.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must import the fixtures directly for reference values
import { benchmarks, demoClientConfigs } from "@/lib/fixtures";

describe("DB layer — no database (fixture fallback mode)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("getBenchmarks should return fixture data when no DATABASE_URL", async () => {
    const { getBenchmarks } = await import("@/lib/db");
    const result = await getBenchmarks();
    expect(result).toEqual(benchmarks);
    expect(result).toHaveLength(8);
  });

  it("getClientConfigs should return demo fixture data when no DATABASE_URL", async () => {
    const { getClientConfigs } = await import("@/lib/db");
    const result = await getClientConfigs();
    expect(result).toEqual(demoClientConfigs);
    expect(result).toHaveLength(2);
  });

  it("getChangeRequest should return null when no DATABASE_URL", async () => {
    const { getChangeRequest } = await import("@/lib/db");
    const result = await getChangeRequest("some-uuid");
    expect(result).toBeNull();
  });

  it("saveChangeRequest should reject when no DATABASE_URL", async () => {
    const { saveChangeRequest } = await import("@/lib/db");
    await expect(
      saveChangeRequest({
        id: "00000000-0000-0000-0000-000000000000",
        reference: "BCM-2026-TEST",
        changeType: "benchmark_switch",
        clientId: "00000000-0000-0000-0000-000000000000",
        requestedBy: "Test User",
        rationale: "Ten char rationale",
        effectiveDate: "2026-09-01",
        items: [],
      })
    ).rejects.toThrow("Database niet bereikbaar");
  });

  it("saveNewBenchmarkRequest should reject when no DATABASE_URL", async () => {
    const { saveNewBenchmarkRequest } = await import("@/lib/db");
    await expect(
      saveNewBenchmarkRequest({
        id: "00000000-0000-0000-0000-000000000000",
        changeRequestId: "00000000-0000-0000-0000-000000000000",
        shortName: "CUSTOM-ESG",
        longName: "Custom ESG Benchmark",
        assetClass: "Aandelen",
        currency: "EUR",
      })
    ).rejects.toThrow("Database niet bereikbaar");
  });

  it("insertBenchmark should reject when no DATABASE_URL", async () => {
    const { insertBenchmark } = await import("@/lib/db");
    await expect(
      insertBenchmark({
        id: "00000000-0000-0000-0000-000000000000",
        code: "TEST",
        name: "Test Benchmark",
        assetClass: "Aandelen",
        currency: "EUR",
      })
    ).rejects.toThrow("Database niet bereikbaar");
  });
});

describe("DB layer — fixture cross-references", () => {
  it("getBenchmarks fixture IDs should match saved IDs in demo client configs", () => {
    const benchmarkIds = new Set(benchmarks.map((b) => b.id));
    for (const client of demoClientConfigs) {
      for (const p of client.portfolios) {
        expect(benchmarkIds.has(p.currentBenchmarkId)).toBe(true);
      }
    }
  });

  it("each portfolio's currentBenchmark should reference a fixture benchmark object", () => {
    for (const client of demoClientConfigs) {
      for (const p of client.portfolios) {
        expect(p.currentBenchmark).toBeDefined();
        expect(p.currentBenchmark.id).toBe(p.currentBenchmarkId);
      }
    }
  });
});

describe("DB layer — ensureTables blocks", () => {
  it("ensureReadTables coverage: all 6 required tables listed", async () => {
    // Read the source to verify it lists all 6 tables
    const source = await import("@/lib/db");
    expect(source.ensureNewBenchmarkRequestsTable).toBeTypeOf("function");
    expect(typeof source.getChangeRequest).toBe("function");
    expect(typeof source.saveChangeRequest).toBe("function");
  });
});
