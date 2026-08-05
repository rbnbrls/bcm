"use client";

import { useEffect, useMemo, useState } from "react";
import { MAIN_CATEGORIES } from "@/lib/dashboard-categories";
import { CategorySection } from "@/components/dashboard/category-section";
import { readRoleFromCookie } from "@/lib/active-profile-client";
import { roleHasPermission } from "@/lib/rbac";

export function DashboardGrid() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);

  useEffect(() => {
    function syncRole() {
      setCanAccessAdmin(roleHasPermission(readRoleFromCookie(), "admin:access"));
    }

    syncRole();
    window.addEventListener("bcm-role-change", syncRole);
    return () => window.removeEventListener("bcm-role-change", syncRole);
  }, []);

  const categories = useMemo(
    () => MAIN_CATEGORIES.map((category) => ({
      ...category,
      items: canAccessAdmin
        ? category.items
        : category.items.filter((item) => !item.href.startsWith("/admin")),
    })).filter((category) => category.items.length > 0),
    [canAccessAdmin],
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
