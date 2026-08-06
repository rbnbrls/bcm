import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import { WorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import type {
  WorkflowDefinitionRecord,
  WorkflowVersionSnapshot,
} from "@/lib/workflow-studio/definition-repository";

function changeManager(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    userId: "user-cm",
    displayName: "Change Manager",
    groups: ["bcm:role:change_manager"],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "session-cm",
    ...overrides,
  };
}

function investor(overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    userId: "user-inv",
    displayName: "Investor",
    groups: ["bcm:role:investor"],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "session-inv",
    ...overrides,
  };
}

function clientScopedManager(clientIds: string[]): IdentityContext {
  return changeManager({ groups: ["bcm:role:change_manager", ...clientIds.map((id) => `bcm:client:${id}`)] });
}

const DEF_ID = randomUUID();
const VERSION_ID = randomUUID();
const NODE_A_ID = randomUUID();
const NODE_B_ID = randomUUID();
const EDGE_ID = randomUUID();
const SOURCE_DEF_ID = randomUUID();
const SOURCE_VERSION_ID = randomUUID();
const CLONE_SOURCE_DEF = randomUUID();

function fakeRepository(): {
  repo: Parameters<WorkflowDefinitionService["createDraft"]>[1] extends never ? never : {
    loadDefinition: ReturnType<typeof vi.fn>;
    loadVersion: ReturnType<typeof vi.fn>;
    loadLatestDraftVersion: ReturnType<typeof vi.fn>;
    listDefinitionsForScope: ReturnType<typeof vi.fn>;
    createDraft: ReturnType<typeof vi.fn>;
    updateDraft: ReturnType<typeof vi.fn>;
    clone: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    deprecate: ReturnType<typeof vi.fn>;
  };
} {
  const repo = {
    loadDefinition: vi.fn(),
    loadVersion: vi.fn(),
    loadLatestDraftVersion: vi.fn(),
    listDefinitionsForScope: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    clone: vi.fn(),
    publish: vi.fn(),
    deprecate: vi.fn(),
  };
  return { repo } as never;
}

function makeServiceWith(repo: ReturnType<typeof fakeRepository>["repo"]): WorkflowDefinitionService {
  // The constructor expects a WorkflowDefinitionRepository; we substitute it
  // with a duck-typed object that satisfies the same surface. This lets the
  // service-layer tests focus on authorization + validation without spinning
  // up a real database.
  return new WorkflowDefinitionService(repo as never);
}

const sampleNodes = () => [
  {
    nodeKey: "start",
    block: { blockType: "manual_start", contractVersion: 1 },
    configuration: {},
    position: { x: 0, y: 0 },
  },
  {
    nodeKey: "end",
    block: { blockType: "end", contractVersion: 1 },
    configuration: {},
    position: { x: 100, y: 0 },
  },
];

const sampleEdges = (startKey: string, endKey: string) => [
  {
    edgeKey: "start_to_end",
    sourceNodeId: startKey,
    sourcePort: "out",
    targetNodeId: endKey,
    targetPort: "in",
  },
];

