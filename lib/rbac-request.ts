import { cookies } from "next/headers";
import {
  ACCESS_DENIED_MESSAGES,
  ACTIVE_ROLE_COOKIE,
  type Permission,
  type RoleId,
  getProfile,
  resolveRole,
  roleHasPermission,
} from "@/lib/rbac";

export type AccessResult =
  | { authorized: true; role: RoleId; label: string }
  | { authorized: false; role: RoleId; label: string; message: string };

export async function getActiveRole(): Promise<RoleId> {
  try {
    const store = await cookies();
    const cookieRole = store.get(ACTIVE_ROLE_COOKIE)?.value;
    if (cookieRole) return resolveRole(cookieRole);
  } catch {
    // No request scope or no mocked cookie store: use the default profile.
  }

  return resolveRole(undefined);
}

export async function requirePermission(permission: Permission): Promise<AccessResult> {
  const role = await getActiveRole();
  const profile = getProfile(role);
  if (roleHasPermission(role, permission)) {
    return { authorized: true, role, label: profile.label };
  }
  return {
    authorized: false,
    role,
    label: profile.label,
    message: ACCESS_DENIED_MESSAGES[permission],
  };
}

export function accessDeniedIssue(result: Exclude<AccessResult, { authorized: true }>): string {
  return `${result.message} Actief profiel: ${result.label}.`;
}
