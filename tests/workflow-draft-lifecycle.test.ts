import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import { WorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import type { WorkflowDefinitionRecord } from "@/lib/workflow-studio/definition-repository";
import {
  buildBlankWorkflowDraftInput,
  createWorkflowFromSelection,
  parseWorkflowTemplateReference,
} from "@/lib/workflow-studio/draft-lifecycle";

function manager(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    userId: "manager-1",
    displayName: "Change Manager",
    groups: ["bcm:role:change_manager"],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "session-1",
    ...overrides,
  };
}

function record(): WorkflowDefinitionRecord {
  const definitionId = randomUUID();
  return {
    definition: {
      id: definitionId,
      tenant: "tenant-a",
      businessUnit: "investments",
      clientIds: null,
      slug: "nieuwe-flow",
      name: "Nieuwe flow",
      description: "",
      ownerUserId: "manager-1",
      status: "draft",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    },
    draft: null,
    published: null,
    nodes: [],
    edges: [],
    roleBindings: [],
  };
}

function repository() {
  return {
    loadDefinition: vi.fn(),
    loadVersion: vi.fn(),
    loadLatestDraftVersion: vi.fn(),
    listDefinitionsForScope: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    clone: vi.fn(),
    publish: vi.fn(),
    loadLatestReview: vi.fn(),
    recordReview: vi.fn(),
    deprecate: vi.fn(),
  };
}

describe("Workflow Studio draft lifecycle", () => {
  it("builds a minimal valid start-to-end workflow for a blank process", async () => {
    const repo = repository();
    const created = record();
    repo.createDraft.mockResolvedValueOnce(created);
    const service = new WorkflowDefinitionService(repo as never);

    const result = await createWorkflowFromSelection(service, manager(), {
      name: "Nieuwe flow",
      slug: "nieuwe-flow",
      description: "Minimale flow",
    });

    expect(result.ok).toBe(true);
    expect(repo.createDraft).toHaveBeenCalledTimes(1);
    const input = repo.createDraft.mock.calls[0][0];
    expect(input.nodes.map((node: { nodeKey: string }) => node.nodeKey)).toEqual(["start", "end"]);
    expect(input.edges).toHaveLength(1);
  });

  it("narrows a blank draft to signed client claims", () => {
    const input = buildBlankWorkflowDraftInput(manager({ groups: ["bcm:role:change_manager", "bcm:client:client-7"] }), {
      name: "Clientflow",
      slug: "clientflow",
    });
    expect(input?.scope.clientIds).toEqual(["client-7"]);
  });

  it("clones a selected version as an independent draft", async () => {
    const cloned = record();
    const clone = vi.fn().mockResolvedValue({ ok: true, code: "ok", value: cloned });
    const sourceVersionId = randomUUID();

    const result = await createWorkflowFromSelection({ clone } as unknown as WorkflowDefinitionService, manager(), {
      name: "Templatekopie",
      slug: "templatekopie",
      template: { kind: "version", id: sourceVersionId },
    });

    expect(result.ok).toBe(true);
    expect(clone).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sourceVersionId,
      slug: "templatekopie",
    }));
  });

  it("materialiseert een ingebouwde template als onafhankelijke draft", async () => {
    const repo = repository();
    repo.createDraft.mockResolvedValueOnce(record());
    const service = new WorkflowDefinitionService(repo as never);
    const result = await createWorkflowFromSelection(service, manager(), {
      name: "Mijn benchmarkproces",
      slug: "mijn-benchmarkproces",
      template: { kind: "builtin", id: "benchmark_switch" },
    });
    expect(result.ok).toBe(true);
    const input = repo.createDraft.mock.calls[0][0];
    expect(input).toMatchObject({
      name: "Mijn benchmarkproces",
      slug: "mijn-benchmarkproces",
      category: "change",
      catalogDescription: expect.stringContaining("IST-benchmark"),
    });
    expect(input.nodes.some((node: { block: { blockType: string } }) => node.block.blockType === "change_request")).toBe(true);
  });

  it("fails closed when the identity has no authoring scope", async () => {
    const service = { createDraft: vi.fn(), clone: vi.fn() } as unknown as WorkflowDefinitionService;
    const result = await createWorkflowFromSelection(service, manager({ tenant: null }), {
      name: "Geen scope",
      slug: "geen-scope",
    });
    expect(result).toMatchObject({ ok: false, code: "identity_scope_missing" });
  });

  it("accepts only typed UUID template references", () => {
    const id = randomUUID();
    expect(parseWorkflowTemplateReference(`definition:${id}`)).toEqual({ kind: "definition", id });
    expect(parseWorkflowTemplateReference(`version:${id}`)).toEqual({ kind: "version", id });
    expect(parseWorkflowTemplateReference("version:not-a-uuid")).toBeNull();
    expect(parseWorkflowTemplateReference("builtin:benchmark_switch")).toEqual({ kind: "builtin", id: "benchmark_switch" });
    expect(parseWorkflowTemplateReference("builtin:unknown")).toBeNull();
    expect(parseWorkflowTemplateReference("")).toBeNull();
  });
});
