/**
 * Regression test for the workflow-runtime tracking change request client
 * mapping (kanban t_1bcd4e58).
 *
 * Root cause: createWorkflowRuntimeTrackingChangeRequest resolves the legacy
 * `clients.id` from the workflow's client scope via resolveWorkflowTrackingClientId.
 * The scope entries are client_config client CODES (e.g. "HOR"), but the resolver
 * only matched legacy clients.id (UUID) or external_reference (PF-HOR-001) — never
 * the code. It then fell back to `SELECT id FROM clients ORDER BY name LIMIT 1`,
 * attaching the runtime-created change request to the alphabetically-first client
 * (Algemeen Pensioenfonds Bouw) instead of the client that actually scoped the
 * workflow (Pensioenfonds Horizon). Observed live: POST /api/workflows/benchmark-change
 * with clientCode HOR created change request WF-2026-5C17266A under client
 * a0000000-...-000000000005 (BOU) instead of 9f9280fc-... (HOR).
 *
 * Fix: resolveWorkflowTrackingClientId now maps unmatched candidates through
 * getPublicClientIdByCode (external_reference ILIKE 'PF-<CODE>-%') before the
 * alphabetical fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown[]>();
const unmatchedSqlLog: string[] = [];
const changeRequestInserts: unknown[][] = [];

function onQuery(pattern: RegExp, handler: (sql: string, params: unknown[]) => unknown[]) {
  queryHandlers.set(pattern.source, handler);
}

function clearQueryHandlers() {
  queryHandlers.clear();
  unmatchedSqlLog.length = 0;
}

vi.mock("postgres", () => {
  const handlerFn = (strings: unknown, ...values: unknown[]) => {
    if (typeof strings === "string") {
      return { type: "ident" as const, value: strings };
    }
    const parts = strings as TemplateStringsArray;
    let reconstructed = parts[0];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v && typeof v === "object" && "type" in (v as any) && (v as any).type === "ident") {
        reconstructed += (v as any).value;
      } else {
        reconstructed += `$${i + 1}`;
      }
      reconstructed += parts[i + 1];
    }

    if (/INSERT INTO change_requests/i.test(reconstructed)) {
      changeRequestInserts.push(values);
    }

    const entries = [...queryHandlers.entries()];
    for (const [patternSource, handler] of entries) {
      try {
        const pattern = new RegExp(patternSource, "is");
        if (pattern.test(reconstructed)) {
          return Promise.resolve(handler(reconstructed, values));
        }
      } catch {
        // skip invalid patterns
      }
    }

    unmatchedSqlLog.push(reconstructed.substring(0, 200));
    return Promise.resolve([]);
  };

  const sql = Object.assign(handlerFn, {
    begin: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });

  return { default: vi.fn(() => sql) };
});

beforeEach(() => {
  changeRequestInserts.length = 0;
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
  clearQueryHandlers();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const HOR_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
const BOU_CLIENT_ID = "a0000000-0000-4000-a000-000000000005";

function commonHandlers() {
  onQuery(/SELECT id FROM change_type_config WHERE/i, () => [{ id: "63985c89-9b7a-4d12-90e4-30280f577c40" }]);
  onQuery(/SELECT COUNT\(\*\)::int AS cnt FROM change_type_config/i, () => [{ cnt: 1 }]);
  onQuery(/CREATE TABLE IF NOT EXISTS/i, () => []);
  onQuery(/ALTER TABLE/i, () => []);
}

describe("createWorkflowRuntimeTrackingChangeRequest client scope mapping (t_1bcd4e58)", () => {
  it("maps a client-code scope (HOR) to the correct legacy clients.id via PF-<CODE>-%", async () => {
    // First lookup: scope candidates HOR match neither id::text nor external_reference.
    onQuery(/SELECT id FROM clients\s+WHERE id::text = ANY/i, () => []);
    // Code mapping: PF-HOR-% matches Pensioenfonds Horizon.
    onQuery(/external_reference ILIKE/i, () => [{ id: HOR_CLIENT_ID }]);
    commonHandlers();

    const { createWorkflowRuntimeTrackingChangeRequest } = await import("@/lib/db");
    const changeRequestId = await createWorkflowRuntimeTrackingChangeRequest({
      workflowInstanceId: "e6fd20dd-a3a1-46aa-b6b8-3fe0c859dbe3",
      workflowVersionId: "95a285b3-fe14-4783-b058-1c37d8b73403",
      definitionId: "060f70fc-161f-4e6f-a437-e54eb0101edd",
      slug: "benchmark-wijziging",
      name: "Benchmarkwijziging",
      description: "Benchmarkwijziging op een bestaande portefeuilleconfiguratie",
      clientIds: ["HOR"],
      requestedBy: "e2e:change_manager",
      values: {
        portfolio_id: "HOR*EQACX*EIG",
        requested_benchmark_id: "BLOOMBERG-EU-AGG",
        effective_date: "2026-09-19",
        rationale: "E2E happy-path creation test",
      },
      occurredAt: "2026-08-20T23:52:22.954Z",
    });

    expect(changeRequestId).toBeTruthy();
    expect(changeRequestInserts.length).toBeGreaterThan(0);
    // INSERT INTO change_requests params order:
    // id, reference, change_type, change_type_id, client_id, requested_by, ...
    const clientIdParam = changeRequestInserts[0][4];
    expect(clientIdParam).toBe(HOR_CLIENT_ID);
    expect(clientIdParam).not.toBe(BOU_CLIENT_ID);
  });

  it("does not regress: a direct external_reference scope match still wins", async () => {
    // Direct match: scope already contains PF-HOR-001.
    onQuery(/SELECT id FROM clients\s+WHERE id::text = ANY/i, () => [{ id: HOR_CLIENT_ID }]);
    commonHandlers();

    const { createWorkflowRuntimeTrackingChangeRequest } = await import("@/lib/db");
    const changeRequestId = await createWorkflowRuntimeTrackingChangeRequest({
      workflowInstanceId: "e6fd20dd-a3a1-46aa-b6b8-3fe0c859dbe3",
      workflowVersionId: "95a285b3-fe14-4783-b058-1c37d8b73403",
      definitionId: "060f70fc-161f-4e6f-a437-e54eb0101edd",
      slug: "benchmark-wijziging",
      name: "Benchmarkwijziging",
      description: "Benchmarkwijziging op een bestaande portefeuilleconfiguratie",
      clientIds: ["PF-HOR-001"],
      requestedBy: "e2e:change_manager",
      values: { requested_benchmark_id: "BLOOMBERG-EU-AGG" },
      occurredAt: "2026-08-20T23:52:22.954Z",
    });

    expect(changeRequestId).toBeTruthy();
    expect(changeRequestInserts.length).toBeGreaterThan(0);
    expect(changeRequestInserts[0][4]).toBe(HOR_CLIENT_ID);
  });
});
