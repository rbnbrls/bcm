/**
 * Change type catalog utilities.
 *
 * Pure functions for building the change type catalog view,
 * including mermaid flowchart generation.
 */
import type { ChangeTypeConfig, FlowStep } from "@/lib/types";
import { resolveWorkflowTemplate, type ChangeTypeFormKind } from "@/lib/change-types/templates";

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
 *
 * Missing amounts (null/undefined, e.g. change-type configs whose `cost`
 * jsonb is an empty object from the 3NF migration) render as an em-dash
 * placeholder instead of throwing on `amount.toLocaleString(...)`.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency?: string | null
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const safeCurrency = currency ?? "EUR";
  const locale = safeCurrency === "EUR" ? "nl-NL" : "en-US";
  const symbol = safeCurrency === "EUR" ? "€" : "$";
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
    client: "Klant",
  };
  return labels[category] ?? category;
}

/**
 * Filter only active change types.
 */
export function getActiveChangeTypes(types: ChangeTypeConfig[]): ChangeTypeConfig[] {
  return types.filter((t) => t.active);
}

/**
 * The dedicated form/view rendered for a change type on the new-change page.
 *
 * `generic` renders the config-driven {@link GenericChangeForm}, which shows
 * the fields, costs, lead time and stakeholders defined in the change type
 * config. The dedicated kinds render purpose-built components:
 *
 * | Kind                  | Component            | Change type slugs                          |
 * |-----------------------|----------------------|--------------------------------------------|
 * | `portfolio-create`    | PortfolioAdditionForm | `portfolio_addition` (backward compat), `portfolio_configuration_create` |
 * | `client-onboarding`   | ClientOnboardingWizard | `client_onboarding`                       |
 * | `asset-class-request` | AssetClassRequestForm | `new_asset_class`                         |
 * | `sub-asset-class-request` | SubAssetClassRequestForm | `new_sub_asset_class`                 |
 * | `generic`             | GenericChangeForm    | everything else, incl. `portfolio_configuration_update` / `portfolio_configuration_retire` |
 *
 * `portfolio_configuration_update` and `portfolio_configuration_retire` are
 * intentionally routed to the generic form: their field sets, costs, lead
 * times and process flows are defined in the change catalog config, so the
 * generic form renders the correct update/retire form without a dedicated
 * component. `portfolio_addition` remains mapped to the create wizard for
 * backward compatibility with existing requests.
 */
export function resolveChangeTypeFormKind(slug: string | undefined): ChangeTypeFormKind {
  return resolveWorkflowTemplate(slug).formKind;
}

/**
 * Generate a Mermaid flowchart definition from process flow steps.
 *
 * Produces a left-to-right flowchart with each stakeholder as a subgraph.
 * Steps are grouped by stakeholder, ordered by stepOrder, and connected
 * sequentially. Each node shows the action and lead time.
 */
export function generateFlowMermaid(flow: FlowStep[], changeTypeName: string): string {
  const lines: string[] = [];
  lines.push("flowchart LR");

  // Group steps by stakeholder (preserving order within each group)
  const stakeholderOrder: string[] = [];
  const stakeholderGroups = new Map<string, FlowStep[]>();
  for (const step of flow) {
    if (!stakeholderGroups.has(step.stakeholder)) {
      stakeholderGroups.set(step.stakeholder, []);
      stakeholderOrder.push(step.stakeholder);
    }
    stakeholderGroups.get(step.stakeholder)!.push(step);
  }

  // Color palette for stakeholder subgraphs
  const colors = [
    { fill: "#dff4e9", stroke: "#0a513f", text: "#0a513f" },
    { fill: "#e3eaf5", stroke: "#28497c", text: "#28497c" },
    { fill: "#fff3d6", stroke: "#c8950c", text: "#c8950c" },
    { fill: "#f3e8ff", stroke: "#6d28d9", text: "#6d28d9" },
    { fill: "#fce7f3", stroke: "#be185d", text: "#be185d" },
  ];

  // Declare classDef styles
  stakeholderOrder.forEach((_, idx) => {
    const c = colors[idx % colors.length];
    lines.push(`  classDef stkh-${idx} fill:${c.fill},stroke:${c.stroke},stroke-width:1px,color:${c.text}`);
  });

  // Build subgraphs and collect step IDs in order
  const allStepIds: string[] = [];

  stakeholderOrder.forEach((stakeholder, idx) => {
    const steps = stakeholderGroups.get(stakeholder)!;
    const safeLabel = escapeMermaid(stakeholder);

    lines.push(`  subgraph sg${idx}["${safeLabel}"]`);
    lines.push("    direction LR");

    for (const step of steps) {
      const stepId = `S${step.stepOrder}`;
      // Collect once per unique stepOrder (avoid dupes if somehow present)
      if (!allStepIds.includes(stepId)) {
        allStepIds.push(stepId);
      }
      const leadHtml = step.leadTime !== "—" && step.leadTime
        ? `<br/><span style="font-size:11px">⏱ ${escapeMermaid(step.leadTime)}</span>`
        : "";
      lines.push(`    ${stepId}["<strong>${step.stepOrder}. ${escapeMermaid(step.action)}</strong>${leadHtml}"]:::stkh-${idx}`);
    }

    lines.push("  end");
  });

  // Sequential arrows — sorted by stepOrder, not by stakeholder grouping
  const sortedForArrows = [...flow].sort((a, b) => a.stepOrder - b.stepOrder);
  for (let i = 0; i < sortedForArrows.length - 1; i++) {
    lines.push(`  S${sortedForArrows[i].stepOrder} --> S${sortedForArrows[i + 1].stepOrder}`);
  }

  return lines.join("\n");
}

