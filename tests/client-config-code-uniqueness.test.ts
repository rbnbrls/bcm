/**
 * Tests for checkCodeUniqueness in lib/client-config-db.ts.
 *
 * These verify fallback behaviour when no real database is available
 * (demo/fixture mode): codes that exist in the demo fixtures are reported
 * taken, unknown codes are available.
 */
import { describe, it, expect } from "vitest";
import { checkCodeUniqueness } from "@/lib/client-config-db";

describe("checkCodeUniqueness — no database (demo fallback)", () => {
  it("returns all-free when neither code is supplied", async () => {
    const result = await checkCodeUniqueness({});
    expect(result).toEqual({
      clientCodeTaken: false,
      portfolioCodeTaken: false,
      clientCodeMessage: null,
      portfolioCodeMessage: null,
    });
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

  it("checks both codes in a single call", async () => {
    const result = await checkCodeUniqueness({ clientCode: "HOR", portfolioCode: "ZZZ-RP" });
    expect(result.clientCodeTaken).toBe(true);
    expect(result.portfolioCodeTaken).toBe(false);
  });

  it("is case-sensitive against uppercase demo codes (lowercase is not a match)", async () => {
    const result = await checkCodeUniqueness({ clientCode: "hor" });
    expect(result.clientCodeTaken).toBe(false);
  });
});
