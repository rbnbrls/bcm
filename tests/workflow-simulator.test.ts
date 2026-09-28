import { describe, expect, it } from "vitest";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { collectWorkflowSimulationControls, simulateWorkflowPath } from "@/lib/workflow-studio/workflow-simulator";

function node(id: string, blockType: string, configuration: unknown): WorkflowEditorNode {
  return { id, nodeKey: id, blockType, contractVersion: 1, label: id, description: `${id} uitleg`, configuration, position: { x: 0, y: 0 } };
}

function edge(sourceNodeId: string, sourcePort: string, targetNodeId: string): WorkflowEditorEdge {
  return { id: `${sourceNodeId}-${sourcePort}-${targetNodeId}`, edgeKey: `${sourceNodeId}_${sourcePort}_${targetNodeId}`, sourceNodeId, sourcePort, targetNodeId, targetPort: "in" };
}

const nodes: WorkflowEditorNode[] = [
  node("start", "manual_start", { label: "Start", starterRoleIds: ["aanvrager"], dataScope: "workflow_default" }),
  node("form", "form", { title: "Aanvraag", fields: [
    { id: "bedrag", label: "Bedrag", type: "number", required: true },
    { id: "nieuw_portfolio", label: "Nieuw portfolio", type: "text", required: true },
    { id: "ingangsdatum", label: "Ingangsdatum", type: "date", required: true },
    { id: "reden", label: "Reden", type: "text", required: true },
  ] }),
  node("decision", "decision", { label: "Materieel?", rule: { kind: "condition", variableId: "bedrag", valueType: "number", operator: "greater_than", value: 100 } }),
  node("approval", "approval", { roleId: "goedkeurder", title: "Goedkeuren", inputVariables: ["bedrag"], decisionLabels: { approved: "Akkoord", rejected: "Afwijzen", returned: "Terug" }, requireCommentOnApprove: false, requireCommentOnReject: true, requireCommentOnReturn: true }),
  node("lookup", "client_config_lookup", { resourceId: "portfolio_configuration", filters: [], displayFields: ["portfolio_code"], outputVariable: "huidige_config", selection: "one" }),
  node("change", "change_request", { resourceId: "portfolio_configuration", operation: "UPDATE", attributeMappings: [{ attributeId: "portfolio_code", ist: { snapshotVariableId: "huidige_config", snapshotAttributeId: "portfolio_code" }, soll: { variableId: "nieuw_portfolio" } }], effectiveDateVariable: "ingangsdatum", rationaleVariable: "reden" }),
  node("notification", "notification", { recipientRoleIds: ["aanvrager"], channel: "in_app", trigger: "on_reached", subjectTemplate: "Aanvraag {{ reden }}", messageTemplate: "Reden: {{ reden }}", templateVariables: ["reden"] }),
  node("end", "end", { label: "Klaar", outcome: "completed" }),
];

const edges: WorkflowEditorEdge[] = [
  edge("start", "out", "form"),
  edge("form", "out", "decision"),
  edge("decision", "matched", "approval"),
  edge("decision", "otherwise", "end"),
  edge("approval", "approved", "lookup"),
  edge("approval", "rejected", "end"),
  edge("approval", "returned", "end"),
  edge("lookup", "out", "change"),
  edge("change", "out", "notification"),
  edge("notification", "out", "end"),
];

