/**
 * Catalog contract for change types.
 *
 * The user-facing/admin change catalog exposes only the benchmark switch.
 * Historical/internal definitions remain available through direct slug lookup
 * so existing change requests and processors can still resolve their metadata.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CHANGE_TYPE_CONFIGS, getChangeTypeBySlug, getChangeTypes } from "@/lib/db";

describe("change catalog exposes only benchmark switch", () => {
  it("returns only benchmark_switch from getChangeTypes", async () => {
    const types = await getChangeTypes();
    expect(types.map((type) => type.slug)).toEqual(["benchmark_switch"]);
    expect(types[0]).toMatchObject({
      name: "Benchmarkwissel",
      category: "benchmark",
      active: true,
      workflow: "benchmark_switch",
    });
  });

  it("keeps legacy/internal definitions out of the catalog list", async () => {
    const catalogSlugs = (await getChangeTypes()).map((type) => type.slug);
    expect(catalogSlugs).not.toContain("new_benchmark");
    expect(catalogSlugs).not.toContain("portfolio_configuration_create");
    expect(catalogSlugs).not.toContain("portfolio_configuration_update");
    expect(catalogSlugs).not.toContain("portfolio_configuration_retire");
    expect(catalogSlugs).not.toContain("client_onboarding");
  });

  it("keeps direct slug resolution for historical change metadata", async () => {
    expect(DEFAULT_CHANGE_TYPE_CONFIGS.some((type) => type.slug === "portfolio_configuration_retire")).toBe(true);

    const retire = await getChangeTypeBySlug("portfolio_configuration_retire");
    expect(retire).not.toBeNull();
    expect(retire!.name).toBe("Portefeuilleconfiguratie beëindigen");
  });
});

describe("GET /api/change-types/[id]/flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves the benchmark switch process flow", async () => {
    const { GET } = await import("@/app/api/change-types/[id]/flow/route");

    const request = new Request("http://localhost:3000/api/change-types/benchmark_switch/flow");
    const response = await GET(request, { params: Promise.resolve({ id: "benchmark_switch" }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changeType.slug).toBe("benchmark_switch");
    expect(body.changeType.name).toBe("Benchmarkwissel");
    expect(body.flow.length).toBeGreaterThan(0);
    expect(body.flow[0].stepOrder).toBe(1);
  });
});
