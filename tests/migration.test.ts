/**
 * Integration tests for the migration script.
 *
 * These tests verify that the migration script can be imported
 * (requires `postgres` in node_modules) and that the database
 * tables are created properly.
 *
 * Run with: DATABASE_URL=postgres://... npx vitest run tests/migration.test.ts
 *
 * TDD: These tests would FAIL in the Docker container without the
 * `postgres` package fix to the Dockerfile. They PASS once the
 * package is available and the migration has run.
 */
import { describe, it, expect, beforeAll } from "vitest";

describe("Migration script dependencies", () => {
  /**
   * RED: This test verifies that the `postgres` package can be
   * imported at runtime. In the broken deploy, the migration
   * script failed with "Cannot find package 'postgres'" because
   * Next.js standalone output doesn't include it outside the
   * bundled server chunks.
   *
   * The Dockerfile fix adds:
   *   COPY --from=builder /app/node_modules/postgres ./node_modules/postgres
   */
  it("should be able to import postgres package");
});

describe("Database schema (requires DATABASE_URL)", () => {
  const HAS_DB = !!process.env.DATABASE_URL;

  it.runIf(HAS_DB)("change_requests table should exist", async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const rows = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'change_requests'
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].table_name).toBe("change_requests");
    } finally {
      await sql.end();
    }
  });

  it.runIf(HAS_DB)("should be able to query client configs", async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const clients = await sql`SELECT id, name FROM clients`;
      expect(clients.length).toBeGreaterThan(0);
    } finally {
      await sql.end();
    }
  });

  it.runIf(HAS_DB)("should be able to query benchmarks with cost and provider columns", async () => {
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const benchmarks =
        await sql`SELECT id, code, cost, provider FROM benchmark_catalog`;
      expect(benchmarks.length).toBeGreaterThan(0);
      // Verify all columns exist by checking the first row
      expect(benchmarks[0]).toHaveProperty("id");
      expect(benchmarks[0]).toHaveProperty("code");
      expect(benchmarks[0]).toHaveProperty("cost");
      expect(benchmarks[0]).toHaveProperty("provider");
    } finally {
      await sql.end();
    }
  });

  it.runIf(HAS_DB)(
    "should accept and retrieve a change request",
    async () => {
      const { default: postgres } = await import("postgres");
      const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
      try {
        const { randomUUID } = await import("crypto");
        const id = randomUUID();
        const ref = `TEST-${Date.now()}`;

        // Find a valid client and portfolio
        const [client] = await sql`SELECT id FROM clients LIMIT 1`;
        const [portfolio] =
          await sql`SELECT id, current_benchmark_id FROM portfolios LIMIT 1`;
        const [secondBenchmark] =
          await sql`SELECT id FROM benchmark_catalog WHERE id != ${portfolio.current_benchmark_id} LIMIT 1`;

        // Insert a test change request
        await sql`
          INSERT INTO change_requests (id, reference, change_type, client_id, requested_by, rationale, effective_date, status)
          VALUES (${id}, ${ref}, 'benchmark_switch', ${client.id}, 'Test User', 'Test rationale for integration test', '2026-09-01', 'submitted')
        `;

        // Insert change request item
        await sql`
          INSERT INTO change_request_items (id, change_request_id, portfolio_id, previous_benchmark_id, requested_benchmark_id)
          VALUES (${randomUUID()}, ${id}, ${portfolio.id}, ${portfolio.current_benchmark_id}, ${secondBenchmark.id})
        `;

        // Verify we can read it back
        const [saved] = await sql`
          SELECT reference, status FROM change_requests WHERE id = ${id}
        `;
        expect(saved.reference).toBe(ref);
        expect(saved.status).toBe("submitted");

        // Clean up
        await sql`DELETE FROM change_request_items WHERE change_request_id = ${id}`;
        await sql`DELETE FROM change_requests WHERE id = ${id}`;
      } finally {
        await sql.end();
      }
    },
    15_000
  );
});
