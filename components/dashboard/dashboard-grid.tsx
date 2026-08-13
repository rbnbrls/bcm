"use client";

import { useEffect, useMemo, useState } from "react";
import { MAIN_CATEGORIES } from "@/lib/dashboard-categories";
import { CategorySection } from "@/components/dashboard/category-section";
import { readRoleFromCookie } from "@/lib/active-profile-client";
import { canNavigateTo, DEFAULT_ROLE, type RoleId } from "@/lib/rbac";
import type { FeatureFlagSnapshot } from "@/lib/feature-flags";

export function DashboardGrid({
  initialRole = DEFAULT_ROLE,
  initialFlags,
}: {
  initialRole?: RoleId;
  // Feature flags are server-owned (process.env) and never inlined into
  // client bundles, so the server passes its snapshot down for client-side
  // navigation filtering (e.g. the /workflow-studio dashboard action is
  // gated by the workflow_studio.builder flag).
  initialFlags?: FeatureFlagSnapshot;
}) {
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
      items: category.items.filter((item) => canNavigateTo(activeRole, item.href, initialFlags)),
    })).filter((category) => category.items.length > 0),
    [activeRole, initialFlags],
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
