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
    loadLatestReview: ReturnType<typeof vi.fn>;
    listDefinitionsForScope: ReturnType<typeof vi.fn>;
    createDraft: ReturnType<typeof vi.fn>;
    updateDraft: ReturnType<typeof vi.fn>;
    clone: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    recordReview: ReturnType<typeof vi.fn>;
    deprecate: ReturnType<typeof vi.fn>;
  };
} {
  const repo = {
    loadDefinition: vi.fn(),
    loadVersion: vi.fn(),
    loadLatestDraftVersion: vi.fn(),
    loadLatestReview: vi.fn().mockResolvedValue({
      id: randomUUID(), workflowVersionId: VERSION_ID, revision: "1", decision: "approved",
      notes: "Akkoord", reviewerUserId: "reviewer", createdAt: "2026-08-10T00:00:00Z",
    }),
    listDefinitionsForScope: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    clone: vi.fn(),
    publish: vi.fn(),
    recordReview: vi.fn(),
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

function loadableRecord(
  definitionOverrides: Partial<Omit<WorkflowDefinitionRecord["definition"], "clientIds">> & {
    clientIds?: readonly string[] | null;
  } = {},
): WorkflowDefinitionRecord {
  const { clientIds, ...otherOverrides } = definitionOverrides;
  return {
    definition: {
      id: DEF_ID,
      tenant: "tenant-a",
      businessUnit: "investments",
      clientIds: null,
      slug: "loadable-flow",
      name: "Loadable flow",
      description: "",
      ownerUserId: "user-cm",
      status: "published",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      ...otherOverrides,
      ...(clientIds !== undefined ? { clientIds: clientIds ? [...clientIds] : null } : {}),
    },
    draft: null,
    published: {
      id: VERSION_ID,
      workflowDefinitionId: DEF_ID,
      versionNumber: 1,
      schemaVersion: 1,
      status: "published",
      contentHash: "a".repeat(64),
      revision: "2",
      publishedAt: "2026-08-10T00:00:00.000Z",
      publishedByUserId: "user-cm",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    },
    nodes: [],
    edges: [],
    roleBindings: [],
  };
}

function loadableSnapshot(
  definitionOverrides: Parameters<typeof loadableRecord>[0] = {},
): WorkflowVersionSnapshot {
  const record = loadableRecord(definitionOverrides);
  if (!record.published) throw new Error("Test fixture requires a published version.");
  return {
    version: record.published,
    definition: record.definition,
    nodes: record.nodes,
    edges: record.edges,
    roleBindings: record.roleBindings,
  };
}

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

  it("clones from the latest draft version when only sourceDefinitionId is given", async () => {
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
        tenant: "tenant-a",
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
    repo.clone.mockResolvedValueOnce({
      id: DEF_ID,
      tenant: "tenant-a",
      businessUnit: "investments",
      clientIds: null,
      slug: "copy",
      name: "Source (kopie)",
      description: "",
      ownerUserId: "user-cm",
      status: "draft",
      createdAt: "",
      updatedAt: "",
    });
    const result = await service.clone(changeManager(), {
      sourceDefinitionId: SOURCE_DEF_ID,
      scope: { tenant: "tenant-a", businessUnit: "investments" },
      slug: "copy",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repo.loadLatestDraftVersion).toHaveBeenCalledWith(SOURCE_DEF_ID);
    expect(repo.clone).toHaveBeenCalledWith(VERSION_ID, expect.objectContaining({ slug: "copy" }));
  });

  it("clones from a specific version when sourceVersionId is given", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo.loadVersion.mockResolvedValueOnce({
      version: {
        id: SOURCE_VERSION_ID,
        workflowDefinitionId: SOURCE_DEF_ID,
        versionNumber: 3,
        schemaVersion: 1,
        status: "published",
        contentHash: null,
        revision: "3",
        publishedAt: "",
        publishedByUserId: "user-1",
        createdAt: "",
        updatedAt: "",
      },
      definition: {
        id: SOURCE_DEF_ID,
        tenant: "tenant-a",
        businessUnit: "investments",
        clientIds: null,
        slug: "source",
        name: "Source",
        description: "",
        ownerUserId: "user-1",
        status: "published",
        createdAt: "",
        updatedAt: "",
      },
      nodes: [],
      edges: [],
      roleBindings: [],
    });
    repo.clone.mockResolvedValueOnce({
      id: DEF_ID,
      tenant: "tenant-a",
      businessUnit: "investments",
      clientIds: null,
      slug: "copy",
      name: "Source (kopie)",
      description: "",
      ownerUserId: "user-cm",
      status: "draft",
      createdAt: "",
      updatedAt: "",
    });
    const result = await service.clone(changeManager(), {
      sourceVersionId: SOURCE_VERSION_ID,
      scope: { tenant: "tenant-a", businessUnit: "investments" },
      slug: "copy",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(repo.loadVersion).toHaveBeenCalledWith(SOURCE_VERSION_ID);
    expect(repo.loadLatestDraftVersion).not.toHaveBeenCalled();
    expect(repo.clone).toHaveBeenCalledWith(SOURCE_VERSION_ID, expect.objectContaining({ slug: "copy" }));
  });
});

describe("WorkflowDefinitionService.load", () => {
  it("loads a definition after checking workflow:view and its persisted scope", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const record = loadableRecord();
    repo.loadDefinition.mockResolvedValueOnce(record);

    const result = await service.load(changeManager(), { definitionId: DEF_ID, includeDraft: true });

    expect(result).toEqual({ ok: true, code: "ok", value: record });
    expect(repo.loadDefinition).toHaveBeenCalledWith(DEF_ID, { includeDraft: true });
  });

  it("loads a version after checking workflow:view and its persisted scope", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const snapshot = loadableSnapshot();
    repo.loadVersion.mockResolvedValueOnce(snapshot);

    const result = await service.load(changeManager(), { versionId: VERSION_ID });

    expect(result).toEqual({ ok: true, code: "ok", value: snapshot });
    expect(repo.loadVersion).toHaveBeenCalledWith(VERSION_ID);
  });

  it.each([
    ["definition", { definitionId: DEF_ID }, "loadDefinition"],
    ["version", { versionId: VERSION_ID }, "loadVersion"],
  ] as const)("returns null when the requested %s does not exist", async (_label, input, method) => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo[method].mockResolvedValueOnce(null);

    const result = await service.load(changeManager(), input);

    expect(result).toEqual({ ok: true, code: "ok", value: null });
  });

  it("rejects identities without workflow:view before loading a record", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);

    const result = await service.load(investor(), { definitionId: DEF_ID });

    expect(result).toMatchObject({ ok: false, code: "permission_denied" });
    expect(repo.loadDefinition).not.toHaveBeenCalled();
  });

  it.each([
    ["tenant", changeManager(), { tenant: "tenant-b" }],
    ["business unit", changeManager(), { businessUnit: "operations" }],
    ["client", clientScopedManager(["client-1"]), { clientIds: ["client-2"] }],
  ] as const)("does not return a definition outside the identity %s scope", async (_label, actor, overrides) => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    repo.loadDefinition.mockResolvedValueOnce(loadableRecord(overrides));

    const result = await service.load(actor, { definitionId: DEF_ID });

    expect(result).toMatchObject({ ok: false, code: "scope_denied" });
  });
});

describe("WorkflowDefinitionService.listForScope", () => {
  it("requires workflow:view before listing definition metadata", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const result = await service.listForScope(investor(), {
      tenant: "tenant-a",
      businessUnit: "investments",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("permission_denied");
    expect(repo.listDefinitionsForScope).not.toHaveBeenCalled();
  });

  it("filters definition metadata to the signed client scope", async () => {
    const { repo } = fakeRepository();
    const service = makeServiceWith(repo);
    const base = loadableRecord().definition;
    repo.listDefinitionsForScope.mockResolvedValueOnce([
      { ...base, id: randomUUID(), clientIds: ["client-1"] },
      { ...base, id: randomUUID(), clientIds: ["client-2"] },
      { ...base, id: randomUUID(), clientIds: null },
    ]);

    const result = await service.listForScope(clientScopedManager(["client-1"]), {
      tenant: "tenant-a",
      businessUnit: "investments",
      clientIds: ["client-1"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].clientIds).toEqual(["client-1"]);
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
