/**
 * Regression test for issue #593: "1 gepubliceerde workflow zijn nog niet
 * startbaar voor jouw scope of feature flags." on /change-catalog.
 *
 * Root cause (UAT, 2026-08-13) was configuration: BCM_FEATURE_WORKFLOW_RUNTIME_START
 * was explicitly false in the Coolify app env, so loadPublishedWorkflowCatalog
 * short-circuited into the fail-closed branch and reported every published
 * workflow as blocked with "Workflow runtime start is niet ingeschakeld."
 * (blockedCount=1, totalWorkflows=1, workflowRuntimeStartEnabled=false).
 *
 * These tests pin the catalog decision logic: a published workflow must be
 * reported startable (no blockedReason, no blockedWorkflows entry) as soon as
 * the runtime-start flag AND the per-workflow cutover flag are enabled — a
 * scope/feature-flag misconfiguration must never mark an enabled workflow as
 * non-startable. The scope/permission side of prepare() is covered by
 * workflow-runtime-start-service.test.ts; here the two data boundaries
 * (overview + start service) are mocked so the flag/cutover decision in
 * lib/workflow-studio/catalog.ts runs against the real feature-flags and
 * runtime-cutover code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityContext } from "@/lib/identity/types";
import {
  workflowRuntimeWorkflowFlagName,
} from "@/lib/feature-flags";
import type { WorkflowOverviewItem } from "@/lib/workflow-studio/overview";
import type {
  WorkflowDefinitionRow,
  WorkflowVersionRow,
} from "@/lib/workflow-studio/definition-repository";
import type {
  WorkflowRuntimeStartModel,
  WorkflowRuntimeStartServiceResult,
} from "@/lib/workflow-studio/runtime-start-service";

const { prepareMock } = vi.hoisted(() => ({ prepareMock: vi.fn() }));

vi.mock("@/lib/workflow-studio/overview", () => ({ loadWorkflowOverview: vi.fn() }));
vi.mock("@/lib/workflow-studio/runtime-start-service", () => ({
  WorkflowRuntimeStartService: class {
    // The catalog constructs its own service instance; a shared field keeps
    // the assertion handle identical to what catalog.ts calls.
    prepare = prepareMock;
  },
}));

import { loadPublishedWorkflowCatalog } from "@/lib/workflow-studio/catalog";
import { loadWorkflowOverview } from "@/lib/workflow-studio/overview";

const overviewMock = vi.mocked(loadWorkflowOverview);

/** The UAT report context: change_manager scope, uat/uat tenant, one published workflow. */
const uatChangeManager: IdentityContext = {
  userId: "user-1",
  displayName: "Change Manager",
  groups: ["bcm:role:change_manager"],
  tenant: "uat",
  businessUnit: "uat",
  sessionId: "session-1",
};

const baseDefinition: WorkflowDefinitionRow = {
  id: "65577f72-b817-42a6-8275-b2f1327d02fa",
  tenant: "uat",
  businessUnit: "uat",
  clientIds: null,
  slug: "benchmark-wijziging",
  name: "Benchmark wijziging",
  description: "Wijziging van de benchmark voor een client.",
  ownerUserId: "user-1",
  status: "published",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const publishedVersion: WorkflowVersionRow = {
  id: "badee528-0a68-4c27-bd90-f34042c9c897",
  workflowDefinitionId: baseDefinition.id,
  versionNumber: 1,
  schemaVersion: 1,
  status: "published",
  contentHash: "sha256:abc",
  revision: "1",
  publishedAt: "2026-01-02T00:00:00.000Z",
  publishedByUserId: "user-1",
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

function startModel(): WorkflowRuntimeStartModel {
  return {
    definitionId: baseDefinition.id,
    workflowVersionId: publishedVersion.id,
    versionNumber: 1,
    contentHash: "sha256:abc",
    slug: baseDefinition.slug,
    name: baseDefinition.name,
    description: baseDefinition.description,
    catalogDescription: "Start deze gepubliceerde workflow.",
    category: "other",
    costModel: { baseCost: 0, currency: "EUR", description: "" },
    scope: { tenant: "uat", businessUnit: "uat" },
    forms: [],
  };
}

const FLAG_RUNTIME_START = "BCM_FEATURE_WORKFLOW_RUNTIME_START";
const FLAG_CUTOVER = workflowRuntimeWorkflowFlagName(baseDefinition.id);

describe("workflow catalog runtime-start regression (#593)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    overviewMock.mockReset();
    prepareMock.mockReset();
    overviewMock.mockResolvedValue({
      ok: true,
      code: "ok",
      value: Object.freeze([overviewItem()]),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports a published workflow as startable when runtime start is enabled", async () => {
    vi.stubEnv(FLAG_RUNTIME_START, "true");
    vi.stubEnv(FLAG_CUTOVER, "true");
    prepareMock.mockResolvedValue({ ok: true, value: startModel() });

    const items = await loadPublishedWorkflowCatalog({} as never, uatChangeManager);

    expect(items).toHaveLength(1);
    expect(items[0].startable).toBe(true);
    expect(items[0].startHref).toBe(`/workflow-runtime/${publishedVersion.id}/start`);
    expect(items[0].blockedReason).toBeUndefined();
    // The start service must have been consulted for the enabled workflow.
    expect(prepareMock).toHaveBeenCalledWith(uatChangeManager, publishedVersion.id);
  });

  it("fails closed with the runtime-start warning only when the flag is explicitly disabled", async () => {
    vi.stubEnv(FLAG_RUNTIME_START, "false");
    vi.stubEnv(FLAG_CUTOVER, "true");

    const items = await loadPublishedWorkflowCatalog({} as never, uatChangeManager);

    expect(items).toHaveLength(1);
    expect(items[0].startable).toBe(false);
    expect(items[0].startHref).toBeNull();
    expect(items[0].blockedReason).toBe("Workflow runtime start is niet ingeschakeld.");
    // The start service must not even be consulted when the global flag is off.
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("requires the per-workflow cutover flag before reporting a workflow startable", async () => {
    vi.stubEnv(FLAG_RUNTIME_START, "true");
    prepareMock.mockResolvedValue({ ok: true, value: startModel() });

    const items = await loadPublishedWorkflowCatalog({} as never, uatChangeManager);

    expect(items).toHaveLength(1);
    expect(items[0].startable).toBe(false);
    expect(items[0].blockedReason).toBe("Workflow runtime is niet actief voor deze versie.");
  });

  it("keeps a workflow blocked when the start service refuses it (scope/permission denial)", async () => {
    vi.stubEnv(FLAG_RUNTIME_START, "true");
    vi.stubEnv(FLAG_CUTOVER, "true");
    const denial: WorkflowRuntimeStartServiceResult<WorkflowRuntimeStartModel> = {
      ok: false,
      code: "scope_denied",
      message: "De workflow ligt buiten jouw scope.",
    };
    prepareMock.mockResolvedValue(denial);

    const items = await loadPublishedWorkflowCatalog({} as never, uatChangeManager);

    expect(items).toHaveLength(1);
    expect(items[0].startable).toBe(false);
    expect(items[0].blockedReason).toBe("De workflow ligt buiten jouw scope.");
  });
});
