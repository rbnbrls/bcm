"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ACTIVE_ROLE_COOKIE,
  USER_PROFILES,
  getProfile,
  resolveRole,
  type RoleId,
} from "@/lib/rbac";
import { readRoleFromCookie } from "@/lib/active-profile-client";

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
