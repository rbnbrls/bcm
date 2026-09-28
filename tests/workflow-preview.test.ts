import { describe, expect, it } from "vitest";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { buildWorkflowPreviewModel } from "@/lib/workflow-studio/workflow-preview";

const metadata = {
  name: "Portfoliowijziging",
  description: "Wijzig een portfolio.",
  catalogDescription: "Vraag een gecontroleerde portfoliowijziging aan.",
  costModel: { baseCost: 25, perItemCost: 3, currency: "EUR", description: "Behandeling" },
};

function node(id: string, blockType: string, configuration: unknown, label = blockType): WorkflowEditorNode {
  return { id, nodeKey: id, blockType, contractVersion: 1, label, description: `${label} uitleg`, configuration, position: { x: 0, y: 0 } };
}

function edge(sourceNodeId: string, targetNodeId: string, sourcePort = "out"): WorkflowEditorEdge {
  return { id: `${sourceNodeId}-${targetNodeId}`, edgeKey: `${sourceNodeId}_${targetNodeId}`, sourceNodeId, sourcePort, targetNodeId, targetPort: "in" };
}

describe("workflow live preview model", () => {
  it("derives form, roles, SLA and process order from the current draft", () => {
    const nodes = [
      node("start", "manual_start", { label: "Start", starterRoleIds: ["aanvrager"] }),
      node("form", "form", { title: "Aanvraag", description: "Vul uw wijziging in.", fields: [{ id: "naam", label: "Naam", type: "text", required: true }] }),
      node("task", "role_task", { roleId: "uitvoerder", title: "Controle", instructions: "Controleer de aanvraag.", inputVariables: [], outputVariables: [], deadlineHours: 48 }),
      node("end", "end", { label: "Klaar", outcome: "completed" }),
    ];
    const preview = buildWorkflowPreviewModel({
      metadata,
      nodes: [nodes[2]!, nodes[3]!, nodes[0]!, nodes[1]!],
      edges: [edge("start", "form"), edge("form", "task"), edge("task", "end")],
      roleBindings: [{ workflowRole: "uitvoerder", identityGroup: "bcm:operations" }],
    });

    expect(preview.forms[0]?.configuration.title).toBe("Aanvraag");
    expect(preview.steps.map((step) => step.nodeId)).toEqual(["start", "form", "task", "end"]);
    expect(preview.slaHours).toBe(48);
    expect(preview.roles).toEqual([
      { id: "aanvrager", contexts: ["Mag aanvragen"], identityGroups: [] },
      { id: "uitvoerder", contexts: ["Voert taak uit"], identityGroups: ["bcm:operations"] },
    ]);
    expect(preview.incompleteSections).toEqual([]);
  });

  it("uses the longest branch as indicative workflow SLA", () => {
    const nodes = [
      node("start", "manual_start", { starterRoleIds: ["aanvrager"] }),
      node("quick", "role_task", { roleId: "a", title: "Kort", instructions: "Kort", inputVariables: [], outputVariables: [], deadlineHours: 8 }),
      node("slow", "role_task", { roleId: "b", title: "Lang", instructions: "Lang", inputVariables: [], outputVariables: [], deadlineHours: 72 }),
    ];
    const preview = buildWorkflowPreviewModel({ metadata, nodes, edges: [edge("start", "quick", "yes"), edge("start", "slow", "no")] });
    expect(preview.slaHours).toBe(72);
    expect(preview.steps[0]?.branches).toEqual(["yes", "no"]);
  });

  it("maps change-request attributes to readable IST/SOLL values", () => {
    const preview = buildWorkflowPreviewModel({
      metadata,
      nodes: [node("change", "change_request", {
        resourceId: "portfolio_configuration",
        operation: "UPDATE",
        attributeMappings: [{
          attributeId: "portfolio_code",
          ist: { snapshotVariableId: "huidige_config", snapshotAttributeId: "portfolio_code" },
          soll: { variableId: "nieuw_portfolio" },
        }],
        effectiveDateVariable: "ingangsdatum",
        rationaleVariable: "reden",
      }, "Portfolio aanpassen")],
      edges: [],
      changeRequestCatalog: [{
        id: "portfolio_configuration",
        label: "Portfolioconfiguratie",
        description: "Portfolio",
        authorizationScope: "client",
        identityAttributeId: "id",
        attributes: [{ id: "portfolio_code", label: "Portfoliocode", description: "Code", valueType: "string", authorizationScope: "client", requestableOperations: ["UPDATE"] }],
      }],
    });
    expect(preview.changes[0]).toMatchObject({
      resource: "Portfolioconfiguratie",
      operation: "UPDATE",
      mappings: [{ attribute: "Portfoliocode", ist: "huidige_config.portfolio_code", soll: "nieuw_portfolio" }],
    });
  });
});
