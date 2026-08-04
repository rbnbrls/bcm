"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ACTIVE_ROLE_COOKIE,
  DEFAULT_ROLE,
  USER_PROFILES,
  type RoleId,
  getProfile,
  resolveRole,
} from "@/lib/rbac";

function readRoleFromCookie(): RoleId {
  if (typeof document === "undefined") return DEFAULT_ROLE;
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${ACTIVE_ROLE_COOKIE}=`));
  return resolveRole(match ? decodeURIComponent(match.split("=").slice(1).join("=")) : undefined);
}

function writeRoleCookie(role: RoleId) {
  document.cookie = `${ACTIVE_ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function ProfileSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<RoleId>(() => readRoleFromCookie());

  useEffect(() => {
    if (!document.cookie.includes(`${ACTIVE_ROLE_COOKIE}=`)) {
      writeRoleCookie(readRoleFromCookie());
    }
  }, []);

  const profile = getProfile(role);

  function handleChange(nextRole: RoleId) {
    writeRoleCookie(nextRole);
    setRole(nextRole);
    if (pathname.startsWith("/admin") && nextRole !== "admin") {
      router.push("/");
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <label className="profile-switcher" title={profile.description}>
      <span className="avatar" aria-hidden="true">{profile.shortLabel}</span>
      <span className="sr-only">Actief profiel</span>
      <select
        aria-label="Actief profiel"
        value={role}
        onChange={(event) => handleChange(resolveRole(event.target.value))}
      >
        {USER_PROFILES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
