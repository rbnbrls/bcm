/**
 * Dashboard data contract (lib/dashboard-categories.tsx).
 *
 * Locks the post-feedback homepage shape: the NIEUWE CHANGE section must show
 * exactly the two Workflow Studio entries with their new descriptions, and the
 * four legacy benchmark/asset-class request entries must never come back.
 *
 * Mirrors the assertions in tests/e2e/homepage.spec.ts at the data layer so a
 * regression is caught by the fast unit suite before any browser run.
 */
import { describe, expect, it } from "vitest";
import { MAIN_CATEGORIES } from "@/lib/dashboard-categories";

const LEGACY_LABELS = [
  "Benchmark catalogus",
  "Nieuwe benchmark aanvragen",
  "Nieuwe asset class aanvragen",
  "Nieuwe sub asset class aanvragen",
] as const;

const LEGACY_HREFS = [
  "/benchmarks",
  "/benchmark-aanvraag",
  "/asset-class-aanvraag",
  "/sub-asset-class-aanvraag",
] as const;

const NEW_CHANGE_CATEGORY_ID = "nieuwe-change";

describe("dashboard MAIN_CATEGORIES", () => {
  const nieuweChange = MAIN_CATEGORIES.find((category) => category.id === NEW_CHANGE_CATEGORY_ID);

  it("NIEUWE CHANGE section exists with the expected id/label", () => {
    expect(nieuweChange).toBeDefined();
    expect(nieuweChange?.label).toBe("NIEUWE CHANGE");
    expect(nieuweChange?.title).toBe("Nieuwe change");
  });

  it("NIEUWE CHANGE renders exactly 'Change aanvragen' and 'Changes beheren' with the new descriptions", () => {
    expect(nieuweChange?.items).toHaveLength(2);
    expect(nieuweChange?.items[0]).toEqual({
      label: "Change aanvragen →",
      href: "/change-catalog",
      description: "Kies een gepubliceerde Workflow Studio changes in de change catalog.",
    });
    expect(nieuweChange?.items[1]).toEqual({
      label: "Changes beheren →",
      href: "/workflow-studio",
      description: "Wijzig of creëer changes via de Workflow Studio.",
    });
  });

  it("new links point to the Workflow Studio change catalog / management screens", () => {
    const hrefs = nieuweChange?.items.map((item) => item.href) ?? [];
    expect(hrefs).toEqual(["/change-catalog", "/workflow-studio"]);
  });

  it("contains none of the legacy benchmark/asset-class labels anywhere in the dashboard", () => {
    const allLabels = MAIN_CATEGORIES.flatMap((category) => category.items.map((item) => item.label)).join(" | ");
    for (const label of LEGACY_LABELS) {
      expect(allLabels).not.toContain(label);
    }
  });

  it("contains no link to any removed legacy route anywhere in the dashboard", () => {
    const allHrefs = MAIN_CATEGORIES.flatMap((category) => category.items.map((item) => item.href));
    for (const href of LEGACY_HREFS) {
      expect(allHrefs).not.toContain(href);
    }
  });

  it("keeps reporting consolidated on the runtime metrics dashboard", () => {
    const beheer = MAIN_CATEGORIES.find((category) => category.id === "beheer");

    expect(MAIN_CATEGORIES.map((category) => category.items.length)).toEqual([2, 4, 3]);
    expect(beheer?.items).toContainEqual({
      label: "Rapportages →",
      href: "/workflow-runtime",
      description: "Runtime metrics, SLA-risico's, dead letters en adapterfouten",
    });
    expect(beheer?.items.some((item) => item.href.startsWith("/reports"))).toBe(false);
  });

  it("every dashboard action has a label, href and description", () => {
    for (const category of MAIN_CATEGORIES) {
      for (const item of category.items) {
        expect(item.label.trim().length).toBeGreaterThan(0);
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.description?.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
