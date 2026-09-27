import { workflowChangeRequestConfigurationSchema } from "@/lib/workflow-studio/change-request-schema";
import type { WorkflowEdgeInput, WorkflowNodeInput, WorkflowRoleBindingInput } from "@/lib/workflow-studio/definition-schema";
import { workflowIntegrationConfigurationSchema } from "@/lib/workflow-studio/integration-schema";
import { workflowApprovalConfigurationSchema } from "@/lib/workflow-studio/runtime-human-schema";

export type WorkflowGovernancePolicyCode =
  | "mandatory_four_eyes_required"
  | "forbidden_role_combination"
  | "minimum_audit_fields_missing"
  | "integration_review_required"
  | "mutation_approval_required";

export type WorkflowGovernancePolicyIssue = Readonly<{
  code: WorkflowGovernancePolicyCode;
  path: readonly (string | number)[];
  message: string;
  nodeKey?: string;
}>;

export type WorkflowGovernancePolicyEvaluation = Readonly<{
  passed: boolean;
  issues: readonly WorkflowGovernancePolicyIssue[];
}>;

function issue(
  code: WorkflowGovernancePolicyCode,
  path: readonly (string | number)[],
  message: string,
  nodeKey?: string,
): WorkflowGovernancePolicyIssue {
  return Object.freeze({
    code,
    path: Object.freeze([...path]),
    message,
    ...(nodeKey ? { nodeKey } : {}),
  });
}

function nodeKeyById(nodes: readonly WorkflowNodeInput[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const node of nodes) {
    out.set(node.nodeKey, node.nodeKey);
    if (node.id) out.set(node.id, node.nodeKey);
  }
  return out;
}

function reverseGraph(nodes: readonly WorkflowNodeInput[], edges: readonly WorkflowEdgeInput[]): Map<string, string[]> {
  const keys = nodeKeyById(nodes);
  const reverse = new Map(nodes.map((node) => [node.nodeKey, [] as string[]]));
  for (const edge of edges) {
    const source = keys.get(edge.sourceNodeId);
    const target = keys.get(edge.targetNodeId);
    if (!source || !target) continue;
    reverse.get(target)?.push(source);
  }
  return reverse;
}

function upstreamNodeKeys(nodeKey: string, reverse: Map<string, string[]>): ReadonlySet<string> {
  const seen = new Set<string>();
  const stack = [...(reverse.get(nodeKey) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(reverse.get(current) ?? []));
  }
  return seen;
}

function starterRoleIds(nodes: readonly WorkflowNodeInput[]): ReadonlySet<string> {
  const roles = new Set<string>();
  for (const node of nodes) {
    if (node.block.blockType !== "manual_start") continue;
    const config = node.configuration && typeof node.configuration === "object"
      ? node.configuration as Record<string, unknown>
      : {};
    const values = Array.isArray(config.starterRoleIds) ? config.starterRoleIds : ["aanvrager"];
    values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .forEach((value) => roles.add(value));
  }
  return roles;
}

function hasUpstreamApproval(
  target: WorkflowNodeInput,
  nodesByKey: ReadonlyMap<string, WorkflowNodeInput>,
  reverse: Map<string, string[]>,
): boolean {
  return [...upstreamNodeKeys(target.nodeKey, reverse)].some((key) => nodesByKey.get(key)?.block.blockType === "approval");
}

