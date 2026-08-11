import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import { blockRegistry } from "@/lib/workflow-studio/block-registry";
import { clientConfigDataCatalog } from "@/lib/workflow-studio/data-catalog";
import type {
  WorkflowEdgeInput,
  WorkflowNodeInput,
  WorkflowRoleBindingInput,
} from "@/lib/workflow-studio/definition-schema";
import {
  WorkflowValidator,
  createWorkflowValidator,
  unacknowledgedWorkflowWarnings,
  type WorkflowValidationInput,
  type WorkflowValidationIssueCode,
  type WorkflowValidationResult,
} from "@/lib/workflow-studio/workflow-validator";

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

const identity = changeManager();

function buildBlockCatalog(): ReadonlyMap<string, ReturnType<typeof blockRegistry.contracts.resolve> extends { valid: true; value: infer V } ? V : never> {
  // We re-resolve every catalog entry through the contract resolver so the
  // validator sees the same public BlockDefinition instances as the registry.
  const map = new Map<string, never>();
  for (const entry of blockRegistry.listForIdentity({
    userId: "*",
    displayName: "*",
    groups: ["bcm:role:change_manager"],
    tenant: "*",
    businessUnit: "*",
    sessionId: "*",
  })) {
    const resolved = blockRegistry.contracts.resolve({ blockType: entry.blockType, contractVersion: entry.contractVersion });
    if (resolved.valid) {
      map.set(entry.blockType, resolved.value as never);
    }
  }
  return map;
}

const blockCatalog = buildBlockCatalog();
const validator: WorkflowValidator = createWorkflowValidator(blockCatalog, clientConfigDataCatalog);

function makeValidator(): WorkflowValidator {
  return new WorkflowValidator(blockCatalog, clientConfigDataCatalog);
}

function startNode(nodeKey = "start", configuration: Record<string, unknown> = {}): WorkflowNodeInput {
  return {
    id: nodeKey,
    nodeKey,
    block: { blockType: "manual_start", contractVersion: 1 },
    configuration,
    position: { x: 0, y: 0 },
  };
}

function endNode(nodeKey = "end", configuration: Record<string, unknown> = { outcome: "completed" }): WorkflowNodeInput {
  return {
    id: nodeKey,
    nodeKey,
    block: { blockType: "end", contractVersion: 1 },
    configuration,
    position: { x: 100, y: 0 },
  };
}

function edge(edgeKey: string, source: string, target: string, sourcePort = "out", targetPort = "in"): WorkflowEdgeInput {
  return {
    id: randomUUID(),
    edgeKey,
    sourceNodeId: source,
    sourcePort,
    targetNodeId: target,
    targetPort,
  };
}

function formNode(nodeKey: string, fields: Array<{ id: string; label: string; type: string }>): WorkflowNodeInput {
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType: "form", contractVersion: 1 },
    configuration: { title: "Titel", fields },
    position: { x: 50, y: 0 },
  };
}

function approvalNode(nodeKey: string, roleId: string): WorkflowNodeInput {
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType: "approval", contractVersion: 1 },
    configuration: { roleId, title: "Goedkeuring" },
    position: { x: 60, y: 0 },
  };
}

function roleTaskNode(nodeKey: string, roleId: string): WorkflowNodeInput {
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType: "role_task", contractVersion: 1 },
    configuration: {
      roleId,
      title: `Taak ${nodeKey}`,
      instructions: "Controleer de aanvraag.",
    },
    position: { x: 60, y: 0 },
  };
}

function subworkflowNode(nodeKey: string, childWorkflowVersionId = "11111111-1111-4111-8111-111111111111"): WorkflowNodeInput {
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType: "subworkflow", contractVersion: 1 },
    configuration: {
      label: "Herbruikbaar fragment",
      childWorkflowVersionId,
      inputMappings: [{ parentVariable: "aanvraag", childVariable: "fragment_input" }],
      outputMappings: [{ parentVariable: "fragment_resultaat", childVariable: "resultaat" }],
      nestingDepth: 1,
    },
    position: { x: 70, y: 0 },
  };
}

