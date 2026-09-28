import { afterEach, describe, expect, it } from "vitest";
import { getIdentityContext } from "@/lib/identity/request";
import { isIdentitySwitcherEnabled } from "@/lib/identity/switcher";
import { requirePermission } from "@/lib/rbac-request";
import {
  createIdentitySessionToken,
  IDENTITY_SESSION_COOKIE,
  verifyIdentitySessionToken,
} from "@/lib/identity/session";

const originalRole = process.env.BCM_DEVELOPMENT_IDENTITY_ROLE;

function requestWithCookies(values: Record<string, string>) {
  return {
    cookies: {
      get(name: string) {
        return values[name] ? { value: values[name] } : undefined;
      },
    },
  };
}

afterEach(() => {
  if (originalRole === undefined) delete process.env.BCM_DEVELOPMENT_IDENTITY_ROLE;
  else process.env.BCM_DEVELOPMENT_IDENTITY_ROLE = originalRole;
});

describe("server-side identity context", () => {
  it("round-trips all required identity fields through a signed session", () => {
    const token = createIdentitySessionToken({
      userId: "user-42",
      displayName: "Ada Beheerder",
      groups: ["bcm:role:admin", "team:operations"],
      tenant: "tenant-a",
      businessUnit: "investments",
      sessionId: "session-42",
    }, { secret: "test-secret", now: 1_000 });

    expect(verifyIdentitySessionToken(token, { secret: "test-secret", now: 2_000 })).toEqual({
      userId: "user-42",
      displayName: "Ada Beheerder",
      groups: ["bcm:role:admin", "team:operations"],
      tenant: "tenant-a",
      businessUnit: "investments",
      sessionId: "session-42",
    });
  });

  it("rejects a modified session payload", () => {
    const token = createIdentitySessionToken({
      userId: "user-1",
      displayName: "Chris Change",
      groups: ["bcm:role:change_manager"],
      tenant: null,
      businessUnit: null,
    }, { secret: "test-secret" });
    const [payload, signature] = token.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;

    expect(verifyIdentitySessionToken(`${tamperedPayload}.${signature}`, { secret: "test-secret" })).toBeNull();
  });

  it("does not grant admin access from the legacy browser role cookie", async () => {
    process.env.BCM_DEVELOPMENT_IDENTITY_ROLE = "change_manager";
    const request = requestWithCookies({ bcm_active_role: "admin" });

    const identity = await getIdentityContext(request);
    const access = await requirePermission("admin:access", request);

    expect(identity.groups).toEqual(["bcm:role:change_manager"]);
    expect(access.authorized).toBe(false);
  });

  it("derives authorization from signed identity groups", async () => {
    const token = createIdentitySessionToken({
      userId: "admin-1",
      displayName: "Bert Beheerder",
      groups: ["bcm:role:admin"],
      tenant: "tenant-a",
      businessUnit: "operations",
    });
    const access = await requirePermission("admin:access", requestWithCookies({
      [IDENTITY_SESSION_COOKIE]: token,
      bcm_active_role: "change_manager",
    }));

    expect(access.authorized).toBe(true);
    if (access.authorized) expect(access.identity.userId).toBe("admin-1");
  });
});

describe("identity switcher gate", () => {
  it("is enabled outside production unless explicitly disabled", () => {
    expect(isIdentitySwitcherEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isIdentitySwitcherEnabled({
      NODE_ENV: "development",
      BCM_DISABLE_IDENTITY_SWITCHER: "yes",
    })).toBe(false);
  });

  it("can be enabled explicitly for deployed UAT builds", () => {
    expect(isIdentitySwitcherEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isIdentitySwitcherEnabled({
      NODE_ENV: "production",
      BCM_ENABLE_IDENTITY_SWITCHER: "true",
    })).toBe(true);
  });

  it("lets the disable flag override explicit enablement", () => {
    expect(isIdentitySwitcherEnabled({
      NODE_ENV: "production",
      BCM_ENABLE_IDENTITY_SWITCHER: "true",
      BCM_DISABLE_IDENTITY_SWITCHER: "1",
    })).toBe(false);
  });
});

describe("production session secret guard", () => {
  // NODE_ENV is typed read-only on ProcessEnv; cast to mutate it in tests.
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSessionSecret = process.env.BCM_SESSION_SECRET;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
    if (originalSessionSecret === undefined) delete process.env.BCM_SESSION_SECRET;
    else process.env.BCM_SESSION_SECRET = originalSessionSecret;
  });

  it("rejects the committed e2e secret as the production BCM_SESSION_SECRET", () => {
    // Forge a token the way an attacker would: sign with the committed,
    // public e2e secret (tests/e2e/identity-session.ts) outside production.
    const forged = createIdentitySessionToken({
      userId: "attacker",
      displayName: "Eve",
      groups: ["bcm:role:admin"],
      tenant: null,
      businessUnit: null,
    }, { secret: "bcm-playwright-identity-session-secret" });

    env.NODE_ENV = "production";
    process.env.BCM_SESSION_SECRET = "bcm-playwright-identity-session-secret";

    // Token creation fails closed (the forbidden secret is treated as unset).
    expect(() =>
      createIdentitySessionToken({
        userId: "attacker",
        displayName: "Eve",
        groups: ["bcm:role:admin"],
        tenant: null,
        businessUnit: null,
      }),
    ).toThrow(/BCM_SESSION_SECRET/);

    // Verification rejects forged cookies, via both the env and the
    // explicitly supplied secret.
    expect(verifyIdentitySessionToken(forged)).toBeNull();
    expect(
      verifyIdentitySessionToken(forged, { secret: "bcm-playwright-identity-session-secret" }),
    ).toBeNull();
  });

  it("accepts a legitimate production secret", () => {
    env.NODE_ENV = "production";
    process.env.BCM_SESSION_SECRET = "real-random-production-secret-0123456789abcdef";

    const token = createIdentitySessionToken({
      userId: "admin-1",
      displayName: "Bert Beheerder",
      groups: ["bcm:role:admin"],
      tenant: null,
      businessUnit: null,
    });

    expect(verifyIdentitySessionToken(token)).not.toBeNull();
  });

  it("still accepts the committed e2e secret outside production", () => {
    env.NODE_ENV = "development";

    const token = createIdentitySessionToken({
      userId: "e2e:admin",
      displayName: "E2E Beheerder",
      groups: ["bcm:role:admin"],
      tenant: "e2e",
      businessUnit: "e2e",
    }, { secret: "bcm-playwright-identity-session-secret" });

    expect(
      verifyIdentitySessionToken(token, { secret: "bcm-playwright-identity-session-secret" }),
    ).not.toBeNull();
  });
});
