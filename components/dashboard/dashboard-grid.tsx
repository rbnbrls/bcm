"use client";

import { useState } from "react";
import { MAIN_CATEGORIES } from "@/lib/dashboard-categories";
import { CategorySection } from "@/components/dashboard/category-section";

export function DashboardGrid() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="dashboard-grid">
      {MAIN_CATEGORIES.map((category) => (
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
