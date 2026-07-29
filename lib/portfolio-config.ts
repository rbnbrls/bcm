import { ASSET_SUB_ASSET_OPTIONS } from "@/lib/schemas/clientConfigInput";

export function generatePrimaryAccountId(
  portfolioCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string
): string {
  return `${portfolioCode}_${assetClassCode}${subAssetClassCode}_${managerCode}`.toUpperCase();
}

export function validatePrimaryAccountId(
  primaryAccountId: string,
  portfolioCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string
): boolean {
  const expected = generatePrimaryAccountId(portfolioCode, assetClassCode, subAssetClassCode, managerCode);
  return expected === primaryAccountId.toUpperCase();
}

export function lookupCodes(
  assetClass: string,
  subAssetClass: string
): { assetClassCode: string; subAssetClassCode: string } | null {
  const entry = ASSET_SUB_ASSET_OPTIONS.find(
    (x) => x.assetClass === assetClass && x.subAssetClass === subAssetClass
  );
  return entry ? { assetClassCode: entry.assetClassCode, subAssetClassCode: entry.subAssetClassCode } : null;
}

export function isValidLongName(value: string): boolean {
  return value.length > 0 && value.length <= 255 && !value.includes("\r") && !value.includes("\n");
}

export function isValidShortName(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !value.includes("\r") && !value.includes("\n");
}
