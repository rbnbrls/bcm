import type { CreateWorkflowDraftInput } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowVersionSnapshot } from "@/lib/workflow-studio/definition-repository";
import { workflowIntegrationConfigurationSchema } from "@/lib/workflow-studio/integration-schema";
import { collectWorkflowSubworkflowReferences, type WorkflowSubworkflowReference } from "@/lib/workflow-studio/subworkflow-impact";
import { createWorkflowReviewDiff, type WorkflowReviewDiff } from "@/lib/workflow-studio/workflow-review";

export type WorkflowVersionRiskSeverity = "info" | "warning" | "high";
export type WorkflowVersionRiskCode =
  | "approval_count_reduced"
  | "data_scope_broadened"
  | "change_intent_surface_changed"
  | "integration_review_required"
  | "active_instances_on_changed_version";

export type WorkflowVersionRiskFlag = Readonly<{
  code: WorkflowVersionRiskCode;
  severity: WorkflowVersionRiskSeverity;
  message: string;
  nodeKey?: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type WorkflowVersionActiveInstanceImpact = Readonly<{
  workflowVersionId: string;
  activeInstanceCount: number;
}>;

export type WorkflowVersionDependencyGraph = Readonly<{
  subworkflowReferences: readonly WorkflowSubworkflowReference[];
  integrationConnectors: readonly {
    nodeKey: string;
    connectorId: string;
    connectorVersion: number;
    operation: string;
    sandboxMode: boolean;
  }[];
}>;

export type WorkflowVersionImpactAnalysis = Readonly<{
  diff: WorkflowReviewDiff;
  risks: readonly WorkflowVersionRiskFlag[];
  dependencies: WorkflowVersionDependencyGraph;
  activeInstances: readonly WorkflowVersionActiveInstanceImpact[];
}>;

function nodeCount(snapshot: WorkflowVersionSnapshot | null, blockType: string): number {
  return snapshot?.nodes.filter((node) => node.blockType === blockType).length ?? 0;
}

function bindingKey(binding: WorkflowVersionSnapshot["roleBindings"][number]): string {
  return `${binding.workflowRole}:${binding.identityGroup}:${binding.permissions.slice().sort().join(",")}`;
}

function scopeBroadened(
  current: WorkflowVersionSnapshot,
  baseline: WorkflowVersionSnapshot | null,
): WorkflowVersionRiskFlag[] {
  if (!baseline) return [];
  const baselineBindings = new Map(baseline.roleBindings.map((binding) => [bindingKey(binding), binding]));
  const risks: WorkflowVersionRiskFlag[] = [];
  for (const binding of current.roleBindings) {
    const before = baselineBindings.get(bindingKey(binding));
    if (!before) continue;
    const beforeClients = before.clientIds ?? null;
    const nextClients = binding.clientIds ?? null;
    if (beforeClients && !nextClients) {
      risks.push({
        code: "data_scope_broadened",
        severity: "high",
        message: `Rolbinding ${binding.workflowRole} is verbreed van clientscope naar businessunit-scope.`,
        details: { workflowRole: binding.workflowRole, identityGroup: binding.identityGroup },
      });
    } else if (beforeClients && nextClients && nextClients.some((clientId) => !beforeClients.includes(clientId))) {
      risks.push({
        code: "data_scope_broadened",
        severity: "high",
        message: `Rolbinding ${binding.workflowRole} bevat extra clients ten opzichte van de baseline.`,
        details: { workflowRole: binding.workflowRole, identityGroup: binding.identityGroup, addedClients: nextClients.filter((clientId) => !beforeClients.includes(clientId)) },
      });
    }
  }
  return risks;
}

function integrationConnectors(snapshot: WorkflowVersionSnapshot): WorkflowVersionDependencyGraph["integrationConnectors"] {
  return Object.freeze(snapshot.nodes
    .filter((node) => node.blockType === "integration")
    .flatMap((node) => {
      const parsed = workflowIntegrationConfigurationSchema.safeParse(node.configuration);
      if (!parsed.success) return [];
      return [{
        nodeKey: node.nodeKey,
        connectorId: parsed.data.connectorId,
        connectorVersion: parsed.data.connectorVersion,
        operation: parsed.data.operation,
        sandboxMode: parsed.data.sandboxMode,
      }];
    })
    .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)));
}

