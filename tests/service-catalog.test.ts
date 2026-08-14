import { describe, expect, it } from "vitest";

import { getServiceCatalogModel } from "@/lib/service-catalog";

describe("service catalog", () => {
  it("builds the initial catalog from asset classes, sub asset classes and benchmarks", async () => {
    const model = await getServiceCatalogModel(new Date("2026-08-14T00:00:00.000Z"));

    expect(model.generatedAt).toBe("2026-08-14T00:00:00.000Z");
    expect(model.summary.assetClasses).toBeGreaterThan(0);
    expect(model.summary.subAssetClasses).toBeGreaterThan(0);
    expect(model.summary.benchmarks).toBeGreaterThan(0);
    expect(model.items.some((item) => item.type === "asset_class" && item.code === "EQ")).toBe(true);
    expect(model.items.some((item) => item.type === "sub_asset_class" && item.code === "ACX")).toBe(true);
    expect(model.items.some((item) => item.type === "benchmark" && item.code === "MSCI-WORLD-NR")).toBe(true);
  });

  it("uses portfolio_configuration primary_account_id as the client service basis", async () => {
    const model = await getServiceCatalogModel(new Date("2026-08-14T00:00:00.000Z"));

    expect(model.clientConfigurations.length).toBeGreaterThan(0);
    expect(model.clientConfigurations[0]).toHaveProperty("primaryAccountId");
    expect(model.clientConfigurations.every((row) => row.primaryAccountId.includes("*"))).toBe(true);
    expect(model.summary.configuredPrimaryAccounts).toBe(model.clientConfigurations.length);
  });

  it("connects sub asset classes to asset classes and configured benchmarks", async () => {
    const model = await getServiceCatalogModel(new Date("2026-08-14T00:00:00.000Z"));

    expect(model.relations.some((relation) => relation.relationType === "contains")).toBe(true);
    expect(model.relations.some((relation) => relation.relationType === "uses")).toBe(true);
  });
});
