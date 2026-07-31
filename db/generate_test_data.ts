/**
 * Client config test data generator.
 *
 * Generates a complete set of valid client config records (legal entities,
 * parent accounts, portfolios, managers, benchmarks, models, classifications,
 * strategies, sub-strategies, and accounts) validated against the Zod schemas.
 *
 * Usage (CLI):
 *   npx tsx db/generate_test_data.ts [count=25] [seed=20260728] [output=clientconfig_test_data.json]
 *
 * Usage (API):
 *   import { generateTestData } from "./db/generate_test_data";
 *   const data = generateTestData(100, 42);
 *
 * Every generated record passes its Zod schema validation.
 */

import { writeFileSync } from "node:fs";
import {
  ASSET_SUB_ASSET_OPTIONS,
  AssetSubAssetSelection,
  LegalEntityInput,
  ParentAccountInput,
  ClientInput,
  PortfolioInput,
  ManagerInput,
  BenchmarkInput,
  ModelInput,
  ClassificationInput,
  StrategyInput,
  SubStrategyInput,
  AccountInput,
} from "./clientconfig_validation";

// ═════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════

export interface GeneratedConfigData {
  metadata: {
    fictitious: true;
    seed: number;
    count: number;
    generatedAt: string;
  };
  availableAssetSubAssetOptions: typeof ASSET_SUB_ASSET_OPTIONS;
  legalEntities: unknown[];
  parentAccounts: unknown[];
  clients: unknown[];
  portfolios: unknown[];
  managers: unknown[];
  benchmarks: unknown[];
  models: unknown[];
  classifications: unknown[];
  strategies: unknown[];
  subStrategies: unknown[];
  accounts: unknown[];
}

// ═════════════════════════════════════════════════════════════════════
// Deterministic pseudo-random generator (seedable)
// ═════════════════════════════════════════════════════════════════════

class Random {
  constructor(private state: number) {}

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  int(a: number, b: number): number {
    return Math.floor(this.next() * (b - a + 1)) + a;
  }

  pick<T>(x: readonly T[]): T {
    return x[this.int(0, x.length - 1)];
  }

  code(n: number): string {
    const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: n }, () => a[this.int(0, a.length - 1)]).join("");
  }
}

// ═════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════

/** Run a Zod schema `.parse()` — throws on invalid data with details. */
const valid = <T>(s: { parse: (x: unknown) => T }, x: unknown): T => s.parse(x);

/**
 * Sanitize a sub-asset-class name to a valid SubStrategyInput.subStrategyName.
 * Strips characters not allowed by the regex /^[A-Z0-9][A-Z0-9 &/_+.-]{2,49}$/.
 */
function toSubStrategyName(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9 &/_+.-]/g, "")
    .trim();
  if (cleaned.length < 3) return `${cleaned}_XX`;
  return cleaned.slice(0, 50).trim();
}

// ═════════════════════════════════════════════════════════════════════
// Generator
// ═════════════════════════════════════════════════════════════════════

/**
 * Generate a complete set of client config test data.
 *
 * @param count - Number of portfolios + accounts to generate (default 25)
 * @param seed  - PRNG seed for deterministic output (default 20260728)
 * @returns     - A complete GeneratedConfigData object with all records
 */
