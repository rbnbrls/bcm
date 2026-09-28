import { createIdentitySessionToken, IDENTITY_SESSION_COOKIE } from "../../lib/identity/session";
import { getProfile, type RoleId } from "../../lib/rbac";

// ⚠️ SECURITY WARNING — the fallback value below is PUBLIC (committed to the
// repo). It is a LOCAL/CI-ONLY test secret: lib/identity/session.ts rejects
// it as a production BCM_SESSION_SECRET (see FORBIDDEN_PRODUCTION_SECRETS
// there), so it must NEVER be configured on the Coolify production app.
//
// Deploy CI injects the real production secret via the BCM_SESSION_SECRET
// Actions secret (.github/workflows/deploy.yml smoke step); that same value
// is configured in the Coolify application env. When it is present, this
// module signs with it so the smoke test's admin cookie is accepted by the
// deployed app.
export const E2E_SESSION_SECRET =
  process.env.BCM_SESSION_SECRET ?? "bcm-playwright-identity-session-secret";

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