describe("workflow path simulator", () => {
  it("executes the selected path without side effects and explains decisions and intents", () => {
    const result = simulateWorkflowPath(nodes, edges, {
      variables: { bedrag: 250, nieuw_portfolio: "GROWTH", ingangsdatum: "2026-09-01", reden: "Herweging" },
      taskOutcomes: { approval: { outcome: "approved" } },
      lookupFixtures: { lookup: { portfolio_code: "BALANCED", client_name: "***" } },
    });

    expect(result.status).toBe("completed");
    expect(result.visitedNodeKeys).toEqual(["start", "form", "decision", "approval", "lookup", "change", "notification", "end"]);
    expect(result.variables.huidige_config).toEqual({ portfolio_code: "BALANCED", client_name: "***" });
    expect(result.decisions[0]).toMatchObject({ nodeKey: "decision", matched: true, outputPort: "matched" });
    expect(result.decisions[0]?.explanation).toContain("bedrag (number) greater_than 100 → waar");
    expect(result.intents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "change_request",
        operation: "UPDATE",
        attributes: [{ attributeId: "portfolio_code", ist: "BALANCED", soll: "GROWTH" }],
      }),
      expect.objectContaining({ kind: "notification", channel: "in_app", subject: "Aanvraag Herweging" }),
    ]));
    expect(result.auditEvents.map((event) => event.type)).toEqual(expect.arrayContaining(["simulation.started", "decision.evaluated", "intent.planned", "notification.planned", "workflow.completed"]));
  });

  it("takes the otherwise branch from the same draft for different fixtures", () => {
    const result = simulateWorkflowPath(nodes, edges, { variables: { bedrag: 50, nieuw_portfolio: "GROWTH", ingangsdatum: "2026-09-01", reden: "Klein" } });
    expect(result.status).toBe("completed");
    expect(result.visitedNodeKeys).toEqual(["start", "form", "decision", "end"]);
    expect(result.decisions[0]).toMatchObject({ matched: false, outputPort: "otherwise" });
    expect(result.intents).toEqual([]);
  });

  it("derives form, task, approval, lookup and otherwise-unwritten variable controls", () => {
    const task = node("task", "role_task", { title: "Uitwerken", outputVariables: ["resultaat"] });
    const extended = [...nodes, task];
    const controls = collectWorkflowSimulationControls(extended);
    expect(controls.formFields.map(({ field }) => field.id)).toEqual(["bedrag", "nieuw_portfolio", "ingangsdatum", "reden"]);
    expect(controls.tasks).toContainEqual({ nodeKey: "task", title: "Uitwerken", outputVariables: ["resultaat"] });
    expect(controls.approvals[0]).toMatchObject({ nodeKey: "approval", labels: { approved: "Akkoord" } });
    expect(controls.lookups).toEqual([{ nodeKey: "lookup", outputVariable: "huidige_config", selection: "one" }]);
    expect(controls.additionalVariables).toEqual([]);
  });

  it("stops safely on invalid typed decision fixtures", () => {
    const decisionNodes = [nodes[0]!, nodes[2]!, nodes[7]!];
    const result = simulateWorkflowPath(decisionNodes, [
      edge("start", "out", "decision"),
      edge("decision", "matched", "end"),
      edge("decision", "otherwise", "end"),
    ], { variables: { bedrag: "veel" } });
    expect(result.status).toBe("invalid");
    expect(result.visitedNodeKeys.at(-1)).toBe("decision");
    expect(result.issues[0]).toContain("niet van type number");
  });

  it("validates form and lookup fixtures before using them", () => {
    const invalidForm = simulateWorkflowPath(nodes, edges, { variables: { bedrag: 250 } });
    expect(invalidForm.status).toBe("invalid");
    expect(invalidForm.visitedNodeKeys.at(-1)).toBe("form");
    expect(invalidForm.auditEvents.at(-1)?.type).toBe("form.invalid");

    const invalidLookup = simulateWorkflowPath(nodes, edges, {
      variables: { bedrag: 250, nieuw_portfolio: "GROWTH", ingangsdatum: "2026-09-01", reden: "Test" },
      taskOutcomes: { approval: { outcome: "approved" } },
      lookupFixtures: { lookup: [] },
    });
    expect(invalidLookup.status).toBe("invalid");
    expect(invalidLookup.issues.at(-1)).toContain("moet een object zijn");
  });

  it("accepts only output variables declared by a role task", () => {
    const taskNodes = [
      node("task-start", "manual_start", {}),
      node("task", "role_task", { outputVariables: ["resultaat"] }),
      node("task-end", "end", { outcome: "completed" }),
    ];
    const result = simulateWorkflowPath(taskNodes, [edge("task-start", "out", "task"), edge("task", "out", "task-end")], {
      taskOutcomes: { task: { outputs: { resultaat: "ok", niet_gedeclareerd: "injectie" } } },
    });
    expect(result.status).toBe("completed");
    expect(result.variables).toEqual({ resultaat: "ok" });
  });
});
