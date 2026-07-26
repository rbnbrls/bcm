import { CATEGORIES } from "@/lib/dashboard-categories";
import { CategorySection } from "@/components/dashboard/category-section";

export function DashboardGrid() {
  return (
    <div className="dashboard-grid">
      {CATEGORIES.map((category) => (
        <CategorySection key={category.id} category={category} />
      ))}
    </div>
  );
}
