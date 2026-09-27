/**
 * Tests for fixture data integrity.
 *
 * Verifies that the hardcoded benchmark and client fixtures
 * are structurally valid and self-consistent (e.g., portfolio
 * currentBenchmarkId references an actual benchmark).
 */
import { describe, it, expect } from "vitest";
import { benchmarks, demoClientConfigs, wtpClassifications } from "@/lib/fixtures";

describe("Benchmark fixtures", () => {
  it("should have at least 10 benchmarks (currently 12)", () => {
    expect(benchmarks.length).toBeGreaterThanOrEqual(10);
  });

  it("should have exactly 17 benchmarks", () => {
    expect(benchmarks).toHaveLength(17);
  });

  it("each benchmark should have all required fields", () => {
    for (const b of benchmarks) {
      expect(b.id).toBeTypeOf("string");
      expect(b.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(b.code).toBeTypeOf("string");
      expect(b.name).toBeTypeOf("string");
      expect(b.assetClass).toBeTypeOf("string");
      expect(b.currency).toBeTypeOf("string");
      expect(b.cost).toBeTypeOf("number");
      expect(b.provider).toBeTypeOf("string");
    }
  });

  it("each benchmark should have a unique ID", () => {
    const ids = benchmarks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each benchmark should have a unique code", () => {
    const codes = benchmarks.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("should cover multiple asset classes", () => {
    const classes = new Set(benchmarks.map((b) => b.assetClass));
    expect(classes.has("Aandelen")).toBe(true);
    expect(classes.has("Obligaties")).toBe(true);
    expect(classes.has("Alternatieven")).toBe(true);
    expect(classes.has("Vastgoed")).toBe(true);
    expect(classes.has("Grondstoffen")).toBe(true);
    expect(classes.has("Infrastructuur")).toBe(true);
  });

  it("should include USD benchmarks to diversify currency coverage", () => {
    const usdBenchmarks = benchmarks.filter((b) => b.currency === "USD");
    expect(usdBenchmarks.length).toBeGreaterThanOrEqual(3);
  });

  it("should not be empty — catalog must always have data", () => {
    expect(benchmarks.length).toBeGreaterThan(0);
    expect(benchmarks).not.toHaveLength(0);
  });
});

describe("Client config fixtures", () => {
  it("should have 2 demo clients", () => {
    expect(demoClientConfigs).toHaveLength(2);
  });

  it("each client should have a valid structure", () => {
    for (const client of demoClientConfigs) {
      expect(client.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(client.name).toBeTypeOf("string");
      expect(client.externalReference).toBeTypeOf("string");
      expect(Array.isArray(client.portfolios)).toBe(true);
    }
  });

  it("should have 3 portfolios total", () => {
    const total = demoClientConfigs.reduce((s, c) => s + c.portfolios.length, 0);
    expect(total).toBe(3);
  });

  it("each portfolio should reference a valid benchmark", () => {
    const benchmarkIds = new Set(benchmarks.map((b) => b.id));
    for (const client of demoClientConfigs) {
      for (const p of client.portfolios) {
        expect(benchmarkIds.has(p.currentBenchmarkId)).toBe(true);
        expect(p.currentBenchmark).toBeDefined();
        expect(p.currentBenchmark.id).toBe(p.currentBenchmarkId);
      }
    }
  });

  it("each portfolio should have unique external references", () => {
    const refs = demoClientConfigs.flatMap((c) =>
      c.portfolios.map((p) => p.externalReference)
    );
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe("WTP classification fixtures", () => {
  it("include the default assignable WTP classifications", () => {
    expect(wtpClassifications.map((classification) => classification.name).sort()).toEqual([
      "CVP",
      "Matching",
      "Opbouw",
      "Rendement",
      "Rente",
      "Reserve",
    ]);
  });
});
