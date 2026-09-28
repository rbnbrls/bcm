import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { evaluateWorkflowGovernancePolicies } from "@/lib/workflow-studio/governance-policies";
import type { WorkflowEdgeInput, WorkflowNodeInput, WorkflowRoleBindingInput } from "@/lib/workflow-studio/definition-schema";

function node(nodeKey: string, blockType: string, configuration: Record<string, unknown> = {}): WorkflowNodeInput {
  return {
    id: randomUUID(),
    nodeKey,
    block: { blockType, contractVersion: 1 },
    configuration,
    position: { x: 0, y: 0 },
  };
}

function edge(source: WorkflowNodeInput, target: WorkflowNodeInput, sourcePort = "out"): WorkflowEdgeInput {
  return {
    id: randomUUID(),
    edgeKey: `${source.nodeKey}_to_${target.nodeKey}`,
    sourceNodeId: source.id!,
    sourcePort,
    targetNodeId: target.id!,
    targetPort: "in",
  };
}

function binding(workflowRole: string, permissions: WorkflowRoleBindingInput["permissions"]): WorkflowRoleBindingInput {
  return {
    workflowRole,
    identityGroup: `bcm:role:${workflowRole}`,
    permissions,
    tenant: "tenant-a",
    businessUnit: "investments",
  };
}

const approvalConfig = (overrides: Record<string, unknown> = {}) => ({
  roleId: "account_manager",
  title: "Goedkeuren",
  requireCommentOnApprove: true,
  requireCommentOnReject: true,
  requireCommentOnReturn: true,
  ...overrides,
});

const changeConfig = {
  resourceId: "portfolio_configuration",
  operation: "UPDATE",
  attributeMappings: [{
    attributeId: "portfolio_code",
    ist: { snapshotVariableId: "huidige_config", snapshotAttributeId: "portfolio_code" },
    soll: { variableId: "nieuw_portfolio" },
  }],
  effectiveDateVariable: "effective_date",
  rationaleVariable: "rationale",
};

describe("workflow governance policies", () => {
  it("accepts mutation workflows with separated starter and approval roles plus audit comments", () => {
    const start = node("start", "manual_start", { starterRoleIds: ["change_manager"] });
    const approval = node("approval", "approval", approvalConfig());
    const change = node("change", "change_request", changeConfig);
    const end = node("end", "end");

    const result = evaluateWorkflowGovernancePolicies({
      nodes: [start, approval, change, end],
      edges: [edge(start, approval), edge(approval, change, "approved"), edge(change, end)],
      roleBindings: [
        binding("change_manager", ["workflow:start"]),
        binding("account_manager", ["workflow:approve"]),
      ],
    });

    expect(result).toEqual({ passed: true, issues: [] });
  });

  it("flags missing mutation approval and missing audit comments", () => {
    const start = node("start", "manual_start", { starterRoleIds: ["change_manager"] });
    const approval = node("approval", "approval", approvalConfig({ requireCommentOnApprove: false, requireCommentOnReject: false }));
    const change = node("change", "change_request", changeConfig);

    const result = evaluateWorkflowGovernancePolicies({
      nodes: [start, approval, change],
      edges: [edge(start, approval), edge(start, change)],
      roleBindings: [],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "minimum_audit_fields_missing",
      "mutation_approval_required",
    ]));
  });

  it("flags forbidden role combinations and four-eyes violations even if the draft tries to opt out", () => {
    const start = node("start", "manual_start", { starterRoleIds: ["change_manager"], governancePolicies: { disabled: true } });
    const approval = node("approval", "approval", approvalConfig({ roleId: "change_manager" }));

    const result = evaluateWorkflowGovernancePolicies({
      nodes: [start, approval],
      edges: [edge(start, approval)],
      roleBindings: [binding("change_manager", ["workflow:start", "workflow:approve"])],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "forbidden_role_combination",
      "mandatory_four_eyes_required",
    ]));
  });

  it("requires review and signing for non-sandbox integrations", () => {
    const start = node("start", "manual_start", { starterRoleIds: ["change_manager"] });
    const integration = node("sync", "integration", {
      connectorId: "servicenow.create_ticket.v1",
      connectorVersion: 1,
      operation: "ticket.create",
      inputSchemaVersion: 1,
      outputSchemaVersion: 1,
      inputVariables: [],
      secretRefs: [],
      timeoutMs: 30_000,
      retryPolicy: { maxAttempts: 3, backoff: "exponential" },
      signing: { mode: "none" },
      sandboxMode: false,
    });

    const result = evaluateWorkflowGovernancePolicies({
      nodes: [start, integration],
      edges: [edge(start, integration)],
      roleBindings: [],
    });

    expect(result).toMatchObject({ passed: false });
    expect(result.issues.map((issue) => issue.code)).toContain("integration_review_required");
  });
});
