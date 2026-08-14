/**
 * Unit tests for the /change-catalog blocked-workflow warning copy builder
 * (lib/workflow-studio/catalog-warning.ts).
 *
 * Regression for issue #611: the warning previously always used the plural
 * verb ("zijn") and blamed "jouw scope of feature flags" instead of the
 * actual block reason ("De gebruiker mist de vereiste Workflow Studio-
 * permissie."). These tests pin the corrected, dynamically pluralized copy
 * and the surfaced per-workflow reasons.
 */
import { describe, expect, it } from "vitest";

import { buildBlockedWorkflowWarning } from "@/lib/workflow-studio/catalog-warning";
import type { PublishedWorkflowCatalogItem } from "@/lib/workflow-studio/catalog";

const PERMISSION_REASON = "De gebruiker mist de vereiste Workflow Studio-permissie.";

function blockedItem(
  slug: string,
  name: string,
  versionNumber: number,
  reason: string,
): PublishedWorkflowCatalogItem {
  return {
    definition: {
      id: `def-${slug}`,
      tenant: "uat",
      businessUnit: "uat",
      clientIds: null,
      slug,
      name,
      description: "",
      ownerUserId: "user-1",
      status: "published",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    version: {
      id: `ver-${slug}-v${versionNumber}`,
      workflowDefinitionId: `def-${slug}`,
      versionNumber,
      schemaVersion: 1,
      status: "published",
      contentHash: "sha256:abc",
      revision: "1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      publishedByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    startHref: null,
    startable: false,
    blockedReason: reason,
  };
}

function startableItem(slug: string, name: string, versionNumber: number): PublishedWorkflowCatalogItem {
  return {
    ...blockedItem(slug, name, versionNumber, PERMISSION_REASON),
    startable: true,
    startHref: `/workflow-runtime/ver-${slug}-v${versionNumber}/start`,
    blockedReason: undefined,
  };
}

describe("buildBlockedWorkflowWarning (#611)", () => {
  it("returns null when every workflow is startable", () => {
    const warning = buildBlockedWorkflowWarning([startableItem("benchmark-wijziging", "Benchmark wijziging", 1)]);
    expect(warning).toBeNull();
  });

  it("builds the singular copy with the actual permission reason", () => {
    const warning = buildBlockedWorkflowWarning([
      blockedItem("benchmark-wijziging", "Benchmark wijziging", 1, PERMISSION_REASON),
    ]);

    expect(warning?.summary).toBe(
      "1 gepubliceerde workflow is nog niet startbaar omdat je de vereiste Workflow Studio-permissie mist.",
    );
    expect(warning?.blockedWorkflows).toEqual([
      {
        name: "Benchmark wijziging",
        slug: "benchmark-wijziging",
        versionNumber: 1,
        reason: PERMISSION_REASON,
      },
    ]);
  });

  it("pluralizes noun and verb for multiple blocked workflows sharing one reason", () => {
    const warning = buildBlockedWorkflowWarning([
      blockedItem("benchmark-wijziging", "Benchmark wijziging", 1, PERMISSION_REASON),
      blockedItem("client-onboarding", "Client onboarding", 2, PERMISSION_REASON),
    ]);

    expect(warning?.summary).toBe(
      "2 gepubliceerde workflows zijn nog niet startbaar omdat je de vereiste Workflow Studio-permissie mist.",
    );
    expect(warning?.blockedWorkflows).toHaveLength(2);
  });

  it("falls back to a generic summary when blocked workflows have different reasons", () => {
    const warning = buildBlockedWorkflowWarning([
      blockedItem("benchmark-wijziging", "Benchmark wijziging", 1, PERMISSION_REASON),
      blockedItem("client-onboarding", "Client onboarding", 2, "De workflow ligt buiten jouw scope."),
    ]);

    expect(warning?.summary).toBe("2 gepubliceerde workflows zijn nog niet startbaar.");
    expect(warning?.blockedWorkflows.map((item) => item.reason)).toEqual([
      PERMISSION_REASON,
      "De workflow ligt buiten jouw scope.",
    ]);
  });

  it("keeps an unknown single reason out of the summary but surfaces it per workflow", () => {
    const warning = buildBlockedWorkflowWarning([
      blockedItem("exotic", "Exotische workflow", 1, "Iets onverwachts blokkeert starten."),
    ]);

    expect(warning?.summary).toBe("1 gepubliceerde workflow is nog niet startbaar.");
    expect(warning?.blockedWorkflows[0].reason).toBe("Iets onverwachts blokkeert starten.");
  });
});