function integrationSignature(snapshot: WorkflowVersionSnapshot | null): string {
  return JSON.stringify((snapshot ? integrationConnectors(snapshot) : []).map((connector) => ({
    connectorId: connector.connectorId,
    connectorVersion: connector.connectorVersion,
    operation: connector.operation,
    sandboxMode: connector.sandboxMode,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

function riskFlags(
  current: WorkflowVersionSnapshot,
  baseline: WorkflowVersionSnapshot | null,
  activeInstances: readonly WorkflowVersionActiveInstanceImpact[],
): readonly WorkflowVersionRiskFlag[] {
  const risks: WorkflowVersionRiskFlag[] = [];
  const currentApprovals = nodeCount(current, "approval");
  const baselineApprovals = nodeCount(baseline, "approval");
  if (baseline && currentApprovals < baselineApprovals) {
    risks.push({
      code: "approval_count_reduced",
      severity: "high",
      message: `Aantal approval-nodes daalt van ${baselineApprovals} naar ${currentApprovals}.`,
      details: { before: baselineApprovals, after: currentApprovals },
    });
  }
  risks.push(...scopeBroadened(current, baseline));
  if (baseline && nodeCount(current, "change_request") !== nodeCount(baseline, "change_request")) {
    risks.push({
      code: "change_intent_surface_changed",
      severity: "warning",
      message: "Het aantal change_request-nodes verandert; controleer mutatie-impact.",
      details: { before: nodeCount(baseline, "change_request"), after: nodeCount(current, "change_request") },
    });
  }
  if (integrationSignature(current) !== integrationSignature(baseline)) {
    risks.push({
      code: "integration_review_required",
      severity: "warning",
      message: "Integratieconnectoren of -operaties wijzigen en vereisen expliciete review.",
      details: { connectors: integrationConnectors(current) },
    });
  }
  const impacted = activeInstances.filter((item) => item.activeInstanceCount > 0);
  if (impacted.length > 0) {
    risks.push({
      code: "active_instances_on_changed_version",
      severity: "info",
      message: "Er zijn actieve instances op versies die door deze wijziging geraakt kunnen worden.",
      details: { activeInstances: impacted },
    });
  }
  return Object.freeze(risks);
}

export function analyzeWorkflowVersionImpact(input: Readonly<{
  current: WorkflowVersionSnapshot;
  baseline: WorkflowVersionSnapshot | null;
  allSnapshots?: readonly WorkflowVersionSnapshot[];
  activeInstances?: readonly WorkflowVersionActiveInstanceImpact[];
}>): WorkflowVersionImpactAnalysis {
  const activeInstances = input.activeInstances ?? [];
  return Object.freeze({
    diff: createWorkflowReviewDiff(input.current, input.baseline),
    risks: riskFlags(input.current, input.baseline, activeInstances),
    dependencies: Object.freeze({
      subworkflowReferences: input.allSnapshots ? collectWorkflowSubworkflowReferences(input.allSnapshots).filter((reference) => (
        reference.childWorkflowVersionId === input.current.version.id
        || reference.childWorkflowVersionId === input.baseline?.version.id
      )) : [],
      integrationConnectors: integrationConnectors(input.current),
    }),
    activeInstances: Object.freeze([...activeInstances]),
  });
}

export function prepareWorkflowRollbackDraft(
  snapshot: WorkflowVersionSnapshot,
  input: Readonly<{ slug: string; name?: string; description?: string }>,
): CreateWorkflowDraftInput {
  return {
    scope: {
      tenant: snapshot.definition.tenant,
      businessUnit: snapshot.definition.businessUnit,
      ...(snapshot.definition.clientIds ? { clientIds: [...snapshot.definition.clientIds] } : {}),
    },
    slug: input.slug,
    name: input.name ?? `${snapshot.definition.name} rollback v${snapshot.version.versionNumber}`,
    description: input.description ?? `Rollback naar workflowversie ${snapshot.version.versionNumber} (${snapshot.version.id}).`,
    category: snapshot.definition.category ?? "other",
    tags: [...new Set([...(snapshot.definition.tags ?? []), "rollback", `rollback-source:${snapshot.version.id}`])],
    catalogDescription: snapshot.definition.catalogDescription ?? "",
    costModel: snapshot.definition.costModel ?? { baseCost: 0, currency: "EUR", description: "" },
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      nodeKey: node.nodeKey,
      block: { blockType: node.blockType, contractVersion: node.blockContractVersion },
      configuration: node.configuration,
      position: { x: node.positionX, y: node.positionY },
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      edgeKey: edge.edgeKey,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort,
      ...(edge.condition ? { condition: edge.condition as Record<string, unknown> } : {}),
    })),
    roleBindings: snapshot.roleBindings.map((binding) => ({
      workflowRole: binding.workflowRole,
      identityGroup: binding.identityGroup,
      permissions: binding.permissions as CreateWorkflowDraftInput["roleBindings"][number]["permissions"],
      tenant: binding.tenant,
      businessUnit: binding.businessUnit,
      ...(binding.clientIds ? { clientIds: [...binding.clientIds] } : {}),
    })),
  };
}
