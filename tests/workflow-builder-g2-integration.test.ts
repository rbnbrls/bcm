import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import { sql } from "@/lib/db";
import { buildBuiltinWorkflowTemplateDraft } from "@/lib/workflow-studio/builtin-workflow-templates";
import { createWorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { collectWorkflowSimulationControls, simulateWorkflowPath } from "@/lib/workflow-studio/workflow-simulator";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const identity: IdentityContext = {
  userId: "g2:change-manager",
  displayName: "G2 Change Manager",
  groups: ["bcm:role:change_manager"],
  tenant: "g2",
  businessUnit: "builder",
  sessionId: "g2-session",
};

describe.runIf(HAS_DB)("Workflow Studio G2 integration (PostgreSQL)", () => {
  const definitions: string[] = [];
  afterAll(async () => {
    if (!sql) return;
    for (const definitionId of definitions) {
      await sql`UPDATE workflow_definition SET status = 'archived', updated_at = now() WHERE id = ${definitionId}`;
    }
  });

  it("doorloopt create → configure → simulate → review → publish met een ingebouwde template", async () => {
    if (!sql) throw new Error("DATABASE_URL is required");
    const service = createWorkflowDefinitionService(sql);
    const template = buildBuiltinWorkflowTemplateDraft("benchmark_switch", identity, {
      tenant: "g2", businessUnit: "builder",
    });
    const suffix = randomUUID().slice(0, 8);
    const created = await service.createDraft(identity, {
      ...template,
      name: `G2 benchmark ${suffix}`,
      slug: `g2-benchmark-${suffix}`,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.value.draft) return;
    definitions.push(created.value.definition.id);

    const configured = await service.updateDraft(identity, {
      definitionId: created.value.definition.id,
      expectedRevision: Number(created.value.draft.revision),
      metadata: { catalogDescription: "G2-geconfigureerde benchmarkworkflow voor integratievalidatie." },
    });
    expect(configured.ok).toBe(true);
    if (!configured.ok) return;

    const nodes: WorkflowEditorNode[] = template.nodes.map((node) => ({
      id: node.id!, nodeKey: node.nodeKey, blockType: node.block.blockType,
      contractVersion: node.block.contractVersion, label: node.nodeKey, description: node.nodeKey,
      configuration: node.configuration, position: node.position,
    }));
    const edges: WorkflowEditorEdge[] = template.edges.map((edge) => ({
      id: edge.id!, edgeKey: edge.edgeKey, sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort, targetNodeId: edge.targetNodeId, targetPort: edge.targetPort,
    }));
    const controls = collectWorkflowSimulationControls(nodes);
    const variables = Object.fromEntries(controls.formFields.map(({ field }) => {
      const fallback = field.type === "date"
        ? "2026-12-01"
        : field.type === "number" || field.type === "currency"
          ? 1
          : field.type === "select" || field.type === "multiselect"
            ? field.options[0]?.value ?? "g2_fixture"
            : "g2_fixture";
      return [field.id, field.defaultValue ?? fallback];
    }));
    const lookupFixtures = Object.fromEntries(controls.lookups.map((lookup) => [lookup.nodeKey, lookup.selection === "many" ? [] : {}]));
    const simulation = simulateWorkflowPath(nodes, edges, { variables, lookupFixtures });
    expect(simulation.status).toBe("completed");
    expect(simulation.intents.some((intent) => intent.kind === "change_request")).toBe(true);

    const revision = Number(configured.value.version.revision);
    const submitted = await service.submitForReview(identity, {
      definitionId: created.value.definition.id,
      expectedRevision: revision,
      notes: "G2-simulatie akkoord.",
    });
    expect(submitted.ok).toBe(true);
    const reviewed = await service.review(identity, {
      definitionId: created.value.definition.id,
      expectedRevision: revision,
      decision: "approved",
      notes: "G2-review akkoord.",
    });
    expect(reviewed.ok).toBe(true);
    const published = await service.publish(identity, {
      definitionId: created.value.definition.id,
      expectedRevision: revision,
      acknowledgedWarningCodes: [],
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.version.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(published.value.version.status).toBe("published");
  });
});
