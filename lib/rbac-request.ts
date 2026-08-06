import {
  ACCESS_DENIED_MESSAGES,
  type Permission,
  type RoleId,
  getIdentityRoles,
  getProfile,
  identityHasPermission,
} from "@/lib/rbac";
import type { IdentityContext, IdentityRequest } from "@/lib/identity/types";
import { getIdentityContext } from "@/lib/identity/request";

export type AccessResult =
  | { authorized: true; role: RoleId | null; label: string; identity: IdentityContext }
  | { authorized: false; role: RoleId | null; label: string; identity: IdentityContext; message: string };

export async function getActiveRole(request?: IdentityRequest): Promise<RoleId | null> {
  const identity = await getIdentityContext(request);
  return getIdentityRoles(identity)[0] ?? null;
}

export async function requirePermission(permission: Permission, request?: IdentityRequest): Promise<AccessResult> {
  const identity = await getIdentityContext(request);
  const roles = getIdentityRoles(identity);
  const role = roles[0] ?? null;
  const label = roles.map((item) => getProfile(item).label).join(", ") || "Niet aangemeld";
  if (identityHasPermission(identity, permission)) {
    return { authorized: true, role, label, identity };
  }
  return {
    authorized: false,
    role,
    label,
    identity,
    message: ACCESS_DENIED_MESSAGES[permission],
  };
}

export function accessDeniedIssue(result: Exclude<AccessResult, { authorized: true }>): string {
  return `${result.message} Actief profiel: ${result.label}.`;
}
