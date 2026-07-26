import type { ChangeTypeConfig } from "@/lib/types";
import { ChangeTypeCard } from "@/components/change-type-card";

type Props = {
  types: ChangeTypeConfig[];
};

/**
 * Change type catalog grid.
 *
 * Server component that renders a grid of ChangeTypeCard components.
 * Pass pre-sorted, pre-filtered (active only) change types.
 */
export function ChangeTypeCatalog({ types }: Props) {
  if (types.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}>
        <p>Geen change types beschikbaar.</p>
      </div>
    );
  }

  return (
    <div className="change-type-catalog">
      {types.map((config) => (
        <ChangeTypeCard key={config.id} config={config} />
      ))}
    </div>
  );
}
