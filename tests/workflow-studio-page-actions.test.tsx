// @vitest-environment jsdom
/**
 * Page-level acceptance tests for the workflow-studio action menu
 * (app/workflow-studio/page.tsx): a change manager must see an "Aanpassen"
 * action for published workflows, while identities without workflow:design
 * keep seeing only the existing clone/retire actions.
 *
 * The backend boundary is mocked: getIdentityContext simulates the current
 * user's roles (RBAC resolves permissions from the bcm:role:* groups, real
 * code), and loadWorkflowOverview simulates the backend response for the
 * workflow list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/lib/identity/request", () => ({ getIdentityContext: vi.fn() }));
vi.mock("@/lib/db", () => ({ sql: {} }));
vi.mock("@/lib/workflow-studio/overview", () => ({ loadWorkflowOverview: vi.fn() }));
vi.mock("@/app/workflow-studio/actions", () => ({
  deprecateWorkflowAction: vi.fn(),
  createDraftFromPublishedAction: vi.fn(),
}));

import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowDefinitionRow, WorkflowVersionRow } from "@/lib/workflow-studio/definition-repository";
import type { WorkflowOverviewItem } from "@/lib/workflow-studio/overview";
import { getIdentityContext } from "@/lib/identity/request";
import { loadWorkflowOverview } from "@/lib/workflow-studio/overview";
import WorkflowStudioPage from "@/app/workflow-studio/page";

const identityMock = vi.mocked(getIdentityContext);
const overviewMock = vi.mocked(loadWorkflowOverview);

function changeManagerIdentity(): IdentityContext {
  return {
    userId: "u-cm",
    displayName: "Chris Change",
    groups: ["bcm:role:change_manager"],
    tenant: "tenant-a",
    businessUnit: "bu-a",
    sessionId: "s-cm",
  };
}

function accountManagerIdentity(): IdentityContext {
  return {
    userId: "u-am",
    displayName: "Arjan Accountmanager",
    groups: ["bcm:role:account_manager"],
    tenant: "tenant-a",
    businessUnit: "bu-a",
    sessionId: "s-am",
  };
}

const baseDefinition: WorkflowDefinitionRow = {
  id: "def-benchmark",
  tenant: "tenant-a",
  businessUnit: "bu-a",
  clientIds: null,
  slug: "benchmark-wijziging",
  name: "Benchmark wijziging",
  description: "Wijziging van de benchmark voor een client.",
  ownerUserId: "u-cm",
  status: "published",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const publishedVersion: WorkflowVersionRow = {
  id: "v-1",
  workflowDefinitionId: "def-benchmark",
  versionNumber: 1,
  schemaVersion: 1,
  status: "published",
  contentHash: "sha256:abc",
  revision: "1",
  publishedAt: "2026-01-02T00:00:00.000Z",
  publishedByUserId: "u-cm",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function overviewItem(overrides: Partial<WorkflowOverviewItem> = {}): WorkflowOverviewItem {
  return {
    definition: { ...baseDefinition },
    draft: null,
    published: { ...publishedVersion },
    ...overrides,
  };
}

async function renderPage() {
  const element = await WorkflowStudioPage({ searchParams: Promise.resolve({}) });
  return render(element);
}

describe("workflow-studio action menu for published workflows", () => {
  beforeEach(() => {
    identityMock.mockReset();
    overviewMock.mockReset();
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  it("shows Aanpassen for a published workflow to a change manager (workflow:design)", async () => {
    identityMock.mockResolvedValue(changeManagerIdentity());
    overviewMock.mockResolvedValue({
      ok: true,
      code: "ok",
      value: Object.freeze([overviewItem()]),
    });

    await renderPage();

    const card = screen.getByRole("heading", { name: "Benchmark wijziging" }).closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole("button", { name: "Aanpassen" })).toBeTruthy();
    // No draft yet, so Hervatten must not appear; clone/retire stay available.
    expect(within(card as HTMLElement).queryByRole("link", { name: "Hervatten" })).toBeNull();
    expect(within(card as HTMLElement).getByRole("link", { name: "Klonen" })).toBeTruthy();
    expect(within(card as HTMLElement).getByText("Uitfaseren")).toBeTruthy();
  });

  it("does not show Aanpassen without workflow:design permission", async () => {
    identityMock.mockResolvedValue(accountManagerIdentity());
    overviewMock.mockResolvedValue({
      ok: true,
      code: "ok",
      value: Object.freeze([overviewItem()]),
    });

    await renderPage();

    const card = screen.getByRole("heading", { name: "Benchmark wijziging" }).closest("article");
    expect(within(card as HTMLElement).queryByRole("button", { name: "Aanpassen" })).toBeNull();
    // Non-authorized roles see no design/deprecate actions at all.
    expect(within(card as HTMLElement).queryByRole("link", { name: "Klonen" })).toBeNull();
    expect(within(card as HTMLElement).queryByText("Uitfaseren")).toBeNull();
  });

  it("prefers Hervatten once a draft exists (post-branch state) and hides Aanpassen", async () => {
    identityMock.mockResolvedValue(changeManagerIdentity());
    const draftVersion: WorkflowVersionRow = {
      ...publishedVersion,
      id: "v-2",
      versionNumber: 2,
      status: "draft",
      contentHash: null,
      publishedAt: null,
      publishedByUserId: null,
    };
    overviewMock.mockResolvedValue({
      ok: true,
      code: "ok",
      value: Object.freeze([
        overviewItem({
          definition: { ...baseDefinition, status: "draft" },
          draft: draftVersion,
        }),
      ]),
    });

    await renderPage();

    const card = screen.getByRole("heading", { name: "Benchmark wijziging" }).closest("article");
    expect(within(card as HTMLElement).getByRole("link", { name: "Hervatten" })).toBeTruthy();
    expect(within(card as HTMLElement).queryByRole("button", { name: "Aanpassen" })).toBeNull();
  });
});