/**
 * Generate a Mermaid flowchart definition showing only stakeholder-performed steps.
 *
 * Filters out any steps that are system validations (steps without a valid
 * stakeholder or stakeholderId) and renders only the steps performed by named
 * stakeholder actors. Steps are grouped by stakeholder as subgraphs.
 *
 * This is the primary diagram for the change detail page — it shows the
 * human workflow without internal system validations.
 *
 * @returns A string valid as a Mermaid flowchart (without wrapping ```mermaid block).
 */
export function generateStakeholderFlowMermaid(
  flow: FlowStep[],
  changeTypeName: string
): string {
  // Filter to only steps performed by stakeholder actors
  const stakeholderSteps = flow.filter(
    (step) =>
      step.stakeholder &&
      step.stakeholder.trim().length > 0 &&
      step.stakeholderId &&
      step.stakeholderId.trim().length > 0
  );

  // If nothing remains after filtering, fall back gracefully
  if (stakeholderSteps.length === 0) {
    return "flowchart LR\n  A[\"Geen processtappen beschikbaar\"]";
  }

  const lines: string[] = [];
  lines.push("flowchart LR");

  // Group steps by stakeholder (preserving order within each group)
  const stakeholderOrder: string[] = [];
  const stakeholderGroups = new Map<string, FlowStep[]>();
  for (const step of stakeholderSteps) {
    if (!stakeholderGroups.has(step.stakeholder)) {
      stakeholderGroups.set(step.stakeholder, []);
      stakeholderOrder.push(step.stakeholder);
    }
    stakeholderGroups.get(step.stakeholder)!.push(step);
  }

  // Color palette for stakeholder subgraphs
  const colors = [
    { fill: "#dff4e9", stroke: "#0a513f", text: "#0a513f" },
    { fill: "#e3eaf5", stroke: "#28497c", text: "#28497c" },
    { fill: "#fff3d6", stroke: "#c8950c", text: "#c8950c" },
    { fill: "#f3e8ff", stroke: "#6d28d9", text: "#6d28d9" },
    { fill: "#fce7f3", stroke: "#be185d", text: "#be185d" },
  ];

  // Declare classDef styles
  stakeholderOrder.forEach((_, idx) => {
    const c = colors[idx % colors.length];
    lines.push(`  classDef stkh-${idx} fill:${c.fill},stroke:${c.stroke},stroke-width:1px,color:${c.text}`);
  });

  // Build subgraphs and collect step IDs in order
  const allStepIds: string[] = [];

  stakeholderOrder.forEach((stakeholder, idx) => {
    const steps = stakeholderGroups.get(stakeholder)!;
    const safeLabel = escapeMermaid(stakeholder);

    lines.push(`  subgraph sg${idx}["${safeLabel}"]`);
    lines.push("    direction LR");

    for (const step of steps) {
      const stepId = `S${step.stepOrder}`;
      if (!allStepIds.includes(stepId)) {
        allStepIds.push(stepId);
      }
      const leadHtml =
        step.leadTime !== "—" && step.leadTime
          ? `<br/><span style="font-size:11px">⏱ ${escapeMermaid(step.leadTime)}</span>`
          : "";
      lines.push(
        `    ${stepId}["<strong>${step.stepOrder}. ${escapeMermaid(step.action)}</strong>${leadHtml}"]:::stkh-${idx}`
      );
    }

    lines.push("  end");
  });

  // Sequential arrows — sorted by stepOrder, not by stakeholder grouping
  const sortedForArrows = [...stakeholderSteps].sort(
    (a, b) => a.stepOrder - b.stepOrder
  );
  for (let i = 0; i < sortedForArrows.length - 1; i++) {
    lines.push(
      `  S${sortedForArrows[i].stepOrder} --> S${sortedForArrows[i + 1].stepOrder}`
    );
  }

  return lines.join("\n");
}
