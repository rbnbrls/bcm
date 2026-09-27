/**
 * Tests for GET /api/validate-code-uniqueness.
 *
 * Covers:
 * - 400 when no codes are supplied
 * - 400 when a code fails its format pattern (client / portfolio / parent account)
 * - 200 with taken flags for duplicate codes
 * - 200 with free flags for unique codes
 * - 500 when the DB layer throws
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckCodeUniqueness = vi.fn();

vi.mock("@/lib/client-config-db", () => ({
  checkCodeUniqueness: mockCheckCodeUniqueness,
}));

const FREE_RESULT = {
  clientCodeTaken: false,
  portfolioCodeTaken: false,
  parentAccountCodeTaken: false,
  clientCodeMessage: null,
  portfolioCodeMessage: null,
  parentAccountCodeMessage: null,
};

describe("GET /api/validate-code-uniqueness — request validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when no code is supplied", async () => {
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request("http://localhost:3000/api/validate-code-uniqueness");
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("clientCode");
  });

  it("returns 400 for a client code with invalid format", async () => {
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request("http://localhost:3000/api/validate-code-uniqueness?clientCode=TOOLONG");
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldige klantcode");
    expect(mockCheckCodeUniqueness).not.toHaveBeenCalled();
  });

  it("returns 400 for a portfolio code with invalid format", async () => {
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request("http://localhost:3000/api/validate-code-uniqueness?portfolioCode=x");
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldige portfoliocode");
  });

  it("returns 400 for a parent-account code with invalid format", async () => {
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request(
      "http://localhost:3000/api/validate-code-uniqueness?parentAccountCode=lower@code!",
    );
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Ongeldige parent account code");
    expect(mockCheckCodeUniqueness).not.toHaveBeenCalled();
  });

  it("uppercases input before validating", async () => {
    mockCheckCodeUniqueness.mockResolvedValue(FREE_RESULT);
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request("http://localhost:3000/api/validate-code-uniqueness?clientCode=hor");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mockCheckCodeUniqueness).toHaveBeenCalledWith({
      clientCode: "HOR",
      portfolioCode: undefined,
      parentAccountCode: undefined,
    });
  });
});

describe("GET /api/validate-code-uniqueness — uniqueness results", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with taken=true for a duplicate client code", async () => {
    mockCheckCodeUniqueness.mockResolvedValue({
      ...FREE_RESULT,
      clientCodeTaken: true,
      clientCodeMessage: "Klantcode HOR is al in gebruik.",
    });
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request("http://localhost:3000/api/validate-code-uniqueness?clientCode=HOR");
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.clientCodeTaken).toBe(true);
    expect(body.clientCodeMessage).toContain("al in gebruik");
    expect(body.portfolioCodeTaken).toBe(false);
    expect(body.parentAccountCodeTaken).toBe(false);
  });

  it("returns 200 with taken=false for a unique client code", async () => {
    mockCheckCodeUniqueness.mockResolvedValue(FREE_RESULT);
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request("http://localhost:3000/api/validate-code-uniqueness?clientCode=ZZZ");
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.clientCodeTaken).toBe(false);
    expect(body.clientCodeMessage).toBeNull();
  });

  it("checks all three codes in one request", async () => {
    mockCheckCodeUniqueness.mockResolvedValue({
      ...FREE_RESULT,
      portfolioCodeTaken: true,
      parentAccountCodeTaken: true,
      portfolioCodeMessage: "Portfoliocode HORRP is al in gebruik.",
      parentAccountCodeMessage: "Parent account code HOOFD_HOR is al in gebruik.",
    });
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request(
      "http://localhost:3000/api/validate-code-uniqueness?clientCode=ZZZ&portfolioCode=HORRP&parentAccountCode=HOOFD_HOR",
    );
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mockCheckCodeUniqueness).toHaveBeenCalledWith({
      clientCode: "ZZZ",
      portfolioCode: "HORRP",
      parentAccountCode: "HOOFD_HOR",
    });
    expect(body.portfolioCodeTaken).toBe(true);
    expect(body.parentAccountCodeTaken).toBe(true);
    expect(body.parentAccountCodeMessage).toContain("al in gebruik");
  });

  it("returns 500 when the database layer throws", async () => {
    mockCheckCodeUniqueness.mockRejectedValue(new Error("DB connection lost"));
    const { GET } = await import("@/app/api/validate-code-uniqueness/route");
    const request = new Request("http://localhost:3000/api/validate-code-uniqueness?clientCode=HOR");
    const response = await GET(request);
    expect(response.status).toBe(500);
  });
});
