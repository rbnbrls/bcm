import { ASSET_SUB_ASSET_OPTIONS } from "@/lib/asset-classes";
import type { ClientConfigReferenceData } from "@/lib/types";

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

/**
 * Reference-data-driven fallback for lookupCodes().
 *
 * The governed change flow (new_asset_class / new_sub_asset_class) adds new
 * values to the client_config lookup tables on apply. Those values are NOT in
 * the static lib/asset-classes.ts hierarchy until the static file is updated
 * in lockstep (governance rule 4). This helper resolves codes from the live
 * reference data so a newly-requested-and-applied value becomes usable in the
 * portfolio-addition flow without requiring a code deploy.
 *
 * Returns null when the pair is unknown in both sources.
 */
export function lookupCodesFromReferenceData(
  assetClass: string,
  subAssetClass: string,
  referenceData: ClientConfigReferenceData,
): { assetClassCode: string; subAssetClassCode: string } | null {
  const fromStatic = lookupCodes(assetClass, subAssetClass);
  if (fromStatic) return fromStatic;

  const ac = referenceData.assetClasses.find(
    (x) => x.assetClassName === assetClass || x.assetClassCode === assetClass,
  );
  if (!ac) return null;

  const sac = referenceData.subAssetClasses.find(
    (x) =>
      x.assetClassId === ac.assetClassId &&
      (x.subAssetClassName === subAssetClass || x.subAssetClassCode === subAssetClass),
  );
  if (!sac) return null;

  return { assetClassCode: ac.assetClassCode, subAssetClassCode: sac.subAssetClassCode };
}

export function isValidLongName(value: string): boolean {
  return value.length > 0 && value.length <= 255 && !value.includes("\r") && !value.includes("\n");
}

export function isValidShortName(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !value.includes("\r") && !value.includes("\n");
}
