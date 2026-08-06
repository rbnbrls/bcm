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
  workflowRoleDelegation: Record<RoleId, RoleId[]>;
};

export const RBAC_CONFIG: RbacConfig = {
  defaultRole: "change_manager",
  profiles: [
    {
      id: "change_manager",
      label: "Change manager",
      fullName: "Chris Change",
      shortLabel: "CM",
      description: "Kan changes aanmaken en workflows ontwerpen, testen en publiceren.",
      permissions: [
        "changes:create",
        "workflow:view",
        "workflow:design",
        "workflow:test",
        "workflow:publish",
        "workflow:start",
        "workflow:tasks:execute",
        "workflow:manage",
        "workflow:deprecate",
      ],
    },
    {
      id: "account_manager",
      label: "Account manager",
      fullName: "Arjan Accountmanager",
      shortLabel: "AM",
      description: "Kan changes en toegewezen workflowtaken beoordelen en goedkeuren.",
      permissions: [
        "changes:approve",
        "workflow:view",
        "workflow:tasks:execute",
        "workflow:approve",
      ],
    },
    {
      id: "admin",
      label: "Beheerder",
      fullName: "Bert Beheerder",
      shortLabel: "BH",
      description: "Kan alle beheerfuncties gebruiken.",
      permissions: [
        "admin:access",
        "workflow:view",
        "workflow:manage",
        "workflow:deprecate",
      ],
    },
  ],
  accessDeniedMessages: {
    "changes:create": "Alleen een Change manager kan changes aanmaken.",
    "changes:approve": "Alleen een Account manager kan changes goedkeuren of afwijzen.",
    "admin:access": "Niet geautoriseerd. Alleen een Beheerder kan beheerfuncties gebruiken.",
    "workflow:view": "Je mag Workflow Studio niet bekijken.",
    "workflow:design": "Je mag geen workflows ontwerpen.",
    "workflow:test": "Je mag workflows niet testen.",
    "workflow:publish": "Je mag workflows niet publiceren.",
    "workflow:start": "Je mag geen workflows starten.",
    "workflow:tasks:execute": "Je mag geen workflowtaken uitvoeren.",
    "workflow:approve": "Je mag workflowbeslissingen niet goedkeuren.",
    "workflow:manage": "Je mag workflows of rolbindingen niet beheren.",
    "workflow:deprecate": "Je mag workflows niet uitfaseren.",
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
  workflowRoleDelegation: {
    change_manager: ["change_manager", "account_manager"],
    account_manager: [],
    admin: ["change_manager", "account_manager"],
  },
};
