import type { DashboardCategory } from "@/lib/dashboard-categories";
import { CategoryCard } from "@/components/dashboard/category-card";

export function CategorySection({
  category,
}: {
  category: DashboardCategory;
}) {
  return (
    <section className="category-section" aria-labelledby={category.id}>
      <div className="category-section-header">
        <p className="eyebrow">{category.label}</p>
        <h2 id={category.id}>{category.title}</h2>
      </div>
      <div className="category-card-grid">
        <CategoryCard category={category} />
      </div>
    </section>
  );
}
