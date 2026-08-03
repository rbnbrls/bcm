/**
 * Tests for checkCodeUniqueness in lib/client-config-db.ts.
 *
 * These verify fallback behaviour when no real database is available
 * (demo/fixture mode): codes that exist in the demo fixtures are reported
 * taken, unknown codes are available.
 */
import { describe, it, expect } from "vitest";
import { checkCodeUniqueness } from "@/lib/client-config-db";

const FREE_RESULT = {
  clientCodeTaken: false,
  portfolioCodeTaken: false,
  parentAccountCodeTaken: false,
  clientCodeMessage: null,
  portfolioCodeMessage: null,
  parentAccountCodeMessage: null,
};

describe("checkCodeUniqueness — no database (demo fallback)", () => {
  it("returns all-free when no codes are supplied", async () => {
    const result = await checkCodeUniqueness({});
    expect(result).toEqual(FREE_RESULT);
  });

  it("reports a demo client code as taken", async () => {
    const result = await checkCodeUniqueness({ clientCode: "HOR" });
    expect(result.clientCodeTaken).toBe(true);
    expect(result.clientCodeMessage).toContain("HOR");
  });

  it("reports an unknown client code as available", async () => {
    const result = await checkCodeUniqueness({ clientCode: "ZZZ" });
    expect(result.clientCodeTaken).toBe(false);
    expect(result.clientCodeMessage).toBeNull();
  });

  it("reports a demo portfolio code as taken", async () => {
    const result = await checkCodeUniqueness({ portfolioCode: "HOR-RP" });
    expect(result.portfolioCodeTaken).toBe(true);
    expect(result.portfolioCodeMessage).toContain("HOR-RP");
  });

  it("reports an unknown portfolio code as available", async () => {
    const result = await checkCodeUniqueness({ portfolioCode: "ZZZ-RP" });
    expect(result.portfolioCodeTaken).toBe(false);
    expect(result.portfolioCodeMessage).toBeNull();
  });

  it("reports a demo parent-account code as taken", async () => {
    const result = await checkCodeUniqueness({ parentAccountCode: "HOOFD_HOR" });
    expect(result.parentAccountCodeTaken).toBe(true);
    expect(result.parentAccountCodeMessage).toContain("HOOFD_HOR");
  });

  it("reports an unknown parent-account code as available", async () => {
    const result = await checkCodeUniqueness({ parentAccountCode: "HOOFD_ZZZ" });
    expect(result.parentAccountCodeTaken).toBe(false);
    expect(result.parentAccountCodeMessage).toBeNull();
  });

  it("checks all three codes in a single call", async () => {
    const result = await checkCodeUniqueness({
      clientCode: "HOR",
      portfolioCode: "ZZZ-RP",
      parentAccountCode: "HOOFD_ZEK",
    });
    expect(result.clientCodeTaken).toBe(true);
    expect(result.portfolioCodeTaken).toBe(false);
    expect(result.parentAccountCodeTaken).toBe(true);
  });

  it("is case-sensitive against uppercase demo codes (lowercase is not a match)", async () => {
    const result = await checkCodeUniqueness({ clientCode: "hor" });
    expect(result.clientCodeTaken).toBe(false);
  });
});
