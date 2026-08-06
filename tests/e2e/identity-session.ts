import { createIdentitySessionToken, IDENTITY_SESSION_COOKIE } from "../../lib/identity/session";
import { getProfile, type RoleId } from "../../lib/rbac";

export const E2E_SESSION_SECRET = "bcm-playwright-identity-session-secret";

export function identitySessionCookie(role: RoleId): { name: string; value: string } {
  const profile = getProfile(role);
  return {
    name: IDENTITY_SESSION_COOKIE,
    value: createIdentitySessionToken({
      userId: `e2e:${role}`,
      displayName: profile.fullName,
      groups: [`bcm:role:${role}`],
      tenant: "e2e",
      businessUnit: "e2e",
      sessionId: `e2e-${role}`,
    }, { secret: E2E_SESSION_SECRET }),
  };
}