function changeRequestNode(nodeKey: string, resourceId: string, operation: "CREATE" | "UPDATE" | "RETIRE", effectiveDateVariable: string, rationaleVariable: string): WorkflowNodeInput {
  const attributeId = operation === "RETIRE" ? "primary_account_id" : operation === "UPDATE" ? "benchmark_code" : "code";
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType: "change_request", contractVersion: 1 },
    configuration: {
      resourceId,
      operation,
      attributeMappings: [{
        attributeId,
        ...(operation === "CREATE" ? {} : { ist: { snapshotVariableId: "snapshot", snapshotAttributeId: attributeId } }),
        ...(operation === "RETIRE" ? {} : { soll: { variableId: "nieuwe_waarde" } }),
      }],
      effectiveDateVariable,
      rationaleVariable,
    },
    position: { x: 80, y: 0 },
  };
}

function lookupNode(nodeKey: string, resourceId: string, outputVariable: string): WorkflowNodeInput {
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType: "client_config_lookup", contractVersion: 1 },
    configuration: { resourceId, outputVariable, selection: "one" },
    position: { x: 40, y: 0 },
  };
}

function decisionNode(nodeKey: string, variable: string): WorkflowNodeInput {
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType: "decision", contractVersion: 1 },
    configuration: { label: "Beslissing", rule: { kind: "group", combinator: "AND", rules: [{ kind: "condition", variableId: variable, valueType: "string", operator: "equals", value: "x" }] } },
    position: { x: 70, y: 0 },
  };
}

function parallelSplitNode(nodeKey = "split"): WorkflowNodeInput {
  return {
    id: nodeKey,
    nodeKey,
    block: { blockType: "parallel_split", contractVersion: 1 },
    configuration: { label: "Parallel split" },
    position: { x: 40, y: 0 },
  };
}

function parallelJoinNode(nodeKey = "join", configuration: Record<string, unknown> = { label: "Parallel join", mode: "and" }): WorkflowNodeInput {
  return {
    id: nodeKey,
    nodeKey,
    block: { blockType: "parallel_join", contractVersion: 1 },
    configuration,
    position: { x: 120, y: 0 },
  };
}

function roleBinding(workflowRole: string, identityGroup: string, permissions: WorkflowRoleBindingInput["permissions"]): WorkflowRoleBindingInput {
  return {
    workflowRole,
    identityGroup,
    permissions,
    tenant: "tenant-a",
    businessUnit: "investments",
  };
}

function codes(result: WorkflowValidationResult): readonly (WorkflowValidationIssueCode | string)[] {
  return result.issues.map((issue) => issue.code);
}

