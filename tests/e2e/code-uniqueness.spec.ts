import { test, expect } from "@playwright/test";

/**
 * E2E tests for client code / portfolio code uniqueness validation.
 *
 * Acceptance criteria:
 *  - Duplicate codes show validation errors (taken=true)
 *  - Unique codes pass (taken=false)
 *
 * Runs against the demo fixture fallback (no DB required): HOR is a demo
 * client code, HORRP is a demo portfolio code, ZZZ / ZZZRP are free.
 */
test.describe("Code uniqueness validation API", () => {
  test("duplicate client code is reported taken", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?clientCode=HOR");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.clientCodeTaken).toBe(true);
    expect(body.clientCodeMessage).toContain("al in gebruik");
  });

  test("unique client code passes", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?clientCode=ZZZ");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.clientCodeTaken).toBe(false);
    expect(body.clientCodeMessage).toBeNull();
  });

  test("duplicate portfolio code is reported taken", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?portfolioCode=HORRP");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.portfolioCodeTaken).toBe(true);
    expect(body.portfolioCodeMessage).toContain("al in gebruik");
  });

  test("unique portfolio code passes", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?portfolioCode=ZZZRP");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.portfolioCodeTaken).toBe(false);
    expect(body.portfolioCodeMessage).toBeNull();
  });

  test("both codes are checked in one call", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?clientCode=HOR&portfolioCode=ZZZRP");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.clientCodeTaken).toBe(true);
    expect(body.portfolioCodeTaken).toBe(false);
  });

  test("duplicate parent-account code is reported taken", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?parentAccountCode=HOOFD_HOR");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.parentAccountCodeTaken).toBe(true);
    expect(body.parentAccountCodeMessage).toContain("al in gebruik");
  });

  test("unique parent-account code passes", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?parentAccountCode=HOOFD_ZZZ");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.parentAccountCodeTaken).toBe(false);
    expect(body.parentAccountCodeMessage).toBeNull();
  });

  test("invalid format returns 400 with a Dutch error message", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness?clientCode=TOOLONG");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Ongeldige klantcode");
  });

  test("missing codes returns 400", async ({ request }) => {
    const res = await request.get("/api/validate-code-uniqueness");
    expect(res.status()).toBe(400);
  });
});
