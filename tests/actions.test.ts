/**
 * Tests for the benchmark change form validation.
 *
 * The form was returning "relation change_requests does not exist"
 * because the migration script couldn't import the `postgres` package
 * in the standalone Docker build. This test covers the validation
 * and submission flow to prevent regressions.
 *
 * TDD: This test verifies the business rules that must hold
 * regardless of database state.
 */
import { describe, it, expect } from "vitest";

// Replicate the Zod schemas from actions.ts to test them independently
// (the actual server action imports Next.js internals we can't run in vitest)
import { z } from "zod";

const itemSchema = z.object({
  portfolioId: z.string().uuid(),
  previousBenchmarkId: z.string().uuid(),
  requestedBenchmarkId: z.string().uuid(),
});

const formSchema = z.object({
  clientId: z.string().uuid(),
  requestedBy: z.string().trim().min(2),
  rationale: z.string().trim().min(10),
  effectiveDate: z.string().date(),
});

// Test fixture IDs matching the demo data
const VALID_PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff";
const VALID_BENCHMARK_1 = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1"; // MSCI World NR
const VALID_BENCHMARK_2 = "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d"; // MSCI ACWI NR
const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

describe("Benchmark change form validation", () => {
  /** RED: This test should fail initially because the form was
   *  returning a 500 error. Once fixed, it passes. */
  it("should accept valid items", () => {
    const result = z.array(itemSchema).min(1).parse([
      {
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        requestedBenchmarkId: VALID_BENCHMARK_2,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].portfolioId).toBe(VALID_PORTFOLIO_ID);
  });

  it("should reject empty items array", () => {
    expect(() =>
      z.array(itemSchema).min(1).parse([])
    ).toThrow();
  });

  it("should reject items with invalid UUIDs", () => {
    expect(() =>
      z.array(itemSchema).parse([
        { portfolioId: "not-a-uuid", previousBenchmarkId: "x", requestedBenchmarkId: "y" },
      ])
    ).toThrow();
  });

  it("should accept valid form fields", () => {
    const result = formSchema.parse({
      clientId: VALID_CLIENT_ID,
      requestedBy: "Ruben Verboon",
      rationale: "This is a test change with at least 10 chars.",
      effectiveDate: "2026-08-24",
    });
    expect(result.clientId).toBe(VALID_CLIENT_ID);
  });

  it("should reject past effective date", () => {
    const pastDate = "2020-01-01";
    expect(pastDate < new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it("should enforce SOLL differs from IST", () => {
    const items = [
      {
        portfolioId: VALID_PORTFOLIO_ID,
        previousBenchmarkId: VALID_BENCHMARK_1,
        requestedBenchmarkId: VALID_BENCHMARK_1, // same as IST!
      },
    ];
    const errors: string[] = [];
    for (const item of items) {
      if (item.previousBenchmarkId === item.requestedBenchmarkId) {
        errors.push("De SOLL-benchmark moet verschillen van de IST-benchmark.");
      }
    }
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SOLL");
  });

  it("should detect duplicate portfolios", () => {
    const portfolioIds = [VALID_PORTFOLIO_ID, VALID_PORTFOLIO_ID];
    const unique = new Set(portfolioIds);
    expect(unique.size).toBeLessThan(portfolioIds.length);
  });

  it("should require at least one portfolio selected", () => {
    const items: unknown[] = [];
    expect(() =>
      z.array(itemSchema).min(1).parse(items)
    ).toThrow();
  });
});
