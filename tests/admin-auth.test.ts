/**
 * Unit tests for the admin-gate credential check (lib/admin-auth.ts).
 *
 * The proxy (route gate) and the admin server actions (defense in depth)
 * both rely on this pure function, so its fail-closed semantics are
 * pinned here:
 *   - valid credentials pass
 *   - wrong user / wrong password / malformed headers are rejected
 *   - missing env config denies EVERYTHING (no default credentials)
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  adminConfigIsSet,
  adminIsAuthorized,
  parseBasicAuthorization,
} from "@/lib/admin-auth";

const USER = "admin";
const PASSWORD = "s3cret-password";

function basicHeader(user: string, password: string): string {
  return "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
}

describe("adminIsAuthorized", () => {
  beforeEach(() => {
    process.env.ADMIN_USER = USER;
    process.env.ADMIN_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
  });

  it("accepts matching credentials", () => {
    expect(adminIsAuthorized(basicHeader(USER, PASSWORD))).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(adminIsAuthorized(basicHeader(USER, "wrong-password"))).toBe(false);
  });

  it("rejects a wrong user", () => {
    expect(adminIsAuthorized(basicHeader("root", PASSWORD))).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(adminIsAuthorized(null)).toBe(false);
  });

  it("rejects a non-Basic scheme", () => {
    expect(adminIsAuthorized(`Bearer ${Buffer.from("x:y").toString("base64")}`)).toBe(false);
  });

  it("rejects malformed base64 and missing colons", () => {
    expect(adminIsAuthorized("Basic !!!not-base64!!!")).toBe(false);
    expect(adminIsAuthorized("Basic " + Buffer.from("nocolon").toString("base64"))).toBe(false);
  });

  it("fails closed when the env credentials are not configured", () => {
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
    expect(adminConfigIsSet()).toBe(false);
    // Even a header that would otherwise match is rejected.
    expect(adminIsAuthorized(basicHeader(USER, PASSWORD))).toBe(false);
  });
});

describe("parseBasicAuthorization", () => {
  it("extracts user and password", () => {
    expect(parseBasicAuthorization(basicHeader(USER, PASSWORD))).toEqual({
      user: USER,
      password: PASSWORD,
    });
  });

  it("handles passwords containing colons", () => {
    expect(parseBasicAuthorization(basicHeader(USER, "pa:ss:wo:rd"))).toEqual({
      user: USER,
      password: "pa:ss:wo:rd",
    });
  });

  it("returns null for null, wrong scheme and garbage", () => {
    expect(parseBasicAuthorization(null)).toBeNull();
    expect(parseBasicAuthorization("Basic")).toBeNull();
    expect(parseBasicAuthorization("")).toBeNull();
  });
});
