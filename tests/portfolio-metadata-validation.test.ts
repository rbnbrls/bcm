/**
 * Unit tests for the shared portfolio / parent-account metadata validation
 * module (lib/portfolio-metadata-validation.ts).
 *
 * Covers the acceptance criteria of task t_5cb38133:
 *  - validation prevents duplicate entries (uniqueness of portfolio_code /
 *    parent_account_code across active AND retired rows, plus duplicate
 *    staging in open change requests);
 *  - validation prevents orphaned references (portfolio CREATE may only
 *    reference an active parent account; RETIRE is blocked while children
 *    still reference the row);
 *  - the same validation is callable from backend helpers AND frontend forms
 *    (the module has no server-only imports; tests use a plain in-memory
 *    lookup, exactly like a frontend would supply).
 */
import { describe, it, expect, vi } from "vitest";
import {
  validateCodeFormat,
  validateOptionalMetadataCodes,
  validatePortfolioMetadataFormat,
  validatePortfolioMetadataChange,
  type PortfolioMetadataLookup,
} from "@/lib/portfolio-metadata-validation";

const CHANGE_REQUEST_ID = "11111111-1111-1111-1111-111111111111";

/** In-memory lookup — mirrors what a frontend form (or a test) would inject. */
function createLookup(overrides: Partial<PortfolioMetadataLookup> = {}): PortfolioMetadataLookup {
  return {
    codeExists: vi.fn(async () => false),
    parentAccountActive: vi.fn(async () => true),
    portfolioHasActiveConfigurations: vi.fn(async () => false),
    parentAccountHasActivePortfolios: vi.fn(async () => false),
    alreadyStagedInOpenChange: vi.fn(async () => false),
    ...overrides,
  };
}

describe("validateCodeFormat", () => {
  it("accepts a valid portfolio code", () => {
    expect(validateCodeFormat("AB12", "portfolio")).toBeNull();
    expect(validateCodeFormat("  xyz9  ", "portfolio")).toBeNull(); // trims + uppercases
  });

  it("rejects portfolio codes that are too short or too long", () => {
    expect(validateCodeFormat("A", "portfolio")).toMatch(/2-15 tekens/);
    expect(validateCodeFormat("ABCDEFGHIJKLMNOP", "portfolio")).toMatch(/2-15 tekens/);
  });

  it("rejects portfolio codes with invalid characters", () => {
    expect(validateCodeFormat("AB_1", "portfolio")).toMatch(/verwachte formaat/);
    expect(validateCodeFormat("AB-1", "portfolio")).toMatch(/verwachte formaat/);
  });

  it("accepts a valid parent-account code", () => {
    expect(validateCodeFormat("HOOFD_01", "parent_account")).toBeNull();
    expect(validateCodeFormat("PARENT", "parent_account")).toBeNull();
  });

  it("rejects parent-account codes with invalid characters or length", () => {
    expect(validateCodeFormat("HOOFD@01", "parent_account")).toMatch(/verwachte formaat/);
    expect(validateCodeFormat("ABCDEFGHIJKLMNOPQ", "parent_account")).toMatch(/1-16 tekens/);
  });
});

