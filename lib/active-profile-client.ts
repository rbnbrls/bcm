"use client";

import {
  ACTIVE_ROLE_COOKIE,
  DEFAULT_ROLE,
  getProfile,
  resolveRole,
  type RoleId,
  type UserProfile,
} from "@/lib/rbac";

export function readRoleFromCookie(): RoleId {
  if (typeof document === "undefined") return DEFAULT_ROLE;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${ACTIVE_ROLE_COOKIE}=`));
  return resolveRole(match ? decodeURIComponent(match.split("=").slice(1).join("=")) : undefined);
}

export function getActiveProfileFromCookie(): UserProfile {
  return getProfile(readRoleFromCookie());
}

export function getActiveProfileName(): string {
  return getActiveProfileFromCookie().fullName;
}
