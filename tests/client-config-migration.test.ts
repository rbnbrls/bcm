import { describe, it, expect } from "vitest";
import {
  migrateLegacyAccount,
  type LegacyAccountRow,
  type MigrationResult,
} from "@/lib/client-config-migration";
import { demoClientConfigReferenceData } from "@/lib/fixtures";

// ── Test data ──────────────────────────────────────────────────────────────

const legacyAccountRows: LegacyAccountRow[] = [
  {
    primaryAccountId: "HOR-RP_ACX_EIGEN",
    portfolioCode: "HOR-RP",
    assetClassName: "EQUITIES",
    subAssetClassName: "AC WORLD",
    managerCode: "EIGEN",
    benchmarkCode: "MSCI-WORLD-NR",
    npcClassificationName: "Geen NPC",
    longName: "Horizon Rendement Aandelen Wereldwijd",
    shortName: "HOR-RP EQ ACW",
    effectiveFrom: "2024-01-01",
    effectiveUntil: null,
    activeInd: true,
  },
  {
    primaryAccountId: "HOR-MP_SOV_EIGEN",
    portfolioCode: "HOR-MP",
    assetClassName: "FIXED_INCOME",
    subAssetClassName: "SOVEREIGN EUROPE",
    managerCode: "EIGEN",
    benchmarkCode: "BLOOMBERG-EU-AGG",
    npcClassificationName: "Geen NPC",
    longName: "Horizon Matching Overheid Europa",
    shortName: "HOR-MP FI SOV",
    effectiveFrom: "2024-01-01",
    effectiveUntil: null,
    activeInd: true,
  },
  {
    primaryAccountId: "ZEK-RET_DEV_EXT_A",
    portfolioCode: "ZEK-RET",
    assetClassName: "EQUITIES",
    subAssetClassName: "DEVELOPED MARKETS",
    managerCode: "EXT_A",
    benchmarkCode: "MSCI-ACWI-NR",
    npcClassificationName: "Geen NPC",
    longName: "Zeker Return Ontwikkelde Markten",
    shortName: "ZEK-RET EQ DEV",
    effectiveFrom: "2024-06-01",
    effectiveUntil: null,
    activeInd: true,
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("migrateLegacyAccount", () => {
  it("transforms a single valid legacy row to a portfolio_configuration row", () => {
    const input: LegacyAccountRow[] = [legacyAccountRows[0]];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.errors).toHaveLength(0);
    expect(result.configurations).toHaveLength(1);

    const cfg = result.configurations[0];
    expect(cfg.primaryAccountId).toBe("HOR-RP_EQACX_EIGEN");
    expect(cfg.portfolioCode).toBe("HOR-RP");
    expect(cfg.assetClassCode).toBe("EQ");
    expect(cfg.subAssetClassCode).toBe("ACX");
    expect(cfg.managerCode).toBe("EIGEN");
    expect(cfg.benchmarkCode).toBe("MSCI-WORLD-NR");
    expect(cfg.longName).toBe("Horizon Rendement Aandelen Wereldwijd");
    expect(cfg.shortName).toBe("HOR-RP EQ ACW");
    expect(cfg.activeInd).toBe(true);
    expect(cfg.effectiveFrom).toBe("2024-01-01");
    expect(cfg.effectiveUntil).toBeNull();
  });

  it("transforms multiple legacy rows correctly", () => {
    const result = migrateLegacyAccount(legacyAccountRows, demoClientConfigReferenceData);

    expect(result.errors).toHaveLength(0);
    expect(result.configurations).toHaveLength(3);

    const codes = result.configurations.map((c) => c.primaryAccountId);
    expect(codes).toContain("HOR-RP_EQACX_EIGEN");
    expect(codes).toContain("HOR-MP_FISOV_EIGEN");
    expect(codes).toContain("ZEK-RET_EQDEV_EXT_A");
  });

  it("rejects unknown asset class name", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], assetClassName: "UNKNOWN_CLASS" },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("UNKNOWN_CLASS");
  });

  it("rejects unknown sub-asset class for given asset class", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], subAssetClassName: "NONEXISTENT" },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("NONEXISTENT");
  });

  it("rejects unknown manager code", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], managerCode: "ZZZ" },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("ZZZ");
  });

  it("rejects unknown benchmark code", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], benchmarkCode: "UNKNOWN-BENCH" },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("UNKNOWN-BENCH");
  });

  it("rejects unknown NPC classification name", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], npcClassificationName: "Unknown NPC" },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Unknown NPC");
  });

  it("detects duplicate primary account IDs and excludes duplicates", () => {
    // Both rows have identical dimension codes -> same canonical primary_account_id
    const input: LegacyAccountRow[] = [
      legacyAccountRows[0],
      {
        ...legacyAccountRows[0],
        primaryAccountId: "DUPLICATE_LEGACY_ID",
        longName: "Duplicate long name",
        shortName: "DUP",
      },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    // Both rows produce the same primary_account_id -> one gets a duplicate warning
    expect(result.configurations).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.includes("Duplicate") || w.includes("duplicate"))).toBe(true);
  });

  it("detects missing required fields", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], portfolioCode: "" },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("generates rollback contract with original values", () => {
    const result = migrateLegacyAccount(legacyAccountRows, demoClientConfigReferenceData);

    expect(result.rollback).toBeDefined();
    expect(result.rollback!.length).toBe(3);
    expect(result.rollback![0].originalPrimaryAccountId).toBe(legacyAccountRows[0].primaryAccountId);
    expect(result.rollback![0].rollbackAction).toBe("DELETE");
  });

  it("handles empty input gracefully", () => {
    const result = migrateLegacyAccount([], demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.rollback).toHaveLength(0);
  });

  it("rejects longName exceeding 255 characters", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], longName: "X".repeat(256) },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain("longName");
  });

  it("rejects shortName exceeding 100 characters", () => {
    const input: LegacyAccountRow[] = [
      { ...legacyAccountRows[0], shortName: "X".repeat(101) },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toContain("shortName");
  });

  it("rejects effectiveFrom after effectiveUntil", () => {
    const input: LegacyAccountRow[] = [
      {
        ...legacyAccountRows[0],
        effectiveFrom: "2024-12-31",
        effectiveUntil: "2024-01-01",
      },
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(0);
    expect(result.errors.some((e) => e.includes("effective"))).toBe(true);
  });

  it("processes mixed valid/invalid rows — valid ones pass, invalid ones report errors", () => {
    const input: LegacyAccountRow[] = [
      legacyAccountRows[0],  // valid
      { ...legacyAccountRows[1], assetClassName: "BOGUS" },  // invalid
      legacyAccountRows[2],  // valid
    ];
    const result = migrateLegacyAccount(input, demoClientConfigReferenceData);

    expect(result.configurations).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("BOGUS");
  });
});
