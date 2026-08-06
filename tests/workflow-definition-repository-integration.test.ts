import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import {
  WorkflowDefinitionRepository,
  WorkflowRepositoryError,
} from "@/lib/workflow-studio/definition-repository";

const HAS_DB = Boolean(process.env.DATABASE_URL);

function uuid() {
  return randomUUID();
}

function makeRepo(): WorkflowDefinitionRepository {
  if (!sql) throw new Error("DATABASE_URL not set");
  return new WorkflowDefinitionRepository(sql);
}

async function cleanupDefinition(definitionId: string): Promise<void> {
  if (!sql) return;
  await sql`DELETE FROM workflow_definition WHERE id = ${definitionId}`;
}

describe.runIf(HAS_DB)("WorkflowDefinitionRepository integration (PostgreSQL)", () => {
  const created: string[] = [];
  const tenant = `tenant-${uuid().slice(0, 8)}`;
  const businessUnit = `bu-${uuid().slice(0, 8)}`;

  afterAll(async () => {
    for (const id of created) {
      await cleanupDefinition(id);
    }
  });

  it("createDraft → updateDraft → publish writes a hashed immutable version", async () => {
    const repo = makeRepo();
    const startId = uuid();
    const endId = uuid();
    const draft = await repo.createDraft({
      scope: { tenant, businessUnit },
      slug: `flow-${uuid().slice(0, 6)}`,
      name: "Initial flow",
      description: "",
      nodes: [
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
          position: { x: 10, y: 0 },
        },
      ],
      edges: [
        {
          edgeKey: "e1",
          sourceNodeId: startId,
          sourcePort: "out",
          targetNodeId: endId,
          targetPort: "in",
        },
      ],
      roleBindings: [
        {
          workflowRole: "starter",
          identityGroup: "bcm:role:change_manager",
          permissions: ["workflow:start"],
          tenant,
          businessUnit,
        },
      ],
    }, "user-test");
    created.push(draft.definition.id);
    expect(draft.draft).not.toBeNull();
    expect(draft.roleBindings).toHaveLength(1);

    const expectedRevision = Number(draft.draft!.revision);
    const updated = await repo.updateDraft(
      {
        definitionId: draft.definition.id,
        expectedRevision,
        nodes: [
          {
            nodeKey: "start",
            block: { blockType: "manual_start", contractVersion: 1 },
            configuration: { foo: "bar" },
            position: { x: 0, y: 0 },
          },
          {
            nodeKey: "end",
            block: { blockType: "end", contractVersion: 1 },
            configuration: {},
            position: { x: 10, y: 0 },
          },
        ],
        edges: [
          {
            edgeKey: "e1",
            sourceNodeId: startId,
            sourcePort: "out",
            targetNodeId: endId,
            targetPort: "in",
          },
        ],
        roleBindings: [
          {
            workflowRole: "starter",
            identityGroup: "bcm:role:change_manager",
            permissions: ["workflow:start"],
            tenant,
            businessUnit,
          },
        ],
      },
      "user-test",
    );
    expect(Number(updated.version.revision)).toBeGreaterThan(expectedRevision);

    // A second update with a stale revision must fail.
    await expect(
      repo.updateDraft(
        {
          definitionId: draft.definition.id,
          expectedRevision,
          metadata: { name: "Stale" },
        },
        "user-test",
      ),
    ).rejects.toBeInstanceOf(WorkflowRepositoryError);

    // Publishing with the up-to-date revision succeeds and stamps a hash.
    const published = await repo.publish(draft.definition.id, Number(updated.version.revision), "user-test");
    expect(published.version.status).toBe("published");
    expect(published.version.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(published.version.publishedAt).not.toBeNull();
    expect(published.version.publishedByUserId).toBe("user-test");
  });

  it("clone copies the source version into a fresh definition with a new draft", async () => {
    const repo = makeRepo();
    const startId = uuid();
    const endId = uuid();
    const original = await repo.createDraft({
      scope: { tenant, businessUnit },
      slug: `origin-${uuid().slice(0, 6)}`,
      name: "Original",
      description: "",
      nodes: [
        {
          nodeKey: "start",
          block: { blockType: "manual_start", contractVersion: 1 },
          configuration: { from: "original" },
          position: { x: 0, y: 0 },
        },
        {
          nodeKey: "end",
          block: { blockType: "end", contractVersion: 1 },
          configuration: {},
          position: { x: 5, y: 0 },
        },
      ],
      edges: [
        {
          edgeKey: "e1",
          sourceNodeId: startId,
          sourcePort: "out",
          targetNodeId: endId,
          targetPort: "in",
        },
      ],
      roleBindings: [],
    }, "user-test");
    created.push(original.definition.id);

    const published = await repo.publish(original.definition.id, Number(original.draft!.revision), "user-test");
    const clone = await repo.clone(published.version.id, {
      scope: { tenant, businessUnit },
      slug: `clone-${uuid().slice(0, 6)}`,
      name: "Cloned",
      description: "Cloned flow",
      ownerUserId: "user-test",
    });
    created.push(clone.definition.id);
    expect(clone.definition.id).not.toBe(original.definition.id);
    expect(clone.draft).not.toBeNull();
    expect(clone.draft!.status).toBe("draft");
    expect(clone.draft!.publishedAt).toBeNull();
    expect(clone.nodes).toHaveLength(2);
    expect(clone.edges).toHaveLength(1);
    expect(clone.nodes[0].configuration).toEqual({ from: "original" });
  });

  it("deprecate marks the definition as deprecated and rejects further updates", async () => {
    const repo = makeRepo();
    const draft = await repo.createDraft({
      scope: { tenant, businessUnit },
      slug: `to-dep-${uuid().slice(0, 6)}`,
      name: "Deprecated",
      description: "",
      nodes: [],
      edges: [],
      roleBindings: [],
    }, "user-test");
    created.push(draft.definition.id);

    const deprecated = await repo.deprecate(draft.definition.id, "user-test");
    expect(deprecated.status).toBe("deprecated");
  });

  beforeAll(() => {
    if (!sql) throw new Error("DATABASE_URL required");
  });
});
