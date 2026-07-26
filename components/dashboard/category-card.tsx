import Link from "next/link";
import type { DashboardCategory } from "@/lib/dashboard-categories";

export function CategoryCard({ category }: { category: DashboardCategory }) {
  return (
    <article className="category-card">
      <div className="category-card-icon">{category.icon}</div>
      <h3 className="category-card-title">{category.title}</h3>
      <p className="category-card-subtitle">{category.subtitle}</p>
      <div className="category-card-actions">
        {category.actions.map((action, index) => (
          <Link
            key={action.href}
            href={action.href}
            className={
              index === 0
                ? "category-card-action primary-link"
                : "category-card-action"
            }
          >
            {action.label}
            {action.description && (
              <span className="category-card-action-desc">
                {action.description}
              </span>
            )}
          </Link>
        ))}
      </div>
    </article>
  );
}
