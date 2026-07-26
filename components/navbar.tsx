"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Wijzigingen", href: "/changes" },
  { label: "Rapportages", href: "/reports" },
  { label: "Beheer", href: "/admin" },
] as const;

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Hoofdnavigatie">
      {NAV_ITEMS.map(({ label, href }) => {
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