describe("WorkflowDefinitionService.createDraft", () => {
  it("rejects identities without the workflow:design permission", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const result = await service.createDraft(investor(), {
      scope: { tenant: "tenant-a", businessUnit: "investments" },
      slug: "new-flow",
      name: "Nieuwe flow",
      description: "",
      nodes: sampleNodes(),
      edges: [],
      roleBindings: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("permission_denied");
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it("rejects out-of-scope tenant before touching the database", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const result = await service.createDraft(changeManager(), {
      scope: { tenant: "tenant-b", businessUnit: "investments" },
      slug: "new-flow",
      name: "Nieuwe flow",
      description: "",
      nodes: sampleNodes(),
      edges: [],
      roleBindings: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("scope_denied");
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it("rejects a client-scoped identity requesting a business-unit-wide scope", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const result = await service.createDraft(clientScopedManager(["client-1"]), {
      scope: { tenant: "tenant-a", businessUnit: "investments" },
      slug: "new-flow",
      name: "Nieuwe flow",
      description: "",
      nodes: sampleNodes(),
      edges: [],
      roleBindings: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("scope_denied");
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it("creates a draft when authorization, scope and graph validation pass", async () => {
    const { repo } = fakeRepository();
    const record: WorkflowDefinitionRecord = {
      definition: {
        id: DEF_ID,
        tenant: "tenant-a",
        businessUnit: "investments",
        clientIds: null,
        slug: "new-flow",
        name: "Nieuwe flow",
        description: "",
        ownerUserId: "user-cm",
        status: "draft",
        createdAt: "2026-08-06T00:00:00Z",
        updatedAt: "2026-08-06T00:00:00Z",
      },
      draft: {
        id: VERSION_ID,
        workflowDefinitionId: DEF_ID,
        versionNumber: 1,
        schemaVersion: 1,
        status: "draft",
        contentHash: null,
        revision: "1",
        publishedAt: null,
        publishedByUserId: null,
        createdAt: "2026-08-06T00:00:00Z",
        updatedAt: "2026-08-06T00:00:00Z",
      },
      published: null,
      nodes: [],
      edges: [],
      roleBindings: [],
    };
    repo.createDraft.mockResolvedValueOnce(record);
    const service = makeServiceWith(repo);
    const result = await service.createDraft(changeManager(), {
      scope: { tenant: "tenant-a", businessUnit: "investments" },
      slug: "new-flow",
      name: "Nieuwe flow",
      description: "",
      nodes: sampleNodes(),
      edges: sampleEdges("start", "end"),
      roleBindings: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.id).toBe(DEF_ID);
    expect(repo.createDraft).toHaveBeenCalledTimes(1);
  });

  it("rejects draft with an unknown block type", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const result = await service.createDraft(changeManager(), {
      scope: { tenant: "tenant-a", businessUnit: "investments" },
      slug: "bad-blocks",
      name: "Bad blocks",
      description: "",
      nodes: [
        {
          nodeKey: "start",
          block: { blockType: "manual_start", contractVersion: 1 },
          configuration: {},
          position: { x: 0, y: 0 },
        },
        {
          nodeKey: "rogue",
          block: { blockType: "rogue_block", contractVersion: 1 },
          configuration: {},
          position: { x: 1, y: 0 },
        },
        {
          nodeKey: "end",
          block: { blockType: "end", contractVersion: 1 },
          configuration: {},
          position: { x: 2, y: 0 },
        },
      ],
      edges: [],
      roleBindings: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation_failed");
    expect(result.issues?.some((issue) => issue.code === "unknown_block_type")).toBe(true);
    expect(repo.createDraft).not.toHaveBeenCalled();
  });
});

describe("WorkflowDefinitionService.publish", () => {
  it("rejects publishing when the identity lacks workflow:publish", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo.loadDefinition.mockResolvedValueOnce({
      definition: {
        id: DEF_ID,
        tenant: "tenant-a",
        businessUnit: "investments",
        clientIds: null,
        slug: "flow",
        name: "Flow",
        description: "",
        ownerUserId: "user-cm",
        status: "draft",
        createdAt: "",
        updatedAt: "",
      },
      draft: {
        id: VERSION_ID,
        workflowDefinitionId: DEF_ID,
        versionNumber: 1,
        schemaVersion: 1,
        status: "draft",
        contentHash: null,
        revision: "1",
        publishedAt: null,
        publishedByUserId: null,
        createdAt: "",
        updatedAt: "",
      },
      published: null,
      nodes: [
        {
          id: NODE_A_ID,
          workflowVersionId: VERSION_ID,
          nodeKey: "start",
          blockType: "manual_start",
          blockContractVersion: 1,
          configuration: {},
          positionX: 0,
          positionY: 0,
        },
        {
          id: NODE_B_ID,
          workflowVersionId: VERSION_ID,
          nodeKey: "end",
          blockType: "end",
          blockContractVersion: 1,
          configuration: {},
          positionX: 1,
          positionY: 0,
        },
      ],
      edges: [],
      roleBindings: [],
    } satisfies WorkflowDefinitionRecord);
    const result = await service.publish(investor(), {
      definitionId: DEF_ID,
      expectedRevision: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("permission_denied");
    expect(repo.publish).not.toHaveBeenCalled();
  });

  it("publishes a draft and propagates revision_conflict from the repository", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const startId = "11111111-1111-1111-1111-111111111111";
    const endId = "22222222-2222-2222-2222-222222222222";
    repo.loadDefinition.mockResolvedValueOnce({
      definition: {
        id: DEF_ID,
        tenant: "tenant-a",
        businessUnit: "investments",
        clientIds: null,
        slug: "flow",
        name: "Flow",
        description: "",
        ownerUserId: "user-cm",
        status: "draft",
        createdAt: "",
        updatedAt: "",
      },
      draft: {
        id: VERSION_ID,
        workflowDefinitionId: DEF_ID,
        versionNumber: 1,
        schemaVersion: 1,
        status: "draft",
        contentHash: null,
        revision: "3",
        publishedAt: null,
        publishedByUserId: null,
        createdAt: "",
        updatedAt: "",
      },
      published: null,
      nodes: [
        {
          id: NODE_A_ID,
          workflowVersionId: VERSION_ID,
          nodeKey: "start",
          blockType: "manual_start",
          blockContractVersion: 1,
          configuration: {},
          positionX: 0,
          positionY: 0,
        },
        {
          id: NODE_B_ID,
          workflowVersionId: VERSION_ID,
          nodeKey: "end",
          blockType: "end",
          blockContractVersion: 1,
          configuration: {},
          positionX: 1,
          positionY: 0,
        },
      ],
      edges: [
        {
          id: EDGE_ID,
          workflowVersionId: VERSION_ID,
          edgeKey: "e1",
          sourceNodeId: NODE_A_ID,
          sourcePort: "out",
          targetNodeId: NODE_B_ID,
          targetPort: "in",
          condition: null,
        },
      ],
      roleBindings: [],
    } satisfies WorkflowDefinitionRecord);
    const snapshot: WorkflowVersionSnapshot = {
      version: {
        id: VERSION_ID,
        workflowDefinitionId: DEF_ID,
        versionNumber: 1,
        schemaVersion: 1,
        status: "published",
        contentHash: "deadbeef".repeat(8),
        revision: "3",
        publishedAt: "2026-08-06T00:00:00Z",
        publishedByUserId: "user-cm",
        createdAt: "",
        updatedAt: "",
      },
      definition: {} as WorkflowVersionSnapshot["definition"],
      nodes: [],
      edges: [],
      roleBindings: [],
    };
    repo.publish.mockResolvedValueOnce(snapshot);
    const result = await service.publish(changeManager(), {
      definitionId: DEF_ID,
      expectedRevision: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version.status).toBe("published");
    expect(repo.publish).toHaveBeenCalledWith(DEF_ID, 3, "user-cm");
  });

  it("returns revision_conflict when the publish revision does not match the loaded draft", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo.loadDefinition.mockResolvedValueOnce({
      definition: {
        id: DEF_ID,
        tenant: "tenant-a",
        businessUnit: "investments",
        clientIds: null,
        slug: "flow",
        name: "Flow",
        description: "",
        ownerUserId: "user-cm",
        status: "draft",
        createdAt: "",
        updatedAt: "",
      },
      draft: {
        id: VERSION_ID,
        workflowDefinitionId: DEF_ID,
        versionNumber: 1,
        schemaVersion: 1,
        status: "draft",
        contentHash: null,
        revision: "5",
        publishedAt: null,
        publishedByUserId: null,
        createdAt: "",
        updatedAt: "",
      },
      published: null,
      nodes: [
        {
          id: NODE_A_ID,
          workflowVersionId: VERSION_ID,
          nodeKey: "start",
          blockType: "manual_start",
          blockContractVersion: 1,
          configuration: {},
          positionX: 0,
          positionY: 0,
        },
        {
          id: NODE_B_ID,
          workflowVersionId: VERSION_ID,
          nodeKey: "end",
          blockType: "end",
          blockContractVersion: 1,
          configuration: {},
          positionX: 1,
          positionY: 0,
        },
      ],
      edges: [],
      roleBindings: [],
    } satisfies WorkflowDefinitionRecord);
    const result = await service.publish(changeManager(), {
      definitionId: DEF_ID,
      expectedRevision: 3,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("revision_conflict");
    expect(repo.publish).not.toHaveBeenCalled();
  });
});

describe("WorkflowDefinitionService.updateDraft", () => {
  it("detects optimistic-locking conflicts before touching the repository", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo.loadDefinition.mockResolvedValueOnce({
      definition: {
        id: DEF_ID,
        tenant: "tenant-a",
        businessUnit: "investments",
        clientIds: null,
        slug: "flow",
        name: "Flow",
        description: "",
        ownerUserId: "user-cm",
        status: "draft",
        createdAt: "",
        updatedAt: "",
      },
      draft: {
        id: VERSION_ID,
        workflowDefinitionId: DEF_ID,
        versionNumber: 1,
        schemaVersion: 1,
        status: "draft",
        contentHash: null,
        revision: "5",
        publishedAt: null,
        publishedByUserId: null,
        createdAt: "",
        updatedAt: "",
      },
      published: null,
      nodes: [],
      edges: [],
      roleBindings: [],
    } satisfies WorkflowDefinitionRecord);
    const result = await service.updateDraft(changeManager(), {
      definitionId: DEF_ID,
      expectedRevision: 3,
      metadata: { name: "Rename" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("revision_conflict");
    expect(repo.updateDraft).not.toHaveBeenCalled();
  });
});

describe("WorkflowDefinitionService.clone", () => {
  it("rejects cloning when the source scope is outside the identity scope", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo.loadLatestDraftVersion.mockResolvedValueOnce({
      version: {
        id: VERSION_ID,
        workflowDefinitionId: SOURCE_DEF_ID,
        versionNumber: 1,
        schemaVersion: 1,
        status: "draft",
        contentHash: null,
        revision: "1",
        publishedAt: null,
        publishedByUserId: null,
        createdAt: "",
        updatedAt: "",
      },
      definition: {
        id: SOURCE_DEF_ID,
        tenant: "tenant-other",
        businessUnit: "investments",
        clientIds: null,
        slug: "source",
        name: "Source",
        description: "",
        ownerUserId: "user-1",
        status: "draft",
        createdAt: "",
        updatedAt: "",
      },
      nodes: [],
      edges: [],
      roleBindings: [],
    });
    const result = await service.clone(changeManager(), {
      sourceDefinitionId: CLONE_SOURCE_DEF,
      scope: { tenant: "tenant-a", businessUnit: "investments" },
      slug: "copy",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("scope_denied");
    expect(repo.clone).not.toHaveBeenCalled();
  });
});

describe("WorkflowDefinitionService.deprecate", () => {
  it("requires the workflow:deprecate permission", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo.loadDefinition.mockResolvedValueOnce({
      definition: {
        id: DEF_ID,
        tenant: "tenant-a",
        businessUnit: "investments",
        clientIds: null,
        slug: "flow",
        name: "Flow",
        description: "",
        ownerUserId: "user-cm",
        status: "published",
        createdAt: "",
        updatedAt: "",
      },
      draft: null,
      published: null,
      nodes: [],
      edges: [],
      roleBindings: [],
    });
    const result = await service.deprecate(investor(), {
      definitionId: DEF_ID,
    });
    // The investor role does not have workflow:deprecate.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("permission_denied");
    expect(repo.deprecate).not.toHaveBeenCalled();
  });
});
