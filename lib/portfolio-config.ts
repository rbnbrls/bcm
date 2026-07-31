import { ASSET_SUB_ASSET_OPTIONS } from "@/lib/asset-classes";

export function generatePrimaryAccountId(
  clientCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string
): string {
  return `${clientCode}*${assetClassCode}${subAssetClassCode}*${managerCode}`.toUpperCase();
}

export function validatePrimaryAccountId(
  primaryAccountId: string,
  clientCode: string,
  assetClassCode: string,
  subAssetClassCode: string,
  managerCode: string
): boolean {
  const expected = generatePrimaryAccountId(clientCode, assetClassCode, subAssetClassCode, managerCode);
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
