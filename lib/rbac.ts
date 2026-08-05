import { RBAC_CONFIG } from "@/lib/rbac-config";

export const ACTIVE_ROLE_COOKIE = "bcm_active_role";

export type RoleId = string;

export type Permission =
  | "changes:create"
  | "changes:approve"
  | "admin:access";

export type UserProfile = {
  id: RoleId;
  label: string;
  fullName: string;
  shortLabel: string;
  description: string;
  permissions: Permission[];
};

export const USER_PROFILES: UserProfile[] = RBAC_CONFIG.profiles;

export const DEFAULT_ROLE: RoleId = RBAC_CONFIG.defaultRole;

export const ACCESS_DENIED_MESSAGES: Record<Permission, string> = RBAC_CONFIG.accessDeniedMessages;

export const NAVIGATION_ITEMS = RBAC_CONFIG.navigationItems;

export function isRoleId(value: unknown): value is RoleId {
  return USER_PROFILES.some((profile) => profile.id === value);
}

export function resolveRole(value: unknown): RoleId {
  return isRoleId(value) ? value : DEFAULT_ROLE;
}

export function getProfile(role: RoleId): UserProfile {
  return USER_PROFILES.find((profile) => profile.id === role) ?? USER_PROFILES[0];
}

export function roleHasPermission(role: RoleId, permission: Permission): boolean {
  return getProfile(role).permissions.includes(permission);
}

export function canNavigateTo(role: RoleId, href: string): boolean {
  const rule = RBAC_CONFIG.navigationPermissions.find((item) => href.startsWith(item.hrefPrefix));
  return rule ? roleHasPermission(role, rule.permission) : true;
}
