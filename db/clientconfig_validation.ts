import { z } from "zod";

export const ASSET_SUB_ASSET_OPTIONS = [
  {
    "assetClass": "CASH",
    "assetClassCode": "CS",
    "subAssetClass": "CASH",
    "subAssetClassCode": "CAS"
  },
  {
    "assetClass": "CASH",
    "assetClassCode": "CS",
    "subAssetClass": "FUNDS",
    "subAssetClassCode": "FUN"
  },
  {
    "assetClass": "CASH",
    "assetClassCode": "CS",
    "subAssetClass": "LIQUIDITIES",
    "subAssetClassCode": "LIQ"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "DEVELOPED MARKETS",
    "subAssetClassCode": "DEV"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "DEVELOPED MARKETS FACTOR",
    "subAssetClassCode": "DMF"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "DEVELOPED MARKETS SMALL CAP",
    "subAssetClassCode": "DMS"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "EMERGING MARKETS",
    "subAssetClassCode": "EME"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "AC WORLD",
    "subAssetClassCode": "ACX"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "EUROPE",
    "subAssetClassCode": "EUR"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "JAPAN",
    "subAssetClassCode": "JAP"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "ASIA EX-JAPAN",
    "subAssetClassCode": "AEJ"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "UNITED STATES",
    "subAssetClassCode": "UNI"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "NORTH AMERICA",
    "subAssetClassCode": "NOR"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "DUURZAAM",
    "subAssetClassCode": "DUU"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "MILIEU & WATER",
    "subAssetClassCode": "MIL"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "BIODIVERSITY",
    "subAssetClassCode": "BIO"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "FUNDS",
    "subAssetClassCode": "FUN"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "EMERGING MARKETS FACTOR",
    "subAssetClassCode": "EMF"
  },
  {
    "assetClass": "EQUITIES",
    "assetClassCode": "EQ",
    "subAssetClass": "AC WORLD FACTOR",
    "subAssetClassCode": "AWF"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "PRIVATE EQUITY",
    "subAssetClassCode": "PRI"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "HEDGE FUNDS",
    "subAssetClassCode": "HED"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "PRIVATE EQUITY IMPACT",
    "subAssetClassCode": "PEI"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "HEDGE FUNDS CTA",
    "subAssetClassCode": "HFC"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "HEDGE FUNDS GLOBAL MACRO",
    "subAssetClassCode": "HFG"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "INFLATION LINKED SECURITIES",
    "subAssetClassCode": "ILS"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "GOLD",
    "subAssetClassCode": "GOL"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "RISK PARITY",
    "subAssetClassCode": "RIS"
  },
  {
    "assetClass": "ALTERNATIVES",
    "assetClassCode": "AL",
    "subAssetClass": "RISK PREMIA",
    "subAssetClassCode": "RIP"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "AGRICULTURE",
    "subAssetClassCode": "AGR"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "COMMODITIES",
    "subAssetClassCode": "COM"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "INFRASTRUCTURE",
    "subAssetClassCode": "INF"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "REALESTATE LISTED",
    "subAssetClassCode": "REA"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "REALESTATE DIRECT",
    "subAssetClassCode": "RED"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "REALESTATE NON-LISTED NETHERLANDS",
    "subAssetClassCode": "RNL"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "REALESTATE NON-LISTED INTERNATIONAL",
    "subAssetClassCode": "REN"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "REALESTATE NON-LISTED EUROPE",
    "subAssetClassCode": "RNA"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "REALESTATE NON-LISTED ASIA PACIFIC",
    "subAssetClassCode": "RNB"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "REALESTATE NON-LISTED NORTH AMERICA",
    "subAssetClassCode": "RNC"
  },
  {
    "assetClass": "REAL_ASSETS",
    "assetClassCode": "RA",
    "subAssetClass": "FORESTRY",
    "subAssetClassCode": "FOR"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "ASSET BACKED SECURITIES",
    "subAssetClassCode": "ABS"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "BANKLOANS",
    "subAssetClassCode": "BAN"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "BIODIVERSITY",
    "subAssetClassCode": "BIO"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "CONVERTABLES",
    "subAssetClassCode": "CON"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "CLO (COLLATERALIZED LOAN OBLIGATION)",
    "subAssetClassCode": "CCL"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "CORPORATES EUROPE",
    "subAssetClassCode": "COR"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "CREDITS EUROPE",
    "subAssetClassCode": "CRE"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "CREDITS GLOBAL",
    "subAssetClassCode": "CRG"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "CREDITS USA",
    "subAssetClassCode": "CRU"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "DEBT HY MICRO FINANCIERING",
    "subAssetClassCode": "DHM"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "DEBT IG ECA LOANS",
    "subAssetClassCode": "DIE"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "DEBT IG WSW LOANS",
    "subAssetClassCode": "DIW"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "DUURZAAM",
    "subAssetClassCode": "DUU"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "EMERGING MARKETS BLEND",
    "subAssetClassCode": "EMB"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "EMERGING MARKETS HC",
    "subAssetClassCode": "EMH"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "EMERGING MARKETS LC",
    "subAssetClassCode": "EML"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "FUNDS",
    "subAssetClassCode": "FUN"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "GREENBONDS",
    "subAssetClassCode": "GRE"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "HIGH YIELD EUROPE",
    "subAssetClassCode": "HYE"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "HIGH YIELD GLOBAL",
    "subAssetClassCode": "HYG"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "HIGH YIELD USA",
    "subAssetClassCode": "HYU"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "INFLATION LINKED BONDS EUROPE",
    "subAssetClassCode": "ILB"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "INFLATION LINKED BONDS GLOBAL",
    "subAssetClassCode": "INL"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "LDI",
    "subAssetClassCode": "LDI"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "LIQUID INVESTMENTS (MONEY MARKET)",
    "subAssetClassCode": "LIM"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "LIQUIDITIES",
    "subAssetClassCode": "LIQ"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "MORTGAGES",
    "subAssetClassCode": "MOR"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "OVERLAYFUNDS",
    "subAssetClassCode": "OVE"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "PRIVATE LOANS",
    "subAssetClassCode": "PRI"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "SECURITIZED",
    "subAssetClassCode": "SEC"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "SOCIAL",
    "subAssetClassCode": "SOC"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "SOVEREIGN EUROPE",
    "subAssetClassCode": "SOV"
  },
  {
    "assetClass": "FIXED_INCOME",
    "assetClassCode": "FI",
    "subAssetClass": "SOVEREIGN GLOBAL",
    "subAssetClassCode": "SOG"
  },
  {
    "assetClass": "MULTI_ASSETS",
    "assetClassCode": "MA",
    "subAssetClass": "DEFENSIVE",
    "subAssetClassCode": "DEF"
  },
  {
    "assetClass": "MULTI_ASSETS",
    "assetClassCode": "MA",
    "subAssetClass": "VERY DEFENSIVE",
    "subAssetClassCode": "VER"
  },
  {
    "assetClass": "MULTI_ASSETS",
    "assetClassCode": "MA",
    "subAssetClass": "NEUTRAL",
    "subAssetClassCode": "NEU"
  },
  {
    "assetClass": "MULTI_ASSETS",
    "assetClassCode": "MA",
    "subAssetClass": "OFFENSIVE",
    "subAssetClassCode": "OFF"
  },
  {
    "assetClass": "MULTI_ASSETS",
    "assetClassCode": "MA",
    "subAssetClass": "VERY OFFENSIVE",
    "subAssetClassCode": "VEO"
  },
  {
    "assetClass": "MULTI_ASSETS",
    "assetClassCode": "MA",
    "subAssetClass": "MIX",
    "subAssetClassCode": "MIX"
  },
  {
    "assetClass": "OVERLAY",
    "assetClassCode": "OV",
    "subAssetClass": "INTEREST",
    "subAssetClassCode": "INT"
  },
  {
    "assetClass": "OVERLAY",
    "assetClassCode": "OV",
    "subAssetClass": "CURRENCY",
    "subAssetClassCode": "CUR"
  },
  {
    "assetClass": "OVERLAY",
    "assetClassCode": "OV",
    "subAssetClass": "INFLATION",
    "subAssetClassCode": "INF"
  },
  {
    "assetClass": "OVERLAY",
    "assetClassCode": "OV",
    "subAssetClass": "EQUITY",
    "subAssetClassCode": "EQU"
  },
  {
    "assetClass": "OVERLAY",
    "assetClassCode": "OV",
    "subAssetClass": "FUNDS",
    "subAssetClassCode": "FUN"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "IMPACT",
    "subAssetClassCode": "IMP"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "EQUITIES",
    "subAssetClassCode": "EQU"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "FIXED INCOME DEBT",
    "subAssetClassCode": "FID"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "PRIVATE EQUITY",
    "subAssetClassCode": "PRI"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "REALESTATE",
    "subAssetClassCode": "REA"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "AGRICULTURE",
    "subAssetClassCode": "AGR"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "INFRASTRUCTURE",
    "subAssetClassCode": "INF"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "CLIMATE",
    "subAssetClassCode": "CLI"
  },
  {
    "assetClass": "IMPACT",
    "assetClassCode": "IM",
    "subAssetClass": "FORESTRY",
    "subAssetClassCode": "FOR"
  }
] as const;
export const ASSET_CLASS_VALUES = [...new Set(ASSET_SUB_ASSET_OPTIONS.map(x => x.assetClass))] as [string, ...string[]];
export const AssetClassValue = z.enum(ASSET_CLASS_VALUES);
export const SubAssetClassValue = z.string().superRefine((value, ctx) => {
  if (!ASSET_SUB_ASSET_OPTIONS.some(x => x.subAssetClass === value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Onbekende sub asset class" });
});
export const AssetSubAssetSelection = z.object({
  assetClass: AssetClassValue,
  subAssetClass: SubAssetClassValue,
}).superRefine((value, ctx) => {
  if (!ASSET_SUB_ASSET_OPTIONS.some(x => x.assetClass === value.assetClass && x.subAssetClass === value.subAssetClass))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subAssetClass"], message: "Sub asset class is niet beschikbaar voor de gekozen asset class" });
});

const singleLine = (max: number) => z.string().min(1).max(max).regex(/^[^\r\n]+$/);
const nullableSingleLine = (max: number) => singleLine(max).nullable().optional();
export const LegalEntityInput = z.object({ legalName: singleLine(100) });
export const ParentAccountInput = z.object({
  parentAccountCode: z.string().max(16).regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/),
  msaParentAccountCode: z.string().max(16).regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/).nullable().optional(),
});
export const ClientInput = z.object({ clientCode: z.string().regex(/^[A-Z0-9]{1,3}$/), clientName: singleLine(100) });
export const PortfolioInput = z.object({ portfolioCode: z.string().regex(/^[A-Z0-9]{2,15}$/), parentAccountId: z.coerce.number().int().positive().nullable().optional() });
export const ManagerInput = z.object({ managerCode: z.string().regex(/^[A-Z0-9]{3}$/), managerName: z.string().regex(/^[A-Z0-9][A-Z0-9 &/().+'-]{1,49}$/) });
export const BenchmarkInput = z.object({ benchmarkCode: singleLine(60), benchmarkName: nullableSingleLine(100), rimesCode: nullableSingleLine(40) });
export const ModelInput = z.object({ modelCode: z.string().regex(/^[A-Z0-9][A-Z0-9 _-]{2,9}$/) });
export const ClassificationInput = z.object({ classificationCode: z.string().regex(/^[A-Z0-9][A-Z0-9 /_-]{1,9}$/) });
export const StrategyInput = z.object({ strategyName: z.string().regex(/^[A-Z][A-Z0-9_ ]{2,29}$/) });
export const SubStrategyInput = z.object({ strategyId: z.coerce.number().int().positive(), subStrategyName: z.string().regex(/^[A-Z0-9][A-Z0-9 &/_+.-]{2,49}$/) });
export const AccountInput = z.object({
  primaryAccountId: z.string().regex(/^[A-Z0-9]{1,3}\*[A-Z]{2}[A-Z0-9]{3}\*[A-Z0-9]{3}$/),
  clientCode: z.string().regex(/^[A-Z0-9]{1,3}$/),
  portfolioId: z.coerce.number().int().positive(), assetClassId: z.coerce.number().int().positive(),
  subAssetClassId: z.coerce.number().int().positive(), managerId: z.coerce.number().int().positive(),
  legalEntityId: z.coerce.number().int().positive().nullable().optional(), additionalCode: z.string().regex(/^[A-Z0-9]{1,3}$/).nullable().optional(),
  longName: singleLine(50), shortName: singleLine(30), modelId: z.coerce.number().int().positive().nullable().optional(),
  classificationId: z.coerce.number().int().positive().nullable().optional(), strategyId: z.coerce.number().int().positive(),
  subStrategyId: z.coerce.number().int().positive(), benchmarkId: z.coerce.number().int().positive().nullable().optional(),
});
