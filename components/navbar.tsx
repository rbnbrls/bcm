"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { readRoleFromCookie } from "@/lib/active-profile-client";
import { NAVIGATION_ITEMS, canNavigateTo, type RoleId } from "@/lib/rbac";

export function NavBar() {
  const pathname = usePathname();
  const [activeRole, setActiveRole] = useState<RoleId>(() => readRoleFromCookie());

  useEffect(() => {
    function syncRole() {
      setActiveRole(readRoleFromCookie());
    }

    syncRole();
    window.addEventListener("bcm-role-change", syncRole);
    return () => window.removeEventListener("bcm-role-change", syncRole);
  }, []);

  return (
    <nav aria-label="Hoofdnavigatie">
      {NAVIGATION_ITEMS.map(({ label, href }) => {
        if (!canNavigateTo(activeRole, href)) return null;
        // Dashboard (/) must match exactly — not prefix-match (would match ALL paths)
        // Other items match when pathname starts with their href
        const isActive = href === "/"
          ? pathname === "/"
          : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "nav-link--active" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
