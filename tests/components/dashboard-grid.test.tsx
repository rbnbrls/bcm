// @vitest-environment jsdom
/**
 * DashboardGrid NIEUWE CHANGE rendering (components/dashboard/dashboard-grid.tsx).
 *
 * Regression coverage for the feedback fix: the /workflow-studio dashboard
 * action is gated by the server-owned workflow_studio.builder feature flag.
 * process.env flags are never inlined into client bundles, so the server must
 * pass its snapshot down via `initialFlags` — without it the client-side
 * canNavigateTo() silently filters the "Changes beheren" action out of the
 * homepage (the original bug), and with builder=false it must stay hidden.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import type { FeatureFlagSnapshot } from "@/lib/feature-flags";

const WORKFLOW_STUDIO_ON: FeatureFlagSnapshot = Object.freeze({
  "workflow_studio.builder": true,
  "workflow_studio.publish": true,
  "workflow_runtime.start": false,
  "workflow_runtime.shadow_compare": false,
});

function actionLinks(container: HTMLElement): { label: string; href: string }[] {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>(".category-action-link")).map((link) => ({
    label: link.querySelector(".category-action-link-label")?.textContent ?? "",
    href: link.getAttribute("href") ?? "",
  }));
}

describe("DashboardGrid NIEUWE CHANGE section", () => {
  it("renders both 'Change aanvragen' and 'Changes beheren' when the server passes the builder+publish snapshot", () => {
    const { container } = render(<DashboardGrid initialFlags={WORKFLOW_STUDIO_ON} />);

    const links = actionLinks(container);
    expect(links).toContainEqual({ label: "Change aanvragen →", href: "/change-catalog" });
    expect(links).toContainEqual({ label: "Changes beheren →", href: "/workflow-studio" });
    // The two Workflow Studio entries are the only NIEUWE CHANGE actions:
    // no legacy benchmark/asset-class request links may render.
    expect(links.some((link) => link.href === "/benchmarks" || link.href === "/benchmark-aanvraag")).toBe(false);
    expect(links.some((link) => link.href === "/asset-class-aanvraag" || link.href === "/sub-asset-class-aanvraag")).toBe(false);
  });

  it("filters 'Changes beheren' out when the builder flag is off (flag gate still works)", () => {
    const flags: FeatureFlagSnapshot = { ...WORKFLOW_STUDIO_ON, "workflow_studio.builder": false };
    const { container } = render(<DashboardGrid initialFlags={flags} />);

    const links = actionLinks(container);
    expect(links).toContainEqual({ label: "Change aanvragen →", href: "/change-catalog" });
    expect(links.some((link) => link.href === "/workflow-studio")).toBe(false);
  });

  it("renders 'Changes beheren' even when the publish flag is off but the builder flag is on", () => {
    const flags: FeatureFlagSnapshot = { ...WORKFLOW_STUDIO_ON, "workflow_studio.publish": false };
    const { container } = render(<DashboardGrid initialFlags={flags} />);

    const links = actionLinks(container);
    expect(links).toContainEqual({ label: "Changes beheren →", href: "/workflow-studio" });
  });
});
