/**
 * Tests for the normalized client_config data access layer (lib/client-config-db.ts).
 *
 * These tests verify fallback behaviour and type-safe mapping when no real
 * database is available, plus the schema-aligned UUID change_request_id shape.
 */
import { describe, it, expect } from "vitest";
import {
  getClientConfigPortfolioConfigurations,
  getClientConfigReferenceData,
  getClientConfigPortfolioConfigurationById,
  saveChangePortfolioConfiguration,
} from "@/lib/client-config-db";

describe("client-config-db — no database (fallback mode)", () => {
  it("getClientConfigPortfolioConfigurations returns empty array when no DATABASE_URL", async () => {
    const rows = await getClientConfigPortfolioConfigurations();
    expect(rows).toEqual([]);
  });

  it("getClientConfigReferenceData returns empty reference data when no DATABASE_URL", async () => {
    const data = await getClientConfigReferenceData();
    expect(data).toEqual({
      portfolios: [],
      assetClasses: [],
      subAssetClasses: [],
      managers: [],
      benchmarks: [],
      npcClassifications: [],
    });
  });

  it("getClientConfigPortfolioConfigurationById returns null when no DATABASE_URL", async () => {
    const row = await getClientConfigPortfolioConfigurationById("ADP_FIHYG_ROB");
    expect(row).toBeNull();
  });

  it("saveChangePortfolioConfiguration throws when no DATABASE_URL", async () => {
    await expect(
      saveChangePortfolioConfiguration({
        changeRequestId: "00000000-0000-0000-0000-000000000000",
        actionType: "CREATE",
        portfolioCode: "ADP",
        assetClassCode: "FI",
        subAssetClassCode: "HYG",
        managerCode: "ROB",
        benchmarkCode: "MSCI-WORLD-NR",
        npcClassificationId: 1,
        longName: "Test portfolio",
        shortName: "TEST",
        effectiveFrom: "2026-01-01",
        effectiveUntil: null,
      }),
    ).rejects.toThrow("Database not available");
  });
});