describe("validateOptionalMetadataCodes", () => {
  it("accepts null / empty optional codes", () => {
    const issues = validateOptionalMetadataCodes({
      changeRequestId: CHANGE_REQUEST_ID,
      dimension: "portfolio",
      actionType: "CREATE",
      code: "NEWPORT",
      parentAccountCode: null,
    });
    expect(issues).toEqual([]);
  });

  it("rejects an invalid parentAccountCode on portfolio CREATE", () => {
    const issues = validateOptionalMetadataCodes({
      changeRequestId: CHANGE_REQUEST_ID,
      dimension: "portfolio",
      actionType: "CREATE",
      code: "NEWPORT",
      parentAccountCode: "invalid@code!",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Ouderaccount code "invalid@code!" voldoet niet/);
  });

  it("rejects an invalid msaParentAccountCode on parent_account CREATE", () => {
    const issues = validateOptionalMetadataCodes({
      changeRequestId: CHANGE_REQUEST_ID,
      dimension: "parent_account",
      actionType: "CREATE",
      code: "HOOFD_NEW",
      msaParentAccountCode: "msa with spaces!",
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/MSA parent account code "msa with spaces!" voldoet niet/);
  });

  it("does not validate optional codes on RETIRE", () => {
    const issues = validateOptionalMetadataCodes({
      changeRequestId: CHANGE_REQUEST_ID,
      dimension: "portfolio",
      actionType: "RETIRE",
      code: "OLDPORT",
      parentAccountCode: "invalid@code!",
    });
    expect(issues).toEqual([]);
  });
});

describe("validatePortfolioMetadataFormat (pure, no DB)", () => {
  it("returns no issues for a well-formed portfolio CREATE", () => {
    const issues = validatePortfolioMetadataFormat({
      changeRequestId: CHANGE_REQUEST_ID,
      dimension: "portfolio",
      actionType: "CREATE",
      code: "NEWPORT",
      parentAccountCode: "HOOFD_01",
    });
    expect(issues).toEqual([]);
  });

  it("returns format issues without touching the lookup (frontend-safe)", () => {
    const lookup = createLookup();
    const issues = validatePortfolioMetadataFormat({
      changeRequestId: CHANGE_REQUEST_ID,
      dimension: "portfolio",
      actionType: "CREATE",
      code: "x", // too short
    });
    expect(issues).toHaveLength(1);
    // The pure format validator must be callable without any lookup at all.
    expect(lookup.codeExists).not.toHaveBeenCalled();
  });
});

describe("validatePortfolioMetadataChange — uniqueness (duplicate prevention)", () => {
  it("blocks a portfolio CREATE whose code already exists (active or retired)", async () => {
    const lookup = createLookup({ codeExists: vi.fn(async () => true) });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "DUPEPORT",
      },
      lookup,
    );
    expect(issues).toEqual([`Portfolio code "DUPEPORT" bestaat al.`]);
    expect(lookup.codeExists).toHaveBeenCalledWith("portfolio", "DUPEPORT");
  });

  it("blocks a parent_account CREATE whose code already exists", async () => {
    const lookup = createLookup({ codeExists: vi.fn(async () => true) });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "parent_account",
        actionType: "CREATE",
        code: "HOOFD_DUP",
      },
      lookup,
    );
    expect(issues).toEqual([`Parent account code "HOOFD_DUP" bestaat al.`]);
  });

  it("does not run the uniqueness check for RETIRE", async () => {
    const codeExists = vi.fn(async () => true);
    const lookup = createLookup({ codeExists });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "RETIRE",
        code: "OLDPORT",
      },
      lookup,
    );
    // Uniqueness is CREATE-only: a retire of an existing code is fine.
    expect(issues).toEqual([]);
    expect(codeExists).not.toHaveBeenCalled();
  });

  it("accepts a portfolio CREATE with a unique code", async () => {
    const lookup = createLookup();
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "UNIQUEPORT",
      },
      lookup,
    );
    expect(issues).toEqual([]);
  });
});