export function generateTestData(
  count: number = 25,
  seed: number = 20260728,
): GeneratedConfigData {
  const rnd = new Random(seed);

  // ── Reference-data records ──

  const legalEntities = [
    valid(LegalEntityInput, { legalName: "TEST LEGAL ENTITY ALPHA" }),
    valid(LegalEntityInput, { legalName: "TEST LEGAL ENTITY BETA" }),
  ];

  const parentAccounts = legalEntities.map((_, i) =>
    valid(ParentAccountInput, {
      parentAccountCode: `TST_${rnd.code(3)}`,
      msaParentAccountCode: i ? null : `MSA_${rnd.code(3)}`,
    }),
  );

  const managers = [
    { managerCode: "AIM", managerName: "AIM TEST MANAGER" },
    { managerCode: "NTX", managerName: "NTX TEST MANAGER" },
    { managerCode: "ROB", managerName: "ROB TEST MANAGER" },
  ].map((x) => valid(ManagerInput, x));

  const benchmarks = [1, 2, 3].map((i) =>
    valid(BenchmarkInput, {
      benchmarkCode: `TST_BENCH_${i}`,
      benchmarkName: `Test Benchmark ${i}`,
      rimesCode: `TST_RIMES_${i}`,
    }),
  );

  const models = [1, 2].map((i) =>
    valid(ModelInput, { modelCode: `TST_M${i}` }),
  );

  const classifications = ["MATCH", "RETURN", "OPBOUW"].map((code) =>
    valid(ClassificationInput, { classificationCode: code }),
  );

  const strategies = [
    "CASH",
    "EQUITIES",
    "ALTERNATIVES",
    "REAL_ASSETS",
    "FIXED_INCOME",
    "MULTI_ASSETS",
    "OVERLAY",
    "IMPACT",
  ].map((strategyName) => valid(StrategyInput, { strategyName }));

  // Sub-strategies — one per allowed asset-class / sub-asset-class combo.
  const subStrategies = ASSET_SUB_ASSET_OPTIONS.map((opt) => {
    const strategyId =
      strategies.findIndex((s) => s.strategyName === opt.assetClass) + 1;
    return valid(SubStrategyInput, {
      strategyId,
      subStrategyName: toSubStrategyName(opt.subAssetClass),
    });
  });

  // ── Variable-data records ──
  const portfolios = Array.from({ length: count }, (_, i) =>
    valid(PortfolioInput, {
      portfolioCode: `T${String(i + 1).padStart(4, "0")}${rnd.code(2)}`,
      parentAccountId: (i % parentAccounts.length) + 1,
    }),
  );

  const clients = Array.from({ length: count }, (_, i) =>
    valid(ClientInput, {
      clientCode: `C${i.toString(36).toUpperCase().padStart(2, "0")}`.slice(-3),
      clientName: `Test Client ${String(i + 1).padStart(4, "0")}`,
    }),
  );

  const accounts = portfolios.map((portfolio, i) => {
    const raw = rnd.pick(ASSET_SUB_ASSET_OPTIONS);
    const selected = valid(AssetSubAssetSelection, {
      assetClass: raw.assetClass,
      subAssetClass: raw.subAssetClass,
    });

    const codes = ASSET_SUB_ASSET_OPTIONS.find(
      (x) =>
        x.assetClass === selected.assetClass &&
        x.subAssetClass === selected.subAssetClass,
    )!;

    const assetClassId =
      strategies.findIndex((s) => s.strategyName === selected.assetClass) + 1;
    const subAssetClassId =
      ASSET_SUB_ASSET_OPTIONS.findIndex(
        (x) =>
          x.assetClass === selected.assetClass &&
          x.subAssetClass === selected.subAssetClass,
      ) + 1;
    const managerId = (i % managers.length) + 1;
    const manager = managers[managerId - 1];
    const client = clients[i] as { clientCode: string };

    const primaryAccountId = `${client.clientCode}*${codes.assetClassCode}${codes.subAssetClassCode}*${manager.managerCode}`;

    return valid(AccountInput, {
      primaryAccountId,
      clientCode: client.clientCode,
      portfolioId: i + 1,
      assetClassId,
      subAssetClassId,
      managerId,
      legalEntityId: (i % legalEntities.length) + 1,
      additionalCode: i % 4 === 0 ? "ESG" : null,
      longName: `${portfolio.portfolioCode} ${codes.assetClassCode}${codes.subAssetClassCode} ${manager.managerCode} TEST`,
      shortName: `${portfolio.portfolioCode} ${codes.assetClassCode}${codes.subAssetClassCode}`,
      modelId: (i % models.length) + 1,
      classificationId: (i % classifications.length) + 1,
      strategyId: assetClassId,
      subStrategyId: subAssetClassId,
      benchmarkId: (i % benchmarks.length) + 1,
    });
  });

  return {
    metadata: {
      fictitious: true,
      seed,
      count,
      generatedAt: new Date().toISOString(),
    },
    availableAssetSubAssetOptions: ASSET_SUB_ASSET_OPTIONS,
    legalEntities,
    parentAccounts,
    clients,
    portfolios,
    managers,
    benchmarks,
    models,
    classifications,
    strategies,
    subStrategies,
    accounts,
  };
}

// ═════════════════════════════════════════════════════════════════════
// CLI entry point
// ═════════════════════════════════════════════════════════════════════

// Only run as CLI when invoked directly (not via import)
const isMainModule =
  typeof require !== "undefined" && require.main === module;

if (isMainModule) {
  const count = Math.max(1, Number(process.argv[2]) || 25);
  const seed = Number(process.argv[3]) || 20260728;
  const outputPath = process.argv[4] || "clientconfig_test_data.json";

  const data = generateTestData(count, seed);
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(
    `Generated and validated ${data.accounts.length} accounts → ${outputPath}`,
  );
}
