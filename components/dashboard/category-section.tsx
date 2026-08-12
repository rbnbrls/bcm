import type { MainCategory } from "@/lib/dashboard-categories";
import Link from "next/link";

export function CategorySection({
  category,
  isOpen,
  onToggle,
}: {
  category: MainCategory;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      className={`main-category ${isOpen ? "main-category--open" : ""}`}
      aria-labelledby={`cat-${category.id}`}
    >
      <button
        className="main-category-header"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`panel-${category.id}`}
      >
        <span className="main-category-icon">{category.icon}</span>
        <span className="main-category-label">{category.label}</span>
        <h2 id={`cat-${category.id}`} className="main-category-title">
          {category.title}
        </h2>
        <span className={`chevron ${isOpen ? "chevron--open" : ""}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 6 8 10 12 6" />
          </svg>
        </span>
      </button>

      <div
        id={`panel-${category.id}`}
        className="accordion-panel"
        role="region"
        aria-labelledby={`cat-${category.id}`}
        hidden={!isOpen}
      >
        <div className="accordion-panel-inner">
          {category.items.map((action) => (
            <Link
              // Key by label, not href: the "Change aanvragen →" and
              // "Change catalogus →" dashboard actions both point to
              // /change-catalog (catalog-first flow), so href is not unique.
              key={action.label}
              href={action.href}
              className="category-action-link"
            >
              <span className="category-action-link-label">{action.label}</span>
              {action.description && (
                <span className="category-action-link-desc">
                  {action.description}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