describe("validatePortfolioMetadataChange — foreign-key safety (orphan prevention)", () => {
  it("blocks a portfolio CREATE referencing a missing / inactive parent account", async () => {
    const lookup = createLookup({ parentAccountActive: vi.fn(async () => false) });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "NEWPORT",
        parentAccountCode: "GONE_HOOFD",
      },
      lookup,
    );
    expect(issues).toEqual([`Ouderaccount "GONE_HOOFD" bestaat niet of is niet actief.`]);
  });

  it("accepts a portfolio CREATE referencing an active parent account", async () => {
    const lookup = createLookup({ parentAccountActive: vi.fn(async () => true) });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "NEWPORT",
        parentAccountCode: "HOOFD_01",
      },
      lookup,
    );
    expect(issues).toEqual([]);
  });

  it("skips the FK check when parentAccountCode is absent", async () => {
    const parentAccountActive = vi.fn(async () => false);
    const lookup = createLookup({ parentAccountActive });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "NEWPORT",
      },
      lookup,
    );
    expect(issues).toEqual([]);
    expect(parentAccountActive).not.toHaveBeenCalled();
  });

  it("blocks a portfolio RETIRE while active portfolio configurations exist", async () => {
    const lookup = createLookup({ portfolioHasActiveConfigurations: vi.fn(async () => true) });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "RETIRE",
        code: "BUSYPORT",
      },
      lookup,
    );
    expect(issues).toEqual([
      `Portfolio "BUSYPORT" heeft nog actieve portfolio configuraties. Verwijder of archiveer deze eerst.`,
    ]);
  });

  it("blocks a parent_account RETIRE while active portfolios reference it", async () => {
    const lookup = createLookup({ parentAccountHasActivePortfolios: vi.fn(async () => true) });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "parent_account",
        actionType: "RETIRE",
        code: "BUSY_HOOFD",
      },
      lookup,
    );
    expect(issues).toEqual([`Parent account "BUSY_HOOFD" heeft nog actieve portfolios. Archiveer deze eerst.`]);
  });

  it("accepts a clean portfolio RETIRE", async () => {
    const lookup = createLookup();
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "RETIRE",
        code: "CLEANPORT",
      },
      lookup,
    );
    expect(issues).toEqual([]);
  });
});

describe("validatePortfolioMetadataChange — duplicate staging", () => {
  it("blocks a code already staged in another open change request", async () => {
    const lookup = createLookup({ alreadyStagedInOpenChange: vi.fn(async () => true) });
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "UNIQUEPORT",
      },
      lookup,
    );
    expect(issues).toEqual([`Portfolio code "UNIQUEPORT" is al eerder aangevraagd in een open change.`]);
  });

  it("passes the changeRequestId to the staging check", async () => {
    const alreadyStagedInOpenChange = vi.fn(async () => false);
    const lookup = createLookup({ alreadyStagedInOpenChange });
    await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "parent_account",
        actionType: "CREATE",
        code: "HOOFD_NEW",
      },
      lookup,
    );
    expect(alreadyStagedInOpenChange).toHaveBeenCalledWith(
      "parent_account",
      "HOOFD_NEW",
      CHANGE_REQUEST_ID,
    );
  });
});

describe("validatePortfolioMetadataChange — happy paths", () => {
  it("accepts a valid portfolio CREATE with parent account", async () => {
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "NEWPORT",
        parentAccountCode: "HOOFD_01",
      },
      createLookup(),
    );
    expect(issues).toEqual([]);
  });

  it("accepts a valid parent_account CREATE with MSA code", async () => {
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "parent_account",
        actionType: "CREATE",
        code: "HOOFD_NEW",
        msaParentAccountCode: "MSA_001",
      },
      createLookup(),
    );
    expect(issues).toEqual([]);
  });

  it("short-circuits on format errors before hitting the lookup", async () => {
    const lookup = createLookup();
    const issues = await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "A", // too short
      },
      lookup,
    );
    expect(issues).toHaveLength(1);
    expect(lookup.codeExists).not.toHaveBeenCalled();
  });

  it("uppercases and trims codes before checking uniqueness", async () => {
    const codeExists = vi.fn(async () => false);
    const lookup = createLookup({ codeExists });
    await validatePortfolioMetadataChange(
      {
        changeRequestId: CHANGE_REQUEST_ID,
        dimension: "portfolio",
        actionType: "CREATE",
        code: "  newport  ",
      },
      lookup,
    );
    expect(codeExists).toHaveBeenCalledWith("portfolio", "NEWPORT");
  });
});
