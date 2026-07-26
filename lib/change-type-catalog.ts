/**
 * Change type catalog utilities.
 *
 * Pure functions for building the change type catalog view,
 * including mermaid flowchart generation.
 */
import type { ChangeTypeConfig } from "@/lib/types";

/**
 * Generate a Mermaid flowchart definition string for a change type.
 *
 * Produces a horizontal (LR) flowchart showing the standard workflow
 * stages with stakeholder notification points injected at the
 * appropriate stage (on_submit, on_approval, on_completion).
 *
 * @returns A string valid as a Mermaid flowchart definition (without the wrapping ```mermaid block).
 */
export function generateMermaidFlowchart(config: ChangeTypeConfig): string {
  const lines: string[] = [];
  lines.push("flowchart LR");

  // ── Style definitions ──
  lines.push("  classDef stage fill:#dff4e9,stroke:#0a513f,stroke-width:1px,color:#0a513f");
  lines.push("  classDef notify fill:#fff3d6,stroke:#c8950c,stroke-width:1px,color:#c8950c,stroke-dasharray:4 3");
  lines.push("  classDef start fill:#e3eaf5,stroke:#28497c,stroke-width:1px,color:#28497c");

  // ── Node definitions ──
  lines.push(`  subgraph ${escapeMermaid(changeTypeName(config))}`);
  lines.push("    A([Start]):::start");
  lines.push("    B[1. Aanvraag]:::stage");
  lines.push("    C[2. Goedkeuring]:::stage");
  lines.push("    D[3. Uitvoering]:::stage");
  lines.push("    E[4. Gereed]:::stage");

  // Main flow arrows
  lines.push("    A --> B");
  lines.push("    B --> C");
  lines.push("    C --> D");
  lines.push("    D --> E");
  lines.push("  end");

  // ── Stakeholder notification bubbles ──
  // Group stakeholders by their notification trigger point
  const submitNotifications = config.stakeholders.filter((s) =>
    s.notifyOn.includes("on_submit")
  );
  const approvalNotifications = config.stakeholders.filter((s) =>
    s.notifyOn.includes("on_approval")
  );
  const completionNotifications = config.stakeholders.filter((s) =>
    s.notifyOn.includes("on_completion")
  );

  if (submitNotifications.length > 0) {
    const labels = submitNotifications.map((s) => s.name).join(" + ");
    lines.push(`  N1["📋 ${escapeMermaid(labels)}"]:::notify`);
    lines.push("  B -.-> N1");
  }

  if (approvalNotifications.length > 0) {
    const labels = approvalNotifications.map((s) => s.name).join(" + ");
    lines.push(`  N2["✅ ${escapeMermaid(labels)}"]:::notify`);
    lines.push("  C -.-> N2");
  }

  if (completionNotifications.length > 0) {
    const labels = completionNotifications.map((s) => s.name).join(" + ");
    lines.push(`  N3["🏁 ${escapeMermaid(labels)}"]:::notify`);
    lines.push("  E -.-> N3");
  }

  return lines.join("\n");
}

/**
 * Escape special characters in text for use as Mermaid node labels.
 */
function escapeMermaid(text: string): string {
  // Mermaid quotes/braces can break the diagram; wrap in quotes if needed
  return text.replace(/"/g, "'");
}

/**
 * Derive a short title for the change type for use in the mermaid diagram header.
 */
function changeTypeName(config: ChangeTypeConfig): string {
  // Keep it short — strip trailing whitespace/punctuation
  const name = config.name;
  if (name.length <= 22) return name;
  return name.slice(0, 20) + "...";
}

/**
 * Sort change types by sortOrder ascending.
 */
export function sortChangeTypes(types: ChangeTypeConfig[]): ChangeTypeConfig[] {
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Format a currency amount for display.
 */
export function formatCurrency(amount: number, currency: string): string {
  const locale = currency === "EUR" ? "nl-NL" : "en-US";
  const symbol = currency === "EUR" ? "€" : "$";
  return `${symbol} ${amount.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Format lead days for display (Dutch).
 */
export function formatLeadDays(days: number): string {
  return days === 1 ? `${days} dag` : `${days} dagen`;
}

/**
 * Format a category slug into a human-readable Dutch label.
 */
export function formatCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    benchmark: "Benchmark",
    fee: "Tarief",
    mandate: "Mandaat",
    custodian: "Custodian",
    rebalance: "Herweging",
  };
  return labels[category] ?? category;
}

/**
 * Filter only active change types.
 */
export function getActiveChangeTypes(types: ChangeTypeConfig[]): ChangeTypeConfig[] {
  return types.filter((t) => t.active);
}
