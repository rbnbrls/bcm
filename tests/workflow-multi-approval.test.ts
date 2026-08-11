import { describe, expect, it } from "vitest";

import { evaluateWorkflowApprovalPolicy, type WorkflowApprovalPolicy, type WorkflowApprovalVote } from "@/lib/workflow-studio";

const policy = (overrides: Partial<WorkflowApprovalPolicy> = {}): WorkflowApprovalPolicy => ({
  approvalGroupId: "group_a",
  mode: "all_of",
  uniqueApprovers: true,
  roleCombination: "distinct_roles",
  participants: [
    { nodeKey: "approval_a", workflowRole: "checker_a" },
    { nodeKey: "approval_b", workflowRole: "checker_b" },
  ],
  ...overrides,
});

const vote = (overrides: Partial<WorkflowApprovalVote>): WorkflowApprovalVote => ({
  nodeKey: "approval_a",
  taskId: "task-a",
  workflowRole: "checker_a",
  decidedByUserId: "user-a",
  decision: "approved",
  occurredAt: "2026-08-11T10:00:00.000Z",
  ...overrides,
});

describe("workflow multi-approval policy evaluation", () => {
  it("requires every participant for all-of approvals", () => {
    expect(evaluateWorkflowApprovalPolicy(policy(), [
      vote({ nodeKey: "approval_a", taskId: "task-a", workflowRole: "checker_a" }),
    ])).toMatchObject({ status: "pending", approvedCount: 1, requiredCount: 2, pendingNodeKeys: ["approval_b"] });

    expect(evaluateWorkflowApprovalPolicy(policy(), [
      vote({ nodeKey: "approval_b", taskId: "task-b", workflowRole: "checker_b", decidedByUserId: "user-b" }),
      vote({ nodeKey: "approval_a", taskId: "task-a", workflowRole: "checker_a", decidedByUserId: "user-a" }),
    ])).toMatchObject({ status: "approved", approvedCount: 2, requiredCount: 2, pendingNodeKeys: [] });
  });

  it("accepts the first approval for any-of policies", () => {
    const result = evaluateWorkflowApprovalPolicy(policy({ mode: "any_of" }), [
      vote({ nodeKey: "approval_b", taskId: "task-b", workflowRole: "checker_b", decidedByUserId: "user-b" }),
    ]);

    expect(result).toMatchObject({ status: "approved", approvedCount: 1, requiredCount: 1 });
  });

  it("keeps quorum counts deterministic and rejects duplicate approvers", () => {
    const result = evaluateWorkflowApprovalPolicy(policy({
      mode: "quorum",
      quorum: 2,
      participants: [
        { nodeKey: "approval_a", workflowRole: "checker_a" },
        { nodeKey: "approval_b", workflowRole: "checker_b" },
        { nodeKey: "approval_c", workflowRole: "checker_c" },
      ],
    }), [
      vote({ nodeKey: "approval_c", taskId: "task-c", workflowRole: "checker_c", decidedByUserId: "user-a", occurredAt: "2026-08-11T10:03:00.000Z" }),
      vote({ nodeKey: "approval_a", taskId: "task-a", workflowRole: "checker_a", decidedByUserId: "user-a", occurredAt: "2026-08-11T10:01:00.000Z" }),
      vote({ nodeKey: "approval_b", taskId: "task-b", workflowRole: "checker_b", decidedByUserId: "user-b", occurredAt: "2026-08-11T10:02:00.000Z" }),
    ]);

    expect(result.status).toBe("invalid");
    expect(result.blockingReasons).toEqual(["duplicate_approver"]);
    expect(result.votes.map((item) => item.nodeKey)).toEqual(["approval_a", "approval_b", "approval_c"]);
  });
});
