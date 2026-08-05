"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { readRoleFromCookie } from "@/lib/active-profile-client";
import { roleHasPermission } from "@/lib/rbac";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Wijzigingen", href: "/changes" },
  { label: "Rapportages", href: "/reports" },
  { label: "Beheer", href: "/admin" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);

  useEffect(() => {
    function syncRole() {
      setCanAccessAdmin(roleHasPermission(readRoleFromCookie(), "admin:access"));
    }

    syncRole();
    window.addEventListener("bcm-role-change", syncRole);
    return () => window.removeEventListener("bcm-role-change", syncRole);
  }, []);

  return (
    <nav aria-label="Hoofdnavigatie">
      {NAV_ITEMS.map(({ label, href }) => {
        if (href === "/admin" && !canAccessAdmin) return null;
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
