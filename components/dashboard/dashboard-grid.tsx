"use client";

import { useEffect, useMemo, useState } from "react";
import { MAIN_CATEGORIES } from "@/lib/dashboard-categories";
import { CategorySection } from "@/components/dashboard/category-section";
import { readRoleFromCookie } from "@/lib/active-profile-client";
import { canNavigateTo, DEFAULT_ROLE, type RoleId } from "@/lib/rbac";

export function DashboardGrid({ initialRole = DEFAULT_ROLE }: { initialRole?: RoleId }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleId>(initialRole);

  useEffect(() => {
    function syncRole() {
      setActiveRole(readRoleFromCookie());
    }

    syncRole();
    window.addEventListener("bcm-role-change", syncRole);
    return () => window.removeEventListener("bcm-role-change", syncRole);
  }, []);

  const categories = useMemo(
    () => MAIN_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter((item) => canNavigateTo(activeRole, item.href)),
    })).filter((category) => category.items.length > 0),
    [activeRole],
  );

  const toggleSection = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="dashboard-grid">
      {categories.map((category) => (
        <CategorySection
          key={category.id}
          category={category}
          isOpen={openId === category.id}
          onToggle={() => toggleSection(category.id)}
        />
      ))}
    </div>
  );
}
