import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryHandlers = new Map<string, (sql: string, params: unknown[]) => unknown[]>();
const matchedSql: string[] = [];

function onQuery(pattern: RegExp, handler: (sql: string, params: unknown[]) => unknown[]) {
  queryHandlers.set(pattern.source, handler);
}

vi.mock("postgres", () => {
  const handlerFn = (strings: unknown, ...values: unknown[]) => {
    if (typeof strings === "string") return { type: "ident" as const, value: strings };

    const parts = strings as TemplateStringsArray;
    let reconstructed = parts[0];
    for (let i = 0; i < values.length; i++) {
      reconstructed += `$${i + 1}${parts[i + 1]}`;
    }

    for (const [patternSource, handler] of queryHandlers.entries()) {
      const pattern = new RegExp(patternSource, "is");
      if (pattern.test(reconstructed)) {
        matchedSql.push(reconstructed);
        return Promise.resolve(handler(reconstructed, values));
      }
    }

    return Promise.resolve([]);
  };

  const sql = Object.assign(handlerFn, {
    begin: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(handlerFn)),
    end: vi.fn().mockResolvedValue(undefined),
  });

  return { default: vi.fn(() => sql) };
});

beforeEach(() => {
  queryHandlers.clear();
  matchedSql.length = 0;
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://mock:***@localhost:5432/mock");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getClientConfigPortfolioConfigurations", () => {
  it("joins and maps the customer name for each portfolio row", async () => {
    onQuery(/FROM client_config\.portfolio_configuration pc/i, () => [
      {
        primary_account_id: "MET_EQ_DUU_EIG",
        client_code: "MET",
        client_name: "Metaal",
        portfolio_code: "METDP",
        parent_account_id: 1,
        parent_account_code: "MET-PARENT",
        asset_class_code: "EQ",
        asset_class_name: "Equities",
        sub_asset_class_code: "DUU",
        sub_asset_class_name: "Duurzaam",
        manager_code: "EIG",
        manager_name: "Eigen beheer",
        benchmark_code: "CUSTOM-ESG-NL",
        benchmark_name: "Custom ESG NL",
        npc_classification_id: 2,
        classification_name: "Return",
        long_name: "Metaal Duurzame Portefeuille",
        short_name: "MET EQ DUU",
        active_ind: true,
        effective_from: "2024-01-01",
        effective_until: null,
        change_request_id: null,
      },
    ]);

    const { getClientConfigPortfolioConfigurations } = await import("@/lib/client-config-db");

    const rows = await getClientConfigPortfolioConfigurations();

    expect(rows[0].clientName).toBe("Metaal");
    expect(matchedSql[0]).toContain("c.client_name");
    expect(matchedSql[0]).toContain("JOIN client_config.client c ON c.client_code = pc.client_code");
  });
});
