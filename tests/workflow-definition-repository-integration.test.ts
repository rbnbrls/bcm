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
  try {
    await sql`DELETE FROM workflow_definition WHERE id = ${definitionId}`;
  } catch {
    // Published versions are immutable by design, so the definition row cannot
    // be deleted while one exists. Archive it instead so re-runs stay isolated
    // and the leftover row is inert.
    await sql`
      UPDATE workflow_definition
      SET status = 'archived', updated_at = now()
      WHERE id = ${definitionId}
    `;
  }
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
          id: startId,
          nodeKey: "start",
          block: { blockType: "manual_start", contractVersion: 1 },
          configuration: {},
          position: { x: 0, y: 0 },
        },
        {
          id: endId,
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
    // Provided node ids must be persisted so edge foreign keys resolve.
    expect(draft.nodes.map((node) => node.id).sort()).toEqual([startId, endId].sort());

    const expectedRevision = Number(draft.draft!.revision);
    const updated = await repo.updateDraft(
      {
        definitionId: draft.definition.id,
        expectedRevision,
        nodes: [
          {
            id: startId,
            nodeKey: "start",
            block: { blockType: "manual_start", contractVersion: 1 },
            configuration: { foo: "bar" },
            position: { x: 0, y: 0 },
          },
          {
            id: endId,
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

    await expect(repo.publish(
      draft.definition.id,
      Number(updated.version.revision),
      "user-test",
    )).rejects.toMatchObject({ code: "review_required" });

    const review = await repo.recordReview({
      definitionId: draft.definition.id,
      expectedRevision: Number(updated.version.revision),
      decision: "approved",
      notes: "Integratiereview akkoord.",
      reviewerUserId: "reviewer-test",
    });
    // Publishing with the approved, up-to-date revision succeeds and stamps a hash.
    const published = await repo.publish(draft.definition.id, Number(updated.version.revision), "user-test");
    expect(published.version.status).toBe("published");
    expect(published.version.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(published.version.publishedAt).not.toBeNull();
    expect(published.version.publishedByUserId).toBe("user-test");
    if (!sql) throw new Error("DATABASE_URL not set");
    await expect(sql`
      UPDATE workflow_version_review SET notes = 'gewijzigd' WHERE id = ${review.id}
    `).rejects.toThrow(/immutable/i);
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
          id: startId,
          nodeKey: "start",
          block: { blockType: "manual_start", contractVersion: 1 },
          configuration: { from: "original" },
          position: { x: 0, y: 0 },
        },
        {
          id: endId,
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

    await repo.recordReview({
      definitionId: original.definition.id,
      expectedRevision: Number(original.draft!.revision),
      decision: "approved",
      notes: "Integratiereview akkoord.",
      reviewerUserId: "reviewer-test",
    });
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

  it("createDraftFromPublished branches an editable draft from the latest published version", async () => {
    const repo = makeRepo();
    const startId = uuid();
    const endId = uuid();
    const original = await repo.createDraft({
      scope: { tenant, businessUnit },
      slug: `branch-${uuid().slice(0, 6)}`,
      name: "Branchable",
      description: "",
      nodes: [
        {
          id: startId,
          nodeKey: "start",
          block: { blockType: "manual_start", contractVersion: 1 },
          configuration: { label: "published" },
          position: { x: 0, y: 0 },
        },
        {
          id: endId,
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
    created.push(original.definition.id);
    await repo.recordReview({
      definitionId: original.definition.id,
      expectedRevision: Number(original.draft!.revision),
      decision: "approved",
      notes: "Integratiereview akkoord.",
      reviewerUserId: "reviewer-test",
    });
    const published = await repo.publish(original.definition.id, Number(original.draft!.revision), "user-test");
    expect(published.version.versionNumber).toBe(1);
    const publishedNodeIds = published.nodes.map((node) => node.id).sort();

    // Branching keeps the definition and copies the published content into a
    // fresh draft with new node ids (no cross-version references).
    const branched = await repo.createDraftFromPublished(original.definition.id);
    expect(branched.definition.id).toBe(original.definition.id);
    expect(branched.definition.status).toBe("published");
    expect(branched.draft).not.toBeNull();
    expect(branched.draft!.status).toBe("draft");
    expect(branched.draft!.versionNumber).toBe(2);
    expect(branched.draft!.contentHash).toBeNull();
    expect(branched.published).not.toBeNull();
    expect(branched.nodes).toHaveLength(2);
    expect(branched.edges).toHaveLength(1);
    expect(branched.roleBindings).toHaveLength(1);
    expect(branched.nodes.map((node) => node.id).sort()).not.toEqual(publishedNodeIds);
    expect(branched.nodes.find((node) => node.nodeKey === "start")?.configuration).toEqual({ label: "published" });
    expect(branched.roleBindings[0].identityGroup).toBe("bcm:role:change_manager");

    // The branched draft is editable: change a configuration value.
    const draftStartId = branched.nodes.find((node) => node.nodeKey === "start")!.id;
    const draftEndId = branched.nodes.find((node) => node.nodeKey === "end")!.id;
    const updated = await repo.updateDraft(
      {
        definitionId: original.definition.id,
        expectedRevision: Number(branched.draft!.revision),
        nodes: [
          {
            id: draftStartId,
            nodeKey: "start",
            block: { blockType: "manual_start", contractVersion: 1 },
            configuration: { label: "gewijzigd" },
            position: { x: 0, y: 0 },
          },
          {
            id: draftEndId,
            nodeKey: "end",
            block: { blockType: "end", contractVersion: 1 },
            configuration: {},
            position: { x: 10, y: 0 },
          },
        ],
        edges: [
          {
            edgeKey: "e1",
            sourceNodeId: draftStartId,
            sourcePort: "out",
            targetNodeId: draftEndId,
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
    expect(Number(updated.version.revision)).toBeGreaterThan(Number(branched.draft!.revision));

    // Review + publish the branched draft as version 2; the original v1 stays
    // untouched and both published versions coexist.
    await repo.recordReview({
      definitionId: original.definition.id,
      expectedRevision: Number(updated.version.revision),
      decision: "approved",
      notes: "Review tweede versie akkoord.",
      reviewerUserId: "reviewer-test",
    });
    const republished = await repo.publish(original.definition.id, Number(updated.version.revision), "user-test");
    expect(republished.version.versionNumber).toBe(2);
    expect(republished.version.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const after = await repo.loadDefinition(original.definition.id);
    expect(after?.draft).toBeNull();
    expect(after?.published?.versionNumber).toBe(2);
    expect(await repo.loadVersion(published.version.id)).not.toBeNull();
  });

  it("createDraftFromPublished rejects when no published version exists or a draft already exists", async () => {
    const repo = makeRepo();
    const neverPublished = await repo.createDraft({
      scope: { tenant, businessUnit },
      slug: `no-pub-${uuid().slice(0, 6)}`,
      name: "Nooit gepubliceerd",
      description: "",
      nodes: [],
      edges: [],
      roleBindings: [],
    }, "user-test");
    created.push(neverPublished.definition.id);
    await expect(repo.createDraftFromPublished(neverPublished.definition.id))
      .rejects.toMatchObject({ code: "no_published_version" });

    // Publish it, then a second branch attempt must fail with draft_already_exists.
    await repo.recordReview({
      definitionId: neverPublished.definition.id,
      expectedRevision: Number(neverPublished.draft!.revision),
      decision: "approved",
      notes: "Integratiereview akkoord.",
      reviewerUserId: "reviewer-test",
    });
    await repo.publish(neverPublished.definition.id, Number(neverPublished.draft!.revision), "user-test");
    await repo.createDraftFromPublished(neverPublished.definition.id);
    await expect(repo.createDraftFromPublished(neverPublished.definition.id))
      .rejects.toMatchObject({ code: "draft_already_exists" });
  });

  beforeAll(() => {
    if (!sql) throw new Error("DATABASE_URL required");
  });
});
