import { describe, it, expect } from "vitest";
import {
  cleanseRecords,
  deduplicateRecords,
  validateAndEnrich,
  collectReferenceData,
  buildNormalizedPayload,
  buildRollbackContract,
  runMigration,
  type LegacyFlatRecord,
  type MigrationLogEntry,
} from "@/lib/client-config-migration";

// ═════════════════════════════════════════════════════════════════════
// cleanseRecords
// ═════════════════════════════════════════════════════════════════════

describe("cleanseRecords", () => {
  it("returns failure for non-array input", () => {
    const result = cleanseRecords(null as unknown as LegacyFlatRecord[]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Input is not an array");
    }
  });

  it("filters out records with missing required fields", () => {
    const input: LegacyFlatRecord[] = [
      { portfolioCode: "P1", assetClassName: "EQUITIES", subAssetClassName: "EUROPE", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01", active: true },
      { portfolioCode: "", assetClassName: "EQUITIES", subAssetClassName: "EUROPE", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01", active: true },
      { portfolioCode: "P2", assetClassName: "", subAssetClassName: "EUROPE", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01", active: true },
      { portfolioCode: "P3", assetClassName: "EQUITIES", subAssetClassName: "EUROPE", managerCode: "", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01", active: true },
    ];
    const result = cleanseRecords(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toHaveLength(1);
      expect(result.result[0].portfolioCode).toBe("P1");
    }
  });

  it("fills in defaults for optional fields", () => {
    const input: LegacyFlatRecord[] = [
      { portfolioCode: "P1", assetClassName: "EQUITIES", subAssetClassName: "EUROPE", managerCode: "ROB", managerName: "", benchmarkCode: "", benchmarkName: "", classification: "", longName: "", shortName: "", effectiveFrom: "2024-01-01" },
    ];
    const result = cleanseRecords(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result[0].managerName).toBe("ROB migrated manager");
      expect(result.result[0].benchmarkCode).toBe("LEGACY_MIGRATION_BENCH");
      expect(result.result[0].classification).toBe("Return");
      expect(result.result[0].longName).toBe("P1 EQUITIES ROB");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// deduplicateRecords
// ═════════════════════════════════════════════════════════════════════

describe("deduplicateRecords", () => {
  it("removes duplicate business keys", () => {
    const input: LegacyFlatRecord[] = [
      { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "SOVEREIGN GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01" },
      { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "SOVEREIGN GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01" },
    ];
    const result = deduplicateRecords(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toHaveLength(1);
    }
  });

  it("preserves distinct business keys", () => {
    const input: LegacyFlatRecord[] = [
      { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "SOVEREIGN GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01" },
      { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "HIGH YIELD GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01" },
    ];
    const result = deduplicateRecords(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toHaveLength(2);
    }
  });

  it("keeps first occurrence and drops later duplicates", () => {
    const first: LegacyFlatRecord = { portfolioCode: "X", assetClassName: "EQUITIES", subAssetClassName: "EUROPE", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark 1", classification: "Match", longName: "First", shortName: "F", effectiveFrom: "2024-01-01" };
    const duplicate: LegacyFlatRecord = { ...first, longName: "Duplicate", shortName: "D" };
    const result = deduplicateRecords([first, duplicate]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result[0].longName).toBe("First");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// validateAndEnrich
// ═════════════════════════════════════════════════════════════════════

describe("validateAndEnrich", () => {
  const validRecords: LegacyFlatRecord[] = [
    { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "SOVEREIGN GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "SOG_BENCH", benchmarkName: "Benchmark", classification: "Match", longName: "ADP SOG ROB Long", shortName: "ADP SOG ROB", effectiveFrom: "2024-01-01" },
  ];

  it("produces validated portfolio configurations", () => {
    const result = validateAndEnrich(validRecords);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.configurations).toHaveLength(1);
      expect(result.result.dropped).toBe(0);
      expect(result.result.configurations[0].primaryAccountId).toBe("ADP*FISOG*ROB");
    }
  });

  it("drops unknown asset/sub-asset combinations", () => {
    const input: LegacyFlatRecord[] = [
      { portfolioCode: "X1", assetClassName: "UNKNOWN_CLASS", subAssetClassName: "NOPE", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01" },
    ];
    const result = validateAndEnrich(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.configurations).toHaveLength(0);
      expect(result.result.dropped).toBe(1);
    }
  });

  it("records validation errors for invalid fields", () => {
    const input: LegacyFlatRecord[] = [
      { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "SOVEREIGN GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "SOG_BENCH", benchmarkName: "Benchmark", classification: "Match", longName: "A".repeat(256), shortName: "Short", effectiveFrom: "2024-01-01" },
    ];
    const result = validateAndEnrich(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.configurations).toHaveLength(0);
      expect(result.result.dropped).toBe(1);
      const failureLogs = result.log.filter((entry) => entry.step === "validate" && entry.status === "failure");
      expect(failureLogs.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// collectReferenceData
// ═════════════════════════════════════════════════════════════════════

describe("collectReferenceData", () => {
  it("returns unique reference records with synthetic IDs", () => {
    const input = [
      { primaryAccountId: "ADP*FISOG*ROB", clientCode: "ADP", portfolioCode: "ADP", assetClassCode: "FI", subAssetClassCode: "SOG", managerCode: "ROB", benchmarkCode: "SOG_BENCH", npcClassificationId: 1, longName: "ADP SOG ROB Long", shortName: "ADP SOG ROB", activeInd: true, effectiveFrom: new Date("2024-01-01"), effectiveUntil: null, changeRequestId: null, createdAt: new Date(), updatedAt: new Date() },
      { primaryAccountId: "ADP*FIHYG*ROB", clientCode: "ADP", portfolioCode: "ADP", assetClassCode: "FI", subAssetClassCode: "HYG", managerCode: "ROB", benchmarkCode: "HYG_BENCH", npcClassificationId: 1, longName: "ADP HYG ROB Long", shortName: "ADP HYG ROB", activeInd: true, effectiveFrom: new Date("2024-01-01"), effectiveUntil: null, changeRequestId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    const references = collectReferenceData(input);
    expect(references.portfolios).toHaveLength(1);
    expect(references.portfolios[0].portfolioCode).toBe("ADP");
    expect(references.assetClasses).toHaveLength(1);
    expect(references.managers).toHaveLength(1);
    expect(references.benchmarks).toHaveLength(2);
    expect(references.npcClassifications).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// buildNormalizedPayload / runMigration
// ═════════════════════════════════════════════════════════════════════

describe("buildNormalizedPayload", () => {
  it("returns a complete payload including rollback identifiers", () => {
    const payload = buildNormalizedPayload([
      { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "SOVEREIGN GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "SOG_BENCH", benchmarkName: "Benchmark", classification: "Match", longName: "ADP SOG ROB Long", shortName: "ADP SOG ROB", effectiveFrom: "2024-01-01" },
    ]);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.configurations).toHaveLength(1);
    expect(payload.result.portfolios).toHaveLength(1);
    expect(payload.result.assetClasses).toHaveLength(1);
    expect(payload.result.managers).toHaveLength(1);
    expect(payload.result.benchmarks).toHaveLength(1);
    expect(payload.result.npcClassifications.length).toBeGreaterThanOrEqual(1);
    expect(payload.result.droppedDuringValidation).toBe(0);
  });

  it("records a non-empty audit log", () => {
    const payload = buildNormalizedPayload([
      { portfolioCode: "P1", assetClassName: "EQUITIES", subAssetClassName: "EUROPE", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01" },
    ]);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.log.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildRollbackContract", () => {
  it("returns the primary account IDs to delete on rollback", () => {
    const configurations = [
      { primaryAccountId: "A", portfolioCode: "", assetClassCode: "", subAssetClassCode: "", managerCode: "", benchmarkCode: "", npcClassificationId: 1, longName: "", shortName: "", activeInd: true, effectiveFrom: new Date(), effectiveUntil: null, changeRequestId: null, createdAt: new Date(), updatedAt: new Date() },
      { primaryAccountId: "B", portfolioCode: "", assetClassCode: "", subAssetClassCode: "", managerCode: "", benchmarkCode: "", npcClassificationId: 1, longName: "", shortName: "", activeInd: true, effectiveFrom: new Date(), effectiveUntil: null, changeRequestId: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    const rollback = buildRollbackContract(configurations as any);
    expect(rollback.deleteConfigurationPrimaryAccountIds).toEqual(["A", "B"]);
  });
});

describe("runMigration", () => {
  it("returns dry-run payload and rollback plan", () => {
    const result = runMigration({
      legacyRecords: [
        { portfolioCode: "ADP", assetClassName: "FIXED_INCOME", subAssetClassName: "SOVEREIGN GLOBAL", managerCode: "ROB", managerName: "R", benchmarkCode: "B1", benchmarkName: "Benchmark", classification: "Match", longName: "Long", shortName: "Short", effectiveFrom: "2024-01-01", dryRun: true },
      ],
      existingNpcClassifications: [],
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.configurations).toHaveLength(1);
    expect(result.result.rollback.deleteConfigurationPrimaryAccountIds).toEqual(["ADP*FISOG*ROB"]);
    expect(result.log.some((entry) => entry.step === "rollback" && entry.message?.includes("Dry-run"))).toBe(true);
  });
});
