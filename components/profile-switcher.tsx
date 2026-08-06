"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { switchDevelopmentIdentity } from "@/app/actions/identity-actions";
import {
  ACTIVE_ROLE_COOKIE,
  USER_PROFILES,
  getProfile,
  resolveRole,
  type RoleId,
} from "@/lib/rbac";

function writeRoleCookie(role: RoleId) {
  document.cookie = `${ACTIVE_ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; Max-Age=2592000; SameSite=Lax`;
  window.dispatchEvent(new Event("bcm-role-change"));
}

export function ProfileSwitcher({ initialRole, enabled }: { initialRole: RoleId; enabled: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<RoleId>(initialRole);

  useEffect(() => {
    // Presentation-only mirror for legacy client components. Server RBAC never reads it.
    writeRoleCookie(initialRole);
  }, [initialRole]);

  const profile = getProfile(role);

  async function handleChange(nextRole: RoleId) {
    await switchDevelopmentIdentity(nextRole);
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
        disabled={!enabled}
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
