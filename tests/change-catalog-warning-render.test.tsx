// @vitest-environment jsdom
/**
 * Page-level render regression tests for the /change-catalog blocked-workflow
 * warning (issue #611, task t_667ddb65).
 *
 * The reported scenario: a published workflow is blocked because the user
 * lacks the Workflow Studio permission, with workflowRuntimeStartEnabled=true
 * and identityGroups=["bcm:role:admin"]. The page must render the corrected
 * warning copy (singular "is", plural "zijn") and surface the actual block
 * reason per workflow in the expandable list, and must not render a warning
 * (nor report a user-visible issue) when every workflow is startable.
 *
 * The backend boundary is mocked exactly like workflow-studio-page-actions:
 * getIdentityContext simulates the signed-in identity (RBAC stays real), and
 * loadPublishedWorkflowCatalog simulates the catalog decision (startable vs
 * blocked + blockedReason). buildBlockedWorkflowWarning and the warning box
 * markup are the real code under test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/identity/request", () => ({ getIdentityContext: vi.fn() }));
vi.mock("@/lib/db", () => ({ sql: {} }));
vi.mock("@/lib/user-visible-issue", () => ({ reportUserVisibleIssue: vi.fn() }));
vi.mock("@/lib/workflow-studio/catalog", () => ({
  loadPublishedWorkflowCatalog: vi.fn(),
}));

import type { IdentityContext } from "@/lib/identity/types";
import type { PublishedWorkflowCatalogItem } from "@/lib/workflow-studio/catalog";
import { getIdentityContext } from "@/lib/identity/request";
import { loadPublishedWorkflowCatalog } from "@/lib/workflow-studio/catalog";
import { reportUserVisibleIssue } from "@/lib/user-visible-issue";
import ChangeCatalogPage from "@/app/change-catalog/page";

const identityMock = vi.mocked(getIdentityContext);
const catalogMock = vi.mocked(loadPublishedWorkflowCatalog);
const reportMock = vi.mocked(reportUserVisibleIssue);

/** The UAT reporter identity from issue #611. */
function adminIdentity(): IdentityContext {
  return {
    userId: "u-admin",
    displayName: "Bert Beheerder",
    groups: ["bcm:role:admin"],
    tenant: "uat",
    businessUnit: "uat",
    sessionId: "s-admin",
  };
}

const PERMISSION_REASON = "De gebruiker mist de vereiste Workflow Studio-permissie.";

function catalogItem(
  slug: string,
  name: string,
  versionNumber: number,
  options: { startable?: boolean; blockedReason?: string } = {},
): PublishedWorkflowCatalogItem {
  return {
    definition: {
      id: `def-${slug}`,
      tenant: "uat",
      businessUnit: "uat",
      clientIds: null,
      slug,
      name,
      description: `${name} beschrijving.`,
      catalogDescription: `Start de ${name}-workflow.`,
      category: "change",
      costModel: { baseCost: 0, currency: "EUR", description: "" },
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
      contentHash: `sha256:${slug}`,
      revision: String(versionNumber),
      publishedAt: "2026-01-01T00:00:00.000Z",
      publishedByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    startHref: options.startable ? `/workflow-runtime/ver-${slug}-v${versionNumber}/start` : null,
    startable: options.startable ?? false,
    ...(options.blockedReason !== undefined ? { blockedReason: options.blockedReason } : {}),
  };
}

async function renderPage() {
  const element = await ChangeCatalogPage();
  return render(element);
}

/** Asserts one entry of the expandable blocked-workflow list, whose text is split across <b> and a text node. */
function expectBlockedListItem(name: string, versionNumber: number, reason: string) {
  const item = screen.getByText((_content, element) =>
    element?.tagName === "LI" && (element.textContent?.includes(`${name} (v${versionNumber}): ${reason}`) ?? false),
  );
  expect(item).toBeTruthy();
}

describe("/change-catalog blocked-workflow warning render (#611)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("BCM_FEATURE_WORKFLOW_RUNTIME_START", "true");
    identityMock.mockReset();
    catalogMock.mockReset();
    reportMock.mockReset();
    reportMock.mockResolvedValue(undefined);
    identityMock.mockResolvedValue(adminIdentity());
  });

  it("renders the singular warning with the actual permission reason for a blocked admin workflow", async () => {
    catalogMock.mockResolvedValue([
      catalogItem("benchmark-wijziging", "Benchmark wijziging", 1, { blockedReason: PERMISSION_REASON }),
    ]);

    await renderPage();

    // The corrected singular copy embeds the real block reason.
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 gepubliceerde workflow is nog niet startbaar omdat je de vereiste Workflow Studio-permissie mist.",
    );
    // The per-workflow reason is visible in the expandable list.
    expectBlockedListItem("Benchmark wijziging", 1, PERMISSION_REASON);
    // The catalog card marks the workflow as not startable.
    expect(screen.getByText("Niet startbaar")).toBeTruthy();
    // The reported context matches the issue: blockedCount=1, totalWorkflows=1, admin identity, flag on.
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({
      route: "/change-catalog",
      severity: "warning",
      fingerprint: "change-catalog:published-workflows-not-startable",
      details: expect.objectContaining({
        blockedCount: 1,
        totalWorkflows: 1,
        workflowRuntimeStartEnabled: "true",
        identityGroups: ["bcm:role:admin"],
        identityTenant: "uat",
        identityBusinessUnit: "uat",
        blockedWorkflows: ["benchmark-wijziging@v1: De gebruiker mist de vereiste Workflow Studio-permissie."],
      }),
    }));
  });

  it("pluralizes noun and verb and lists every blocked workflow when several are blocked", async () => {
    catalogMock.mockResolvedValue([
      catalogItem("benchmark-wijziging", "Benchmark wijziging", 1, { blockedReason: PERMISSION_REASON }),
      catalogItem("client-onboarding", "Client onboarding", 2, { blockedReason: PERMISSION_REASON }),
    ]);

    await renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "2 gepubliceerde workflows zijn nog niet startbaar omdat je de vereiste Workflow Studio-permissie mist.",
    );
    expect(screen.getByText("Geblokkeerde workflows")).toBeTruthy();
    expectBlockedListItem("Benchmark wijziging", 1, PERMISSION_REASON);
    expectBlockedListItem("Client onboarding", 2, PERMISSION_REASON);
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ blockedCount: 2, totalWorkflows: 2 }),
    }));
  });

  it("renders no warning and reports nothing when every workflow is startable", async () => {
    catalogMock.mockResolvedValue([
      catalogItem("benchmark-wijziging", "Benchmark wijziging", 1, { startable: true }),
    ]);

    await renderPage();

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/nog niet startbaar/)).toBeNull();
    expect(reportMock).not.toHaveBeenCalled();
    // The workflow is startable from the catalog card.
    expect(screen.getByRole("link", { name: "Aanvragen" })).toBeTruthy();
  });
});
