import { sql } from "@/lib/db";
import {
  getBenchmarkSwitchPortfolioOptions,
  getClientConfigPortfolioConfigurations,
  getClientConfigReferenceData,
} from "@/lib/client-config-db";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

export type ServiceCatalogItemType = "asset_class" | "sub_asset_class" | "benchmark";
export type ServiceCatalogStatus = "active" | "unused";

export type ServiceCatalogItem = Readonly<{
  id: string;
  type: ServiceCatalogItemType;
  code: string;
  name: string;
  description: string;
  status: ServiceCatalogStatus;
  parentId?: string;
  usageCount: number;
  clientCodes: readonly string[];
  primaryAccountIds: readonly string[];
}>;

export type ServiceCatalogRelation = Readonly<{
  id: string;
  fromItemId: string;
  toItemId: string;
  relationType: "contains" | "uses";
}>;

export type ClientServiceConfiguration = Readonly<{
  primaryAccountId: string;
  clientCode: string;
  clientName: string | null;
  portfolioCode: string;
  assetClassItemId: string;
  subAssetClassItemId: string;
  benchmarkItemId: string;
  assetClassName: string;
  subAssetClassName: string;
  benchmarkName: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}>;

export type ServiceCatalogSummary = Readonly<{
  assetClasses: number;
  subAssetClasses: number;
  benchmarks: number;
  configuredPrimaryAccounts: number;
  activeClients: number;
}>;

export type ServiceCatalogModel = Readonly<{
  generatedAt: string;
  summary: ServiceCatalogSummary;
  items: readonly ServiceCatalogItem[];
  relations: readonly ServiceCatalogRelation[];
  clientConfigurations: readonly ClientServiceConfiguration[];
}>;

function itemId(type: ServiceCatalogItemType, code: string): string {
  return `${type}:${code}`;
}

function uniqueSorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function usageFor(
  rows: readonly ClientConfigPortfolioConfigurationRow[],
  predicate: (row: ClientConfigPortfolioConfigurationRow) => boolean,
): Pick<ServiceCatalogItem, "usageCount" | "clientCodes" | "primaryAccountIds" | "status"> {
  const matching = rows.filter(predicate);
  return {
    usageCount: matching.length,
    clientCodes: uniqueSorted(matching.map((row) => row.clientCode)),
    primaryAccountIds: uniqueSorted(matching.map((row) => row.primaryAccountId)),
    status: matching.length > 0 ? "active" : "unused",
  };
}

function relation(fromItemId: string, toItemId: string, relationType: ServiceCatalogRelation["relationType"]): ServiceCatalogRelation {
  return Object.freeze({
    id: `${fromItemId}->${toItemId}:${relationType}`,
    fromItemId,
    toItemId,
    relationType,
  });
}

async function loadPortfolioConfigurationRows(): Promise<readonly ClientConfigPortfolioConfigurationRow[]> {
  const rows = await getClientConfigPortfolioConfigurations();
  if (rows.length > 0 || sql) return rows;
  return getBenchmarkSwitchPortfolioOptions();
}

export async function getServiceCatalogModel(now: Date = new Date()): Promise<ServiceCatalogModel> {
  const [referenceData, portfolioRows] = await Promise.all([
    getClientConfigReferenceData(),
    loadPortfolioConfigurationRows(),
  ]);

  const assetClassCodeById = new Map(
    referenceData.assetClasses.map((assetClass) => [assetClass.assetClassId, assetClass.assetClassCode]),
  );

  const assetClassItems: ServiceCatalogItem[] = referenceData.assetClasses.map((assetClass) => Object.freeze({
    id: itemId("asset_class", assetClass.assetClassCode),
    type: "asset_class",
    code: assetClass.assetClassCode,
    name: assetClass.assetClassName,
    description: "Beschikbare asset class voor portfolio_configuration.",
    ...usageFor(portfolioRows, (row) => row.assetClassCode === assetClass.assetClassCode),
  }));

  const subAssetClassItems: ServiceCatalogItem[] = referenceData.subAssetClasses.map((subAssetClass) => {
    const assetClassCode = assetClassCodeById.get(subAssetClass.assetClassId) ?? "unknown";
    return Object.freeze({
      id: itemId("sub_asset_class", `${assetClassCode}:${subAssetClass.subAssetClassCode}`),
      type: "sub_asset_class",
      code: subAssetClass.subAssetClassCode,
      name: subAssetClass.subAssetClassName,
      description: "Beschikbare sub asset class per asset class.",
      parentId: itemId("asset_class", assetClassCode),
      ...usageFor(
        portfolioRows,
        (row) => row.assetClassCode === assetClassCode && row.subAssetClassCode === subAssetClass.subAssetClassCode,
      ),
    });
  });

  const benchmarkItems: ServiceCatalogItem[] = referenceData.benchmarks.map((benchmark) => Object.freeze({
    id: itemId("benchmark", benchmark.benchmarkCode),
    type: "benchmark",
    code: benchmark.benchmarkCode,
    name: benchmark.benchmarkName ?? benchmark.benchmarkCode,
    description: benchmark.rimesCode ? `Benchmark met Rimes code ${benchmark.rimesCode}.` : "Beschikbare benchmark.",
    ...usageFor(portfolioRows, (row) => row.benchmarkCode === benchmark.benchmarkCode),
  }));

  const structuralRelations = subAssetClassItems.flatMap((item) =>
    item.parentId ? [relation(item.parentId, item.id, "contains")] : [],
  );
  const configuredRelations = portfolioRows.flatMap((row) => [
    relation(
      itemId("sub_asset_class", `${row.assetClassCode}:${row.subAssetClassCode}`),
      itemId("benchmark", row.benchmarkCode),
      "uses",
    ),
  ]);

  const clientConfigurations: ClientServiceConfiguration[] = portfolioRows.map((row) => Object.freeze({
    primaryAccountId: row.primaryAccountId,
    clientCode: row.clientCode,
    clientName: row.clientName,
    portfolioCode: row.portfolioCode,
    assetClassItemId: itemId("asset_class", row.assetClassCode),
    subAssetClassItemId: itemId("sub_asset_class", `${row.assetClassCode}:${row.subAssetClassCode}`),
    benchmarkItemId: itemId("benchmark", row.benchmarkCode),
    assetClassName: row.assetClassName,
    subAssetClassName: row.subAssetClassName,
    benchmarkName: row.benchmarkName,
    effectiveFrom: row.effectiveFrom,
    effectiveUntil: row.effectiveUntil,
  }));

  const items = Object.freeze([...assetClassItems, ...subAssetClassItems, ...benchmarkItems]);
  const relations = Object.freeze([...new Map(
    [...structuralRelations, ...configuredRelations].map((item) => [item.id, item]),
  ).values()]);

  return Object.freeze({
    generatedAt: now.toISOString(),
    summary: Object.freeze({
      assetClasses: assetClassItems.length,
      subAssetClasses: subAssetClassItems.length,
      benchmarks: benchmarkItems.length,
      configuredPrimaryAccounts: clientConfigurations.length,
      activeClients: uniqueSorted(clientConfigurations.map((row) => row.clientCode)).length,
    }),
    items,
    relations,
    clientConfigurations: Object.freeze(clientConfigurations),
  });
}
