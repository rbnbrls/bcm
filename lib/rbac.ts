export const ACTIVE_ROLE_COOKIE = "bcm_active_role";

export type RoleId = "account_manager" | "change_manager" | "admin";

export type Permission =
  | "changes:create"
  | "changes:approve"
  | "admin:access";

export type UserProfile = {
  id: RoleId;
  label: string;
  shortLabel: string;
  description: string;
  permissions: Permission[];
};

export const USER_PROFILES: UserProfile[] = [
  {
    id: "change_manager",
    label: "Change manager",
    shortLabel: "CM",
    description: "Kan changes aanmaken en voorbereiden.",
    permissions: ["changes:create"],
  },
  {
    id: "account_manager",
    label: "Account manager",
    shortLabel: "AM",
    description: "Kan changes beoordelen en goedkeuren.",
    permissions: ["changes:approve"],
  },
  {
    id: "admin",
    label: "Beheerder",
    shortLabel: "BH",
    description: "Kan alle beheerfuncties gebruiken.",
    permissions: ["admin:access"],
  },
];

export const DEFAULT_ROLE: RoleId = "change_manager";

export const ACCESS_DENIED_MESSAGES: Record<Permission, string> = {
  "changes:create": "Alleen een Change manager kan changes aanmaken.",
  "changes:approve": "Alleen een Account manager kan changes goedkeuren of afwijzen.",
  "admin:access": "Niet geautoriseerd. Alleen een Beheerder kan beheerfuncties gebruiken.",
};

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
