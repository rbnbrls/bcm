import { afterEach, describe, expect, it } from "vitest";
import { getIdentityContext } from "@/lib/identity/request";
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