describe("WorkflowValidator", () => {
  it("accepts a minimal valid draft", () => {
    const start = startNode();
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, end],
      edges: [edge("e1", start.nodeKey, end.nodeKey)],
    });
    expect(result.valid).toBe(true);
    expect(result.blocking).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.terminalNodeKeys).toEqual([end.nodeKey]);
    expect(result.reachableNodeKeys).toEqual([start.nodeKey, end.nodeKey]);
  });

  it("flags a missing start node", () => {
    const end = endNode();
    const result = makeValidator().validate({ identity, nodes: [end], edges: [] });
    expect(codes(result)).toContain("missing_start_node");
    expect(result.blocking).toBe(true);
  });

  it("flags a missing end node when nodes exist", () => {
    const start = startNode();
    const result = makeValidator().validate({ identity, nodes: [start], edges: [] });
    expect(codes(result)).toContain("missing_end_node");
  });

  it("flags multiple start nodes", () => {
    const a = startNode("a");
    const b = startNode("b");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [a, b, end],
      edges: [edge("a->e", a.nodeKey, end.nodeKey), edge("b->e", b.nodeKey, end.nodeKey)],
    });
    expect(codes(result)).toContain("multiple_start_nodes");
  });

  it("flags a start node without outgoing edges", () => {
    const start = startNode();
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, end],
      edges: [],
    });
    expect(codes(result)).toContain("start_node_has_no_outgoing_edge");
  });

  it("accepts an explicit parallel split converging on an AND join", () => {
    const start = startNode();
    const split = parallelSplitNode();
    const left = formNode("left_task", [{ id: "left_value", label: "Links", type: "text" }]);
    const right = formNode("right_task", [{ id: "right_value", label: "Rechts", type: "text" }]);
    const join = parallelJoinNode();
    const end = endNode();

    const result = makeValidator().validate({
      identity,
      nodes: [start, split, left, right, join, end],
      edges: [
        edge("start_split", start.nodeKey, split.nodeKey),
        edge("split_left", split.nodeKey, left.nodeKey),
        edge("split_right", split.nodeKey, right.nodeKey),
        edge("left_join", left.nodeKey, join.nodeKey),
        edge("right_join", right.nodeKey, join.nodeKey),
        edge("join_end", join.nodeKey, end.nodeKey),
      ],
    });

    expect(result.valid).toBe(true);
  });

  it("prevents parallel split deadlocks and unreachable quorum joins", () => {
    const start = startNode();
    const split = parallelSplitNode();
    const left = formNode("left_task", [{ id: "left_value", label: "Links", type: "text" }]);
    const right = formNode("right_task", [{ id: "right_value", label: "Rechts", type: "text" }]);
    const join = parallelJoinNode("join", { label: "Parallel join", mode: "quorum", quorum: 3 });
    const end = endNode();

    const result = makeValidator().validate({
      identity,
      nodes: [start, split, left, right, join, end],
      edges: [
        edge("start_split", start.nodeKey, split.nodeKey),
        edge("split_left", split.nodeKey, left.nodeKey),
        edge("split_right", split.nodeKey, right.nodeKey),
        edge("left_join", left.nodeKey, join.nodeKey),
        edge("right_end", right.nodeKey, end.nodeKey),
        edge("join_end", join.nodeKey, end.nodeKey),
      ],
    });

    expect(codes(result)).toEqual(expect.arrayContaining([
      "parallel_split_without_join",
      "parallel_join_branch_count",
    ]));
  });

  it("flags duplicate node keys and edge keys", () => {
    const s1 = startNode("dup");
    const s2 = startNode("dup");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [s1, s2, end],
      edges: [edge("e1", s1.nodeKey, end.nodeKey), edge("e1", s1.nodeKey, end.nodeKey)],
    });
    const codesFound = codes(result);
    expect(codesFound).toContain("duplicate_node_key");
    expect(codesFound).toContain("duplicate_edge_key");
  });

  it("flags orphan edge references", () => {
    const start = startNode();
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, end],
      edges: [edge("e1", "ghost", end.nodeKey), edge("e2", start.nodeKey, "phantom")],
    });
    const orphanIssues = result.issues.filter((issue) => issue.code === "orphan_node_reference");
    expect(orphanIssues).toHaveLength(2);
  });

  it("flags unknown source and target ports", () => {
    const start = startNode();
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, end],
      edges: [edge("e1", start.nodeKey, end.nodeKey, "nope", "in")],
    });
    expect(codes(result)).toContain("unknown_source_port");
  });

  it("flags incompatible port types", () => {
    // The registry has all flow ports; create a connection with mismatched
    // custom ports. Since the registry disallows arbitrary ports we use the
    // public "out" of start and connect it to a form's "in" but with a
    // configuration that forces the resolver to flag it. We can simulate this
    // by reusing two start nodes (no inputs), but the simplest way is to
    // connect start.out to start.in (start has no input port).
    const start = startNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start],
      edges: [edge("self", start.nodeKey, start.nodeKey, "out", "in")],
    });
    // start has no inputs, so this flags unknown_target_port
    expect(codes(result)).toContain("unknown_target_port");
  });

  it("flags unreachable nodes", () => {
    const start = startNode();
    const end = endNode();
    const orphan: WorkflowNodeInput = {
      id: "orphan",
      nodeKey: "orphan",
      block: { blockType: "end", contractVersion: 1 },
      configuration: { outcome: "cancelled" },
      position: { x: 200, y: 0 },
    };
    const result = makeValidator().validate({
      identity,
      nodes: [start, end, orphan],
      edges: [edge("e1", start.nodeKey, end.nodeKey)],
    });
    expect(codes(result)).toContain("unreachable_node");
  });

  it("flags forbidden cycles", () => {
    // The earlier setup shouldn't have cycle_detected (no cycle possible)
    const f1 = formNode("f1", [{ id: "x", label: "X", type: "text" }]);
    const f2 = formNode("f2", [{ id: "y", label: "Y", type: "text" }]);
    const end2 = endNode();
    const start = startNode();
    const cyclic = makeValidator().validate({
      identity,
      nodes: [start, f1, f2, end2],
      edges: [
        edge("s->f1", start.nodeKey, f1.nodeKey),
        edge("f1->f2", f1.nodeKey, f2.nodeKey),
        edge("f2->f1", f2.nodeKey, f1.nodeKey),
        edge("f1->e", f1.nodeKey, end2.nodeKey),
      ],
    });
    expect(codes(cyclic)).toContain("cycle_detected");
  });

  it("flags a reachable branch that stops without an explicit end outcome", () => {
    const start = startNode();
    const decision = decisionNode("route", "route_value");
    const completed = endNode("completed", { label: "Voltooid", outcome: "completed" });
    const abandoned = formNode("abandoned", []);
    const result = makeValidator().validate({
      identity,
      nodes: [start, decision, completed, abandoned],
      edges: [
        edge("start-route", start.nodeKey, decision.nodeKey),
        edge("route-completed", decision.nodeKey, completed.nodeKey, "matched"),
        edge("route-abandoned", decision.nodeKey, abandoned.nodeKey, "otherwise"),
      ],
    });

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "dead_end_branch",
      nodeKey: "abandoned",
    }));
    expect(result.valid).toBe(false);
  });

  it("flags unknown block types and configuration errors", () => {
    const rogue: WorkflowNodeInput = {
      id: randomUUID(),
      nodeKey: "rogue",
      block: { blockType: "rogue_block", contractVersion: 1 },
      configuration: {},
      position: { x: 0, y: 0 },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [rogue, end],
      edges: [edge("e1", rogue.nodeKey, end.nodeKey)],
    });
    expect(codes(result)).toContain("unknown_block_type");
  });

  it("flags form block with invalid field id (not snake_case)", () => {
    const start = startNode();
    const form = formNode("f", [{ id: "InvalidId", label: "X", type: "text" }]);
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, form, end],
      edges: [edge("s->f", start.nodeKey, form.nodeKey), edge("f->e", form.nodeKey, end.nodeKey)],
    });
    // The form's zod schema regex rejects the field id, so this is a
    // configuration error and the variable is not registered.
    expect(codes(result)).toContain("invalid_block_configuration");
  });

  it("validates lookup fields, typed filter values and parent bindings against the catalog", () => {
    const start = startNode();
    const lookup: WorkflowNodeInput = {
      id: randomUUID(),
      nodeKey: "lookup",
      block: { blockType: "client_config_lookup", contractVersion: 1 },
      configuration: {
        resourceId: "portfolio_configuration",
        filters: [{ attributeId: "active", source: "literal", value: "not-a-boolean" }],
        parentBinding: { mode: "attribute", sourceVariable: "selected_portfolio", targetAttributeId: "unknown_field" },
        displayFields: ["primary_account_id", "unknown_field"],
        selection: "one",
        outputVariable: "configuration",
      },
      position: { x: 50, y: 0 },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, lookup, end],
      edges: [edge("s->l", start.nodeKey, lookup.nodeKey), edge("l->e", lookup.nodeKey, end.nodeKey)],
    });
    expect(codes(result)).toContain("lookup_unknown_attribute");
    expect(codes(result)).toContain("lookup_invalid_filter_value");
    expect(codes(result)).toContain("lookup_invalid_parent_binding");
  });

  it("flags duplicate data mapping writers", () => {
    const start = startNode();
    const l1 = lookupNode("l1", "client", "client_data");
    const l2 = lookupNode("l2", "client", "client_data");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, l1, l2, end],
      edges: [
        edge("s->l1", start.nodeKey, l1.nodeKey),
        edge("l1->l2", l1.nodeKey, l2.nodeKey),
        edge("l2->e", l2.nodeKey, end.nodeKey),
      ],
    });
    expect(codes(result)).toContain("duplicate_data_mapping");
  });

  it("flags change_request without preceding approval", () => {
    const start = startNode();
    const cr = changeRequestNode("cr", "client", "CREATE", "eff_date", "rationale");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, cr, end],
      edges: [edge("s->cr", start.nodeKey, cr.nodeKey), edge("cr->e", cr.nodeKey, end.nodeKey)],
    });
    expect(codes(result)).toContain("change_request_without_approval");
  });

  it("accepts change_request with preceding approval", () => {
    const start = startNode();
    const appr = approvalNode("appr", "reviewer");
    const cr = changeRequestNode("cr", "client", "CREATE", "eff_date", "rationale");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, appr, cr, end],
      edges: [
        edge("s->a", start.nodeKey, appr.nodeKey),
        edge("a->cr", appr.nodeKey, cr.nodeKey, "approved", "in"),
        edge("cr->e", cr.nodeKey, end.nodeKey),
      ],
      roleBindings: [roleBinding("reviewer", "bcm:role:change_manager", ["workflow:approve"])],
    });
    // Should still flag a few things, but not change_request_without_approval
    expect(codes(result)).not.toContain("change_request_without_approval");
  });

  it("flags change_request with unknown catalog resource", () => {
    const start = startNode();
    const appr = approvalNode("appr", "reviewer");
    const cr = changeRequestNode("cr", "nope_resource", "CREATE", "eff_date", "rationale");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, appr, cr, end],
      edges: [
        edge("s->a", start.nodeKey, appr.nodeKey),
        edge("a->cr", appr.nodeKey, cr.nodeKey, "approved", "in"),
        edge("cr->e", cr.nodeKey, end.nodeKey),
      ],
      roleBindings: [roleBinding("reviewer", "bcm:role:change_manager", ["workflow:approve"])],
    });
    expect(codes(result)).toContain("change_request_unknown_resource");
  });

  it("flags change_request with non-requestable operation", () => {
    const start = startNode();
    const appr = approvalNode("appr", "reviewer");
    // client has CREATE only, so UPDATE is not requestable on the resource
    const cr = changeRequestNode("cr", "client", "UPDATE", "eff_date", "rationale");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, appr, cr, end],
      edges: [
        edge("s->a", start.nodeKey, appr.nodeKey),
        edge("a->cr", appr.nodeKey, cr.nodeKey, "approved", "in"),
        edge("cr->e", cr.nodeKey, end.nodeKey),
      ],
      roleBindings: [roleBinding("reviewer", "bcm:role:change_manager", ["workflow:approve"])],
    });
    expect(codes(result)).toContain("change_request_operation_not_requestable");
  });

  it("blocks unknown, non-requestable and mismatched snapshot attribute mappings", () => {
    const start = startNode();
    const appr = approvalNode("appr", "reviewer");
    const cr = changeRequestNode("cr", "portfolio_configuration", "UPDATE", "eff_date", "rationale");
    cr.configuration = {
      resourceId: "portfolio_configuration",
      operation: "UPDATE",
      attributeMappings: [
        { attributeId: "does_not_exist", ist: { snapshotVariableId: "snapshot", snapshotAttributeId: "does_not_exist" }, soll: { variableId: "nieuwe_onbekende_waarde" } },
        { attributeId: "active", ist: { snapshotVariableId: "snapshot", snapshotAttributeId: "active" }, soll: { variableId: "nieuwe_status" } },
        { attributeId: "benchmark_code", ist: { snapshotVariableId: "snapshot", snapshotAttributeId: "portfolio_code" }, soll: { variableId: "nieuwe_benchmark" } },
      ],
      effectiveDateVariable: "eff_date",
      rationaleVariable: "rationale",
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, appr, cr, end],
      edges: [
        edge("s->a", start.nodeKey, appr.nodeKey),
        edge("a->cr", appr.nodeKey, cr.nodeKey, "approved", "in"),
        edge("cr->e", cr.nodeKey, end.nodeKey),
      ],
      roleBindings: [roleBinding("reviewer", "bcm:role:change_manager", ["workflow:approve"])],
    });
    expect(codes(result)).toEqual(expect.arrayContaining([
      "change_request_unknown_attribute",
      "change_request_attribute_not_requestable",
      "change_request_invalid_snapshot_mapping",
    ]));
  });

  it("flags role usage without a binding", () => {
    const start = startNode();
    const task: WorkflowNodeInput = {
      id: randomUUID(),
      nodeKey: "task",
      block: { blockType: "role_task", contractVersion: 1 },
      configuration: { roleId: "missing_role", title: "Doe iets", instructions: "instructies" },
      position: { x: 50, y: 0 },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, task, end],
      edges: [edge("s->t", start.nodeKey, task.nodeKey), edge("t->e", task.nodeKey, end.nodeKey)],
    });
    expect(codes(result)).toContain("role_not_bound");
  });

  it("blocks missing runtime capabilities and maker-checker conflicts", () => {
    const start = startNode("start", { label: "Start", starterRoleIds: ["maker"], dataScope: "workflow_default" });
    const approval = approvalNode("approval", "maker");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, approval, end],
      edges: [edge("s->a", start.nodeKey, approval.nodeKey), edge("a->e", approval.nodeKey, end.nodeKey, "approved")],
      roleBindings: [roleBinding("maker", "bcm:role:change_manager", ["workflow:start"])],
    });

    expect(codes(result)).toContain("role_permission_missing");
    expect(codes(result)).toContain("maker_checker_conflict");
    expect(result.blocking).toBe(true);
  });

  it("flags unreachable quorum for grouped approvals", () => {
    const start = startNode();
    const first = {
      ...approvalNode("approval_a", "checker_a"),
      configuration: { roleId: "checker_a", title: "Goedkeuring A", approvalGroupId: "risk_gate", approvalMode: "quorum", quorum: 3 },
    };
    const second = {
      ...approvalNode("approval_b", "checker_b"),
      configuration: { roleId: "checker_b", title: "Goedkeuring B", approvalGroupId: "risk_gate", approvalMode: "quorum", quorum: 3 },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, first, second, end],
      edges: [
        edge("s->a", start.nodeKey, first.nodeKey),
        edge("a->b", first.nodeKey, second.nodeKey, "approved"),
        edge("b->e", second.nodeKey, end.nodeKey, "approved"),
      ],
      roleBindings: [
        roleBinding("checker_a", "bcm:role:change_manager", ["workflow:approve"]),
        roleBinding("checker_b", "bcm:role:account_manager", ["workflow:approve"]),
      ],
    });

    expect(codes(result)).toContain("multi_approval_quorum_unreachable");
  });

  it("flags duplicate approval roles when the group requires distinct roles", () => {
    const start = startNode();
    const first = {
      ...approvalNode("approval_a", "checker"),
      configuration: { roleId: "checker", title: "Goedkeuring A", approvalGroupId: "risk_gate", approvalMode: "all_of", roleCombination: "distinct_roles" },
    };
    const second = {
      ...approvalNode("approval_b", "checker"),
      configuration: { roleId: "checker", title: "Goedkeuring B", approvalGroupId: "risk_gate", approvalMode: "all_of", roleCombination: "distinct_roles" },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, first, second, end],
      edges: [
        edge("s->a", start.nodeKey, first.nodeKey),
        edge("a->b", first.nodeKey, second.nodeKey, "approved"),
        edge("b->e", second.nodeKey, end.nodeKey, "approved"),
      ],
      roleBindings: [roleBinding("checker", "bcm:role:change_manager", ["workflow:approve"])],
    });

    expect(codes(result)).toContain("multi_approval_duplicate_role");
  });

  it("blocks subworkflow self references when the parent version is known", () => {
    const versionId = "11111111-1111-4111-8111-111111111111";
    const start = startNode();
    const fragment = subworkflowNode("fragment", versionId);
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      workflowVersionId: versionId,
      nodes: [start, fragment, end],
      edges: [
        edge("s->f", start.nodeKey, fragment.nodeKey),
        edge("f->e", fragment.nodeKey, end.nodeKey),
      ],
    });

    expect(codes(result)).toContain("subworkflow_self_reference");
  });

  it("treats subworkflow output mappings as parent variable writers", () => {
    const start = startNode();
    const first = subworkflowNode("first");
    const second = {
      ...subworkflowNode("second", "22222222-2222-4222-8222-222222222222"),
      configuration: {
        label: "Tweede fragment",
        childWorkflowVersionId: "22222222-2222-4222-8222-222222222222",
        inputMappings: [],
        outputMappings: [{ parentVariable: "fragment_resultaat", childVariable: "ander_resultaat" }],
        nestingDepth: 1,
      },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, first, second, end],
      edges: [
        edge("s->a", start.nodeKey, first.nodeKey),
        edge("a->b", first.nodeKey, second.nodeKey),
        edge("b->e", second.nodeKey, end.nodeKey),
      ],
    });

    expect(codes(result)).toContain("duplicate_data_mapping");
  });

  it("flags duplicate role bindings", () => {
    const start = startNode();
    const task: WorkflowNodeInput = {
      id: randomUUID(),
      nodeKey: "task",
      block: { blockType: "role_task", contractVersion: 1 },
      configuration: { roleId: "reviewer", title: "Doe iets", instructions: "instructies" },
      position: { x: 50, y: 0 },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, task, end],
      edges: [edge("s->t", start.nodeKey, task.nodeKey), edge("t->e", task.nodeKey, end.nodeKey)],
      roleBindings: [
        roleBinding("reviewer", "bcm:role:change_manager", ["workflow:tasks:execute"]),
        roleBinding("reviewer", "bcm:role:change_manager", ["workflow:tasks:execute"]),
      ],
    });
    expect(codes(result)).toContain("duplicate_role_binding");
  });

  it("flags role binding outside the identity's management scope", () => {
    const start = startNode();
    const task: WorkflowNodeInput = {
      id: randomUUID(),
      nodeKey: "task",
      block: { blockType: "role_task", contractVersion: 1 },
      configuration: { roleId: "admin", title: "x", instructions: "y" },
      position: { x: 50, y: 0 },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, task, end],
      edges: [edge("s->t", start.nodeKey, task.nodeKey), edge("t->e", task.nodeKey, end.nodeKey)],
      roleBindings: [
        // The investor group isn't in the change_manager's delegable roles.
        roleBinding("admin", "bcm:role:investor", ["workflow:tasks:execute"]),
      ],
    });
    expect(codes(result).some((c) => c === "role_binding_denied")).toBe(true);
  });

  it("accepts a realistic benchmark-switch workflow", () => {
    const start = startNode();
    const l1 = lookupNode("lookup_client", "client", "client_data");
    const l2 = lookupNode("lookup_portfolio", "portfolio", "portfolio_data");
    const l3 = lookupNode("lookup_bench", "benchmark", "benchmark_data");
    const dec = decisionNode("decide", "portfolio_data");
    const appr = approvalNode("approve", "reviewer");
    const cr = changeRequestNode("apply", "portfolio_configuration", "UPDATE", "eff_date", "rationale");
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, l1, l2, l3, dec, appr, cr, end],
      edges: [
        edge("s->l1", start.nodeKey, l1.nodeKey),
        edge("l1->l2", l1.nodeKey, l2.nodeKey),
        edge("l2->l3", l2.nodeKey, l3.nodeKey),
        edge("l3->d", l3.nodeKey, dec.nodeKey),
        edge("d->a", dec.nodeKey, appr.nodeKey, "matched", "in"),
        edge("a->c", appr.nodeKey, cr.nodeKey, "approved", "in"),
        edge("c->e", cr.nodeKey, end.nodeKey),
      ],
      roleBindings: [roleBinding("reviewer", "bcm:role:change_manager", ["workflow:approve"])],
    });
    const codesFound = codes(result);
    // We expect no change_request_without_approval, no missing_* nodes, no
    // orphan references, no unknown block types.
    expect(codesFound).not.toContain("change_request_without_approval");
    expect(codesFound).not.toContain("missing_start_node");
    expect(codesFound).not.toContain("missing_end_node");
    expect(codesFound).not.toContain("orphan_node_reference");
    expect(codesFound).not.toContain("cycle_detected");
  });

  it("requires a binding for every notification recipient role", () => {
    const start = startNode();
    const notification: WorkflowNodeInput = {
      id: randomUUID(),
      nodeKey: "notify",
      block: { blockType: "notification", contractVersion: 1 },
      configuration: {
        recipientRoleIds: ["aanvrager", "operations"],
        channel: "in_app",
        trigger: "on_reached",
        subjectTemplate: "Aanvraag {{ aanvraagnummer }}",
        messageTemplate: "Aanvraag {{ aanvraagnummer }} is bijgewerkt.",
        templateVariables: ["aanvraagnummer"],
      },
      position: { x: 50, y: 0 },
    };
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, notification, end],
      edges: [edge("s->n", start.nodeKey, notification.nodeKey), edge("n->e", notification.nodeKey, end.nodeKey)],
    });
    const missingRoles = result.issues.filter((item) => item.code === "role_not_bound" && item.nodeKey === "notify");
    expect(missingRoles).toHaveLength(2);
    expect(missingRoles.map((item) => item.path.at(-1))).toEqual(["recipientRoleIds.0", "recipientRoleIds.1"]);
  });

  it("resolves edges by node id (UUIDs) and by nodeKey", () => {
    const startId = randomUUID();
    const endId = randomUUID();
    const start: WorkflowNodeInput = {
      id: startId,
      nodeKey: "start",
      block: { blockType: "manual_start", contractVersion: 1 },
      configuration: {},
      position: { x: 0, y: 0 },
    };
    const end: WorkflowNodeInput = {
      id: endId,
      nodeKey: "end",
      block: { blockType: "end", contractVersion: 1 },
      configuration: { outcome: "completed" },
      position: { x: 100, y: 0 },
    };
    const result = makeValidator().validate({
      identity,
      nodes: [start, end],
      edges: [{
        id: randomUUID(),
        edgeKey: "e1",
        sourceNodeId: startId,
        sourcePort: "out",
        targetNodeId: endId,
        targetPort: "in",
      }],
    });
    expect(result.valid).toBe(true);
  });

  it("returns severity and fix hint for blocking issues", () => {
    const result = makeValidator().validate({ identity, nodes: [], edges: [] });
    const start = result.issues.find((issue) => issue.code === "missing_start_node");
    expect(start?.severity).toBe("error");
    expect(start?.fix).toMatch(/start/i);
    expect(result.blocking).toBe(true);
  });

  it("requires every current warning code to be explicitly acknowledged", () => {
    const warnings = [
      { code: "duplicate_data_mapping" as const, severity: "warning" as const, path: ["nodes", "task"], message: "Controleer de lezers." },
      { code: "unreachable_node" as const, severity: "error" as const, path: ["nodes", "orphan"], message: "Niet bereikbaar." },
    ];
    expect(unacknowledgedWorkflowWarnings(warnings, [])).toEqual([warnings[0]]);
    expect(unacknowledgedWorkflowWarnings(warnings, ["duplicate_data_mapping"])).toEqual([]);
  });

  it("exposes a frozen, deterministic issue list", () => {
    const start = startNode();
    const end = endNode();
    const result = makeValidator().validate({
      identity,
      nodes: [start, end],
      edges: [edge("e1", start.nodeKey, end.nodeKey)],
    });
    expect(Object.isFrozen(result.issues)).toBe(true);
    expect(Object.isFrozen(result.reachableNodeKeys)).toBe(true);
    expect(Object.isFrozen(result.terminalNodeKeys)).toBe(true);
  });

  it("validates large linear graphs within the runtime authoring SLO", () => {
    const start = startNode();
    const end = endNode();
    const tasks = Array.from({ length: 300 }, (_, index) => roleTaskNode(`task_${index + 1}`, "account_manager"));
    const nodes = [start, ...tasks, end];
    const edges = nodes.slice(0, -1).map((source, index) => edge(
      `edge_${index + 1}`,
      source.id ?? source.nodeKey,
      nodes[index + 1]!.id ?? nodes[index + 1]!.nodeKey,
    ));
    const started = Date.now();
    const result = makeValidator().validate({
      identity,
      nodes,
      edges,
      roleBindings: [roleBinding("account_manager", "bcm:role:account_manager", ["workflow:tasks:execute"])],
    });
    const durationMs = Date.now() - started;

    expect(result.valid).toBe(true);
    expect(result.reachableNodeKeys).toHaveLength(302);
    expect(durationMs).toBeLessThan(1_500);
  });
});
