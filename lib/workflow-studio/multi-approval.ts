import type {
  WorkflowApprovalAggregationMode,
  WorkflowApprovalDecision,
  WorkflowApprovalRoleCombination,
} from "@/lib/workflow-studio/runtime-human-schema";

export type WorkflowApprovalParticipant = Readonly<{
  nodeKey: string;
  workflowRole: string;
}>;

export type WorkflowApprovalPolicy = Readonly<{
  approvalGroupId: string;
  mode: WorkflowApprovalAggregationMode;
  quorum?: number;
  uniqueApprovers: boolean;
  roleCombination: WorkflowApprovalRoleCombination;
  escalationHours?: number;
  participants: readonly WorkflowApprovalParticipant[];
}>;

export type WorkflowApprovalVote = Readonly<{
  nodeKey: string;
  taskId: string;
  workflowRole: string;
  decidedByUserId: string;
  decision: WorkflowApprovalDecision;
  occurredAt: string;
}>;

export type WorkflowApprovalAggregateStatus = "pending" | "approved" | "rejected" | "returned" | "invalid";

export type WorkflowApprovalPolicyEvaluation = Readonly<{
  status: WorkflowApprovalAggregateStatus;
  approvalGroupId: string;
  mode: WorkflowApprovalAggregationMode;
  requiredCount: number;
  participantCount: number;
  decidedCount: number;
  approvedCount: number;
  rejectedCount: number;
  returnedCount: number;
  pendingNodeKeys: readonly string[];
  blockingReasons: readonly string[];
  votes: readonly WorkflowApprovalVote[];
  auditPayload: Readonly<Record<string, unknown>>;
}>;

function compareVote(left: WorkflowApprovalVote, right: WorkflowApprovalVote): number {
  return left.occurredAt.localeCompare(right.occurredAt)
    || left.nodeKey.localeCompare(right.nodeKey)
    || left.taskId.localeCompare(right.taskId);
}

function requiredCount(policy: WorkflowApprovalPolicy): number {
  switch (policy.mode) {
    case "any_of":
      return 1;
    case "quorum":
      return policy.quorum ?? policy.participants.length;
    case "all_of":
    case "sequential":
      return policy.participants.length;
  }
}

export function evaluateWorkflowApprovalPolicy(
  policy: WorkflowApprovalPolicy,
  votes: readonly WorkflowApprovalVote[],
): WorkflowApprovalPolicyEvaluation {
  const participantKeys = new Set(policy.participants.map((participant) => participant.nodeKey));
  const normalizedVotes = [...votes]
    .filter((vote) => participantKeys.has(vote.nodeKey))
    .sort(compareVote);
  const firstVoteByNode = new Map<string, WorkflowApprovalVote>();
  for (const vote of normalizedVotes) {
    if (!firstVoteByNode.has(vote.nodeKey)) firstVoteByNode.set(vote.nodeKey, vote);
  }
  const effectiveVotes = [...firstVoteByNode.values()].sort(compareVote);
  const pendingNodeKeys = policy.participants
    .map((participant) => participant.nodeKey)
    .filter((nodeKey) => !firstVoteByNode.has(nodeKey))
    .sort();
  const approvedCount = effectiveVotes.filter((vote) => vote.decision === "approved").length;
  const rejectedCount = effectiveVotes.filter((vote) => vote.decision === "rejected").length;
  const returnedCount = effectiveVotes.filter((vote) => vote.decision === "returned").length;
  const required = requiredCount(policy);
  const blockingReasons: string[] = [];

  if (policy.mode === "quorum" && required > policy.participants.length) {
    blockingReasons.push("quorum_unreachable");
  }
  if (policy.uniqueApprovers) {
    const seen = new Set<string>();
    for (const vote of effectiveVotes) {
      if (seen.has(vote.decidedByUserId)) blockingReasons.push("duplicate_approver");
      seen.add(vote.decidedByUserId);
    }
  }
  if (policy.roleCombination === "distinct_roles") {
    const seen = new Set<string>();
    for (const participant of policy.participants) {
      if (seen.has(participant.workflowRole)) blockingReasons.push("duplicate_role");
      seen.add(participant.workflowRole);
    }
  }

  let status: WorkflowApprovalAggregateStatus = "pending";
  if (blockingReasons.length > 0) {
    status = "invalid";
  } else if (returnedCount > 0) {
    status = "returned";
  } else if (policy.mode === "any_of") {
    if (approvedCount >= 1) status = "approved";
    else if (effectiveVotes.length === policy.participants.length && rejectedCount > 0) status = "rejected";
  } else if (policy.mode === "quorum") {
    if (approvedCount >= required) status = "approved";
    else if (effectiveVotes.length === policy.participants.length) status = "rejected";
  } else if (rejectedCount > 0) {
    status = "rejected";
  } else if (approvedCount === policy.participants.length) {
    status = "approved";
  }

  const dedupedBlockingReasons = [...new Set(blockingReasons)].sort();
  return Object.freeze({
    status,
    approvalGroupId: policy.approvalGroupId,
    mode: policy.mode,
    requiredCount: required,
    participantCount: policy.participants.length,
    decidedCount: effectiveVotes.length,
    approvedCount,
    rejectedCount,
    returnedCount,
    pendingNodeKeys: Object.freeze(pendingNodeKeys),
    blockingReasons: Object.freeze(dedupedBlockingReasons),
    votes: Object.freeze(effectiveVotes),
    auditPayload: Object.freeze({
      approvalGroupId: policy.approvalGroupId,
      mode: policy.mode,
      requiredCount: required,
      participantCount: policy.participants.length,
      decidedCount: effectiveVotes.length,
      approvedCount,
      rejectedCount,
      returnedCount,
      pendingNodeKeys,
      blockingReasons: dedupedBlockingReasons,
      status,
      votes: effectiveVotes.map((vote) => ({
        nodeKey: vote.nodeKey,
        taskId: vote.taskId,
        workflowRole: vote.workflowRole,
        decidedByUserId: vote.decidedByUserId,
        decision: vote.decision,
        occurredAt: vote.occurredAt,
      })),
    }),
  });
}
