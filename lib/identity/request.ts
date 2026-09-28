import type { IdentityContext, IdentityProvider, IdentityRequest } from "@/lib/identity/types";
import { signedSessionIdentityProvider } from "@/lib/identity/provider";
import { getProfile, isRoleId } from "@/lib/rbac";

export const ROLE_GROUP_PREFIX = "bcm:role:";

function configuredIdentity(): IdentityContext {
  const configuredGroups = process.env.BCM_IDENTITY_GROUPS
    ?.split(",")
    .map((group) => group.trim())
    .filter(Boolean);
  const developmentRole = process.env.BCM_DEVELOPMENT_IDENTITY_ROLE ?? "change_manager";
  const role = isRoleId(developmentRole) ? developmentRole : "change_manager";
  const profile = getProfile(role);
  const production = process.env.NODE_ENV === "production";

  return {
    userId: process.env.BCM_IDENTITY_USER_ID ?? (production ? "anonymous" : `local:${role}`),
    displayName: process.env.BCM_IDENTITY_DISPLAY_NAME ?? (production ? "Niet aangemeld" : profile.fullName),
    groups: configuredGroups ?? (production ? [] : [`${ROLE_GROUP_PREFIX}${role}`]),
    tenant: process.env.BCM_IDENTITY_TENANT ?? null,
    businessUnit: process.env.BCM_IDENTITY_BUSINESS_UNIT ?? null,
    sessionId: process.env.BCM_IDENTITY_SESSION_ID ?? (production ? "anonymous" : `local-${role}`),
  };
}

async function currentRequest(): Promise<IdentityRequest> {
  try {
    const { cookies } = await import("next/headers");
    return { cookies: await cookies() };
  } catch {
    // Unit tests and non-request jobs have no Next.js request scope. They use
    // the server-configured identity below; no browser role state is read.
    return { cookies: { get: () => undefined } };
  }
}

export async function getIdentityContext(
  request?: IdentityRequest,
  provider: IdentityProvider = signedSessionIdentityProvider,
): Promise<IdentityContext> {
  const identity = await provider.getIdentity(request ?? await currentRequest());
  return identity ?? configuredIdentity();
}
