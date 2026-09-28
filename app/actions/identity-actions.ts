"use server";

import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getProfile, isRoleId, type RoleId } from "@/lib/rbac";
import { ROLE_GROUP_PREFIX } from "@/lib/identity/request";
import { isIdentitySwitcherEnabled } from "@/lib/identity/switcher";
import {
  createIdentitySessionToken,
  IDENTITY_SESSION_COOKIE,
  IDENTITY_SESSION_MAX_AGE_SECONDS,
} from "@/lib/identity/session";

export async function switchDevelopmentIdentity(role: RoleId): Promise<void> {
  if (!isIdentitySwitcherEnabled()) {
    throw new Error("Profiel wisselen is voor deze omgeving uitgeschakeld.");
  }
  if (!isRoleId(role)) throw new Error("Onbekend profiel.");

  const profile = getProfile(role);
  const token = createIdentitySessionToken({
    userId: `local:${role}`,
    displayName: profile.fullName,
    groups: [`${ROLE_GROUP_PREFIX}${role}`],
    tenant: process.env.BCM_IDENTITY_TENANT ?? "local",
    businessUnit: process.env.BCM_IDENTITY_BUSINESS_UNIT ?? "local",
    sessionId: randomUUID(),
  });
  (await cookies()).set(IDENTITY_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IDENTITY_SESSION_MAX_AGE_SECONDS,
  });
}
