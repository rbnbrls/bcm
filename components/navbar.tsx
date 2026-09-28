"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavigationItem } from "@/lib/rbac-config";

export function NavBar({ items }: { items: readonly NavigationItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Hoofdnavigatie">
      {items.map(({ label, href }) => {
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
