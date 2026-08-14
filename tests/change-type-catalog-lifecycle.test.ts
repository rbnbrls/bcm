/**
 * Catalog contract for change types.
 *
 * The user-facing/admin change catalog exposes only the benchmark switch.
 * Historical/internal definitions remain available through direct slug lookup
 * so existing change requests and processors can still resolve their metadata.
 */
import { describe, it, expect } from "vitest";
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
