import type { Permission, RoleId, UserProfile } from "@/lib/rbac";

export type NavigationItemPermission = {
  hrefPrefix: string;
  permission: Permission;
};

export type NavigationItem = {
  label: string;
  href: string;
};

export type RbacConfig = {
  defaultRole: RoleId;
  profiles: UserProfile[];
  accessDeniedMessages: Record<Permission, string>;
  navigationItems: NavigationItem[];
  navigationPermissions: NavigationItemPermission[];
};

export const RBAC_CONFIG: RbacConfig = {
  defaultRole: "change_manager",
  profiles: [
    {
      id: "change_manager",
      label: "Change manager",
      fullName: "Chris Change",
      shortLabel: "CM",
      description: "Kan changes aanmaken en voorbereiden.",
      permissions: ["changes:create"],
    },
    {
      id: "account_manager",
      label: "Account manager",
      fullName: "Arjan Accountmanager",
      shortLabel: "AM",
      description: "Kan changes beoordelen en goedkeuren.",
      permissions: ["changes:approve"],
    },
    {
      id: "admin",
      label: "Beheerder",
      fullName: "Bert Beheerder",
      shortLabel: "BH",
      description: "Kan alle beheerfuncties gebruiken.",
      permissions: ["admin:access"],
    },
  ],
  accessDeniedMessages: {
    "changes:create": "Alleen een Change manager kan changes aanmaken.",
    "changes:approve": "Alleen een Account manager kan changes goedkeuren of afwijzen.",
    "admin:access": "Niet geautoriseerd. Alleen een Beheerder kan beheerfuncties gebruiken.",
  },
  navigationItems: [
    { label: "Dashboard", href: "/" },
    { label: "Wijzigingen", href: "/changes" },
    { label: "Rapportages", href: "/reports" },
    { label: "Beheer", href: "/admin" },
  ],
  navigationPermissions: [
    { hrefPrefix: "/admin", permission: "admin:access" },
  ],
};