export function evaluateWorkflowGovernancePolicies(input: Readonly<{
  nodes: readonly WorkflowNodeInput[];
  edges: readonly WorkflowEdgeInput[];
  roleBindings: readonly WorkflowRoleBindingInput[];
}>): WorkflowGovernancePolicyEvaluation {
  const issues: WorkflowGovernancePolicyIssue[] = [];
  const nodesByKey = new Map(input.nodes.map((node) => [node.nodeKey, node]));
  const reverse = reverseGraph(input.nodes, input.edges);
  const starterRoles = starterRoleIds(input.nodes);
  const permissionsByRole = new Map<string, Set<string>>();
  const permissionsByGroup = new Map<string, Set<string>>();

  input.roleBindings.forEach((binding, index) => {
    const rolePermissions = permissionsByRole.get(binding.workflowRole) ?? new Set<string>();
    const groupPermissions = permissionsByGroup.get(binding.identityGroup) ?? new Set<string>();
    binding.permissions.forEach((permission) => {
      rolePermissions.add(permission);
      groupPermissions.add(permission);
    });
    permissionsByRole.set(binding.workflowRole, rolePermissions);
    permissionsByGroup.set(binding.identityGroup, groupPermissions);
    if (binding.permissions.includes("workflow:start") && binding.permissions.includes("workflow:approve")) {
      issues.push(issue(
        "forbidden_role_combination",
        ["roleBindings", index, "permissions"],
        `Workflowrol ${binding.workflowRole} combineert starten en goedkeuren; splits deze rollen voor functiescheiding.`,
      ));
    }
  });
  for (const [workflowRole, permissions] of permissionsByRole) {
    if (permissions.has("workflow:start") && permissions.has("workflow:approve")) {
      issues.push(issue(
        "forbidden_role_combination",
        ["roleBindings", workflowRole],
        `Workflowrol ${workflowRole} krijgt via meerdere bindingen zowel start- als goedkeuringsrechten.`,
      ));
    }
  }
  for (const [identityGroup, permissions] of permissionsByGroup) {
    if (permissions.has("workflow:start") && permissions.has("workflow:approve")) {
      issues.push(issue(
        "forbidden_role_combination",
        ["roleBindings", identityGroup],
        `Identiteitgroep ${identityGroup} krijgt via meerdere bindingen zowel start- als goedkeuringsrechten.`,
      ));
    }
  }

  input.nodes.forEach((node, index) => {
    if (node.block.blockType === "approval") {
      const parsed = workflowApprovalConfigurationSchema.safeParse(node.configuration ?? {});
      if (parsed.success) {
        if (!parsed.data.requireCommentOnReject || !parsed.data.requireCommentOnReturn) {
          issues.push(issue(
            "minimum_audit_fields_missing",
            ["nodes", index, "configuration"],
            `Approval ${node.nodeKey} moet commentaar verplichten bij afwijzen en terugsturen.`,
            node.nodeKey,
          ));
        }
        if (starterRoles.has(parsed.data.roleId)) {
          issues.push(issue(
            "mandatory_four_eyes_required",
            ["nodes", index, "configuration", "roleId"],
            `Approval ${node.nodeKey} gebruikt starterrol ${parsed.data.roleId}; vier-ogencontrole vereist een aparte goedkeuringsrol.`,
            node.nodeKey,
          ));
        }
      }
    }

    if (node.block.blockType === "change_request") {
      const parsed = workflowChangeRequestConfigurationSchema.safeParse(node.configuration ?? {});
      if (parsed.success && !hasUpstreamApproval(node, nodesByKey, reverse)) {
        issues.push(issue(
          "mutation_approval_required",
          ["nodes", index],
          `Change request ${node.nodeKey} vereist een upstream approval als publicatiepoort.`,
          node.nodeKey,
        ));
      }
      if (parsed.success && parsed.data.attributeMappings.length > 0) {
        const upstreamApprovals = [...upstreamNodeKeys(node.nodeKey, reverse)]
          .map((key) => nodesByKey.get(key))
          .filter((candidate): candidate is WorkflowNodeInput => candidate?.block.blockType === "approval");
        if (upstreamApprovals.every((approval) => {
          const approvalConfig = workflowApprovalConfigurationSchema.safeParse(approval.configuration ?? {});
          return !approvalConfig.success || !approvalConfig.data.requireCommentOnApprove;
        })) {
          issues.push(issue(
            "minimum_audit_fields_missing",
            ["nodes", index, "configuration", "attributeMappings"],
            `Mutation ${node.nodeKey} vereist minimaal één upstream approval met verplichte goedkeuringscommentaar.`,
            node.nodeKey,
          ));
        }
      }
    }

    if (node.block.blockType === "integration") {
      const parsed = workflowIntegrationConfigurationSchema.safeParse(node.configuration ?? {});
      if (parsed.success && !parsed.data.sandboxMode) {
        const upstreamApprovals = [...upstreamNodeKeys(node.nodeKey, reverse)]
          .map((key) => nodesByKey.get(key))
          .filter((candidate): candidate is WorkflowNodeInput => candidate?.block.blockType === "approval");
        const reviewed = upstreamApprovals.some((approval) => {
          const approvalConfig = workflowApprovalConfigurationSchema.safeParse(approval.configuration ?? {});
          return approvalConfig.success && approvalConfig.data.requireCommentOnApprove;
        });
        if (!reviewed || parsed.data.signing.mode !== "hmac_sha256") {
          issues.push(issue(
            "integration_review_required",
            ["nodes", index, "configuration"],
            `Integratie ${node.nodeKey} draait buiten sandbox en vereist integratiereview plus HMAC-signing.`,
            node.nodeKey,
          ));
        }
      }
    }
  });

  return Object.freeze({
    passed: issues.length === 0,
    issues: Object.freeze(issues),
  });
}
