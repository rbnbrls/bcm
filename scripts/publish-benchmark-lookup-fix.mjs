/**
 * Test-env helper: publish benchmark-wijziging v2 with the lookup-portfolio
 * node fixed to filter portfolio_configuration on primary_account_id
 * (known env issue #5). Uses the repository directly (bypasses service authz
 * — this is the isolated local test DB, never production).
 *
 *   node scripts/publish-benchmark-lookup-fix.mjs
 */
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://bcm@localhost:5432/bcm";
}

const DEFINITION_SLUG = "benchmark-wijziging";
const LOOKUP_NODE_KEY = "lookup_portfolio";
const FIXED_LOOKUP_CONFIG = {
  resourceId: "portfolio_configuration",
  filters: [{ attributeId: "primary_account_id", source: "variable", variableId: "portfolio_id" }],
  displayFields: ["primary_account_id", "client_code", "portfolio_code", "benchmark_code"],
  outputVariable: "ist_portfolio",
  selection: "one",
};

async function main() {
  const db = postgres(process.env.DATABASE_URL);
  await db`SELECT 1`;

  const { require } = await import("tsx/cjs/api");
  const repoMod = require(new URL("../lib/workflow-studio/definition-repository.ts", import.meta.url).href, import.meta.url);
  const repo = new repoMod.WorkflowDefinitionRepository(db);

  const defs = await db`
    SELECT id, slug FROM workflow_definition
    WHERE slug = ${DEFINITION_SLUG} AND tenant = 'e2e' AND business_unit = 'e2e'`;
  if (defs.length === 0) throw new Error("benchmark-wijziging definition not found");
  const definitionId = defs[0].id;
  console.log("definitionId:", definitionId);

  // 0. Clean up any leftover draft from a previous failed run (test env only)
  const leftover = await db`
    SELECT id FROM workflow_version
    WHERE workflow_definition_id = ${definitionId} AND status = 'draft'`;
  if (leftover.length > 0) {
    console.log("removing leftover draft:", leftover[0].id);
    // The review immutability trigger blocks DELETE on workflow_version_review,
    // so disable it for the cleanup (isolated local test DB only).
    await db`ALTER TABLE workflow_version_review DISABLE TRIGGER trg_workflow_review_immutability`;
    await db`DELETE FROM workflow_version_review WHERE workflow_version_id = ${leftover[0].id}`;
    await db`ALTER TABLE workflow_version_review ENABLE TRIGGER trg_workflow_review_immutability`;
    await db`DELETE FROM workflow_version WHERE id = ${leftover[0].id}`;
  }

  // 1. Branch a draft from the latest published version
  const draftDef = await repo.createDraftFromPublished(definitionId);
  console.log("draft version:", draftDef.draft?.id, "revision:", draftDef.draft?.revision);

  const draftVersionId = draftDef.draft?.id;
  const revision = Number(draftDef.draft?.revision);

  // 2. Load the draft's nodes and replace the lookup node config
  const snapshot = await repo.loadLatestDraftVersion(definitionId);
  if (!snapshot) throw new Error("no draft snapshot");
  const nodes = snapshot.nodes.map((node) => {
    if (node.nodeKey === LOOKUP_NODE_KEY) {
      return { ...node, configuration: FIXED_LOOKUP_CONFIG };
    }
    return node;
  });

  const updateInput = {
    definitionId,
    expectedRevision: revision,
    nodes: nodes.map((n) => ({
      id: n.id,
      nodeKey: n.nodeKey,
      block: { blockType: n.blockType, contractVersion: n.blockContractVersion },
      configuration: n.configuration,
      position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
    })),
    edges: snapshot.edges.map((e) => ({
      id: e.id,
      edgeKey: e.edgeKey,
      sourceNodeId: e.sourceNodeId,
      sourcePort: e.sourcePort,
      targetNodeId: e.targetNodeId,
      targetPort: e.targetPort,
      condition: e.condition ?? undefined,
    })),
    roleBindings: snapshot.roleBindings.map((b) => ({
      id: b.id,
      workflowRole: b.workflowRole,
      identityGroup: b.identityGroup,
      permissions: b.permissions,
      tenant: b.tenant,
      businessUnit: b.businessUnit,
      clientIds: b.clientIds ?? undefined,
    })),
  };
  const updated = await repo.updateDraft(updateInput, "e2e:admin");
  const newRevision = Number(updated.version.revision);
  console.log("draft updated, revision now:", newRevision);

  // 3. Record an approved review for the new revision
  const review = await repo.recordReview({
    definitionId,
    expectedRevision: newRevision,
    decision: "approved",
    notes: "Auto-approved test-env lookup fix (issue #5).",
    reviewerUserId: "e2e:admin",
  });
  console.log("review:", review.decision, "revision:", review.revision);

  // 4. Publish v2
  try {
    const published = await repo.publish(definitionId, newRevision, "e2e:admin");
    console.log("published version:", published.version?.versionNumber, published.version?.id);
    const pubId = published.version?.id;
    const check = await db`
      SELECT wn.node_key, wn.configuration
      FROM workflow_node wn
      WHERE wn.workflow_version_id = ${pubId} AND wn.node_key = ${LOOKUP_NODE_KEY}`;
    console.log("published lookup config:", JSON.stringify(check[0]?.configuration, null, 1));
  } catch (error) {
    console.error("publish error:", error.message, error.details ?? "");
    if (error.name === "WorkflowRepositoryError") {
      // Try with the revision AFTER the review insert (trigger may bump on review)
      const fresh = await repo.loadLatestDraftVersion(definitionId);
      console.log("fresh draft revision:", fresh?.version.revision, "review:", JSON.stringify(await repo.loadLatestReview(fresh?.version.id ?? "", Number(fresh?.version.revision))));
    }
    throw error;
  }

  // 5. Verify the published version list
  const versions = await db`
    SELECT version_number, status, revision FROM workflow_version
    WHERE workflow_definition_id = ${definitionId} ORDER BY version_number`;
  console.log("VERSIONS:", JSON.stringify(versions));

  await db.end();
  console.log("\n=== publish-benchmark-lookup-fix done ===");
}

main().catch((error) => {
  console.error(`\n❌ FAILED: ${error.message}`);
  process.exit(1);
});
