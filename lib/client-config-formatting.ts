/**
 * Conditional formatting helpers for the client-config admin table.
 *
 * Provides color-coded labels, badge classes, and other visual formatting
 * for portfolio configuration rows. All helpers are pure functions suitable
 * for both server-side rendering and client-side use.
 *
 * @module lib/client-config-formatting
 */
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

// ═════════════════════════════════════════════════════════════════════
// Asset class color mapping
// ═════════════════════════════════════════════════════════════════════

const ASSET_CLASS_COLORS: Record<string, string> = {
  CS: "var(--ac-cash, #22c55e)",       // Cash — green
  EQ: "var(--ac-equities, #3b82f6)",   // Equities — blue
  FI: "var(--ac-fixed-income, #f59e0b)", // Fixed Income — amber
  RA: "var(--ac-real-assets, #8b5cf6)", // Real Assets — purple
  AL: "var(--ac-alternatives, #ec4899)", // Alternatives — pink
  MA: "var(--ac-multi-assets, #06b6d4)", // Multi Assets — cyan
  OV: "var(--ac-overlay, #f97316)",     // Overlay — orange
  IM: "var(--ac-impact, #10b981)",      // Impact — emerald
};

const ASSET_CLASS_LABELS: Record<string, string> = {
  CS: "Cash",
  EQ: "Equities",
  FI: "Fixed Income",
  RA: "Real Assets",
  AL: "Alternatives",
  MA: "Multi Assets",
  OV: "Overlay",
  IM: "Impact",
};

const NPC_CLASSIFICATION_COLORS: Record<number, string> = {
  1: "var(--npc-match, #3b82f6)",      // Match — blue
  2: "var(--npc-return, #22c55e)",     // Return — green
  3: "var(--npc-opbouw, #f59e0b)",     // Opbouw — amber
};

const NPC_CLASSIFICATION_LABELS: Record<number, string> = {
  1: "Match",
  2: "Return",
  3: "Opbouw",
};

// ═════════════════════════════════════════════════════════════════════
// Public helpers
// ═════════════════════════════════════════════════════════════════════

/**
 * Return the CSS color value for a given asset class code.
 * Falls back to gray for unknown codes.
 */
export function getAssetClassColor(assetClassCode: string): string {
  return ASSET_CLASS_COLORS[assetClassCode] ?? "var(--ac-default, #6b7280)";
}

/**
 * Return the human-readable label for a given asset class code.
 * Falls back to the code itself for unknown codes.
 */
export function getAssetClassLabel(assetClassCode: string): string {
  return ASSET_CLASS_LABELS[assetClassCode] ?? assetClassCode;
}

/**
 * Return the CSS color value for a given NPC classification ID.
 */
export function getNpcClassificationColor(npcClassificationId: number): string {
  return NPC_CLASSIFICATION_COLORS[npcClassificationId] ?? "var(--npc-default, #6b7280)";
}

/**
 * Return the human-readable label for a given NPC classification ID.
 */
export function getNpcClassificationLabel(npcClassificationId: number): string {
  return NPC_CLASSIFICATION_LABELS[npcClassificationId] ?? `NPC #${npcClassificationId}`;
}

/**
 * Return the CSS class for the active/badge indicator.
 */
export function getActiveBadgeClass(active: boolean): string {
  return active ? "status-badge active" : "status-badge inactive";
}

/**
 * Return the human-readable label for the active indicator.
 */
export function getActiveLabel(active: boolean): string {
  return active ? "Actief" : "Inactief";
}

/**
 * Build an inline style object with the asset class color as a background dot.
 * Useful for rendering a small colored circle next to the asset class name.
 */
export function getAssetClassDotStyle(assetClassCode: string): React.CSSProperties {
  return {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: getAssetClassColor(assetClassCode),
    marginRight: 6,
    flexShrink: 0,
  };
}

/**
 * Map an asset class code to a row-level background tint for the table row.
 * More saturated codes get a subtle background tint to visually group rows.
 */
export function getRowTintStyle(assetClassCode: string): React.CSSProperties {
  const color = getAssetClassColor(assetClassCode);
  return {
    borderLeft: `3px solid ${color}`,
  };
}