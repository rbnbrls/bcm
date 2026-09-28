import type { WorkflowVersionSnapshot } from "@/lib/workflow-studio/definition-repository";
import {
  workflowSubworkflowConfigurationSchema,
  type WorkflowSubworkflowConfiguration,
} from "@/lib/workflow-studio/subworkflow-schema";

export type WorkflowSubworkflowReference = Readonly<{
  parentWorkflowDefinitionId: string;
  parentWorkflowName: string;
  parentWorkflowSlug: string;
  parentWorkflowVersionId: string;
  parentVersionNumber: number;
  parentStatus: "draft" | "published";
  nodeId: string;
  nodeKey: string;
  childWorkflowVersionId: string;
  pinnedVersionLabel?: string;
  inputMappingCount: number;
  outputMappingCount: number;
  nestingDepth: number;
}>;

export type WorkflowSubworkflowImpactAnalysis = Readonly<{
  childWorkflowVersionId: string;
  referenceCount: number;
  references: readonly WorkflowSubworkflowReference[];
}>;

function referenceFromNode(
  snapshot: WorkflowVersionSnapshot,
  node: WorkflowVersionSnapshot["nodes"][number],
  config: WorkflowSubworkflowConfiguration,
): WorkflowSubworkflowReference {
  return Object.freeze({
    parentWorkflowDefinitionId: snapshot.definition.id,
    parentWorkflowName: snapshot.definition.name,
    parentWorkflowSlug: snapshot.definition.slug,
    parentWorkflowVersionId: snapshot.version.id,
    parentVersionNumber: snapshot.version.versionNumber,
    parentStatus: snapshot.version.status,
    nodeId: node.id,
    nodeKey: node.nodeKey,
    childWorkflowVersionId: config.childWorkflowVersionId,
    ...(config.pinnedVersionLabel ? { pinnedVersionLabel: config.pinnedVersionLabel } : {}),
    inputMappingCount: config.inputMappings.length,
    outputMappingCount: config.outputMappings.length,
    nestingDepth: config.nestingDepth,
  });
}

export function collectWorkflowSubworkflowReferences(
  snapshots: readonly WorkflowVersionSnapshot[],
): readonly WorkflowSubworkflowReference[] {
  const references: WorkflowSubworkflowReference[] = [];
  for (const snapshot of snapshots) {
    for (const node of snapshot.nodes) {
      if (node.blockType !== "subworkflow") continue;
      const parsed = workflowSubworkflowConfigurationSchema.safeParse(node.configuration);
      if (!parsed.success) continue;
      references.push(referenceFromNode(snapshot, node, parsed.data));
    }
  }
  return Object.freeze(references.sort((left, right) => (
    left.parentWorkflowSlug.localeCompare(right.parentWorkflowSlug)
    || left.parentVersionNumber - right.parentVersionNumber
    || left.nodeKey.localeCompare(right.nodeKey)
  )));
}

export function analyzeWorkflowSubworkflowImpact(
  childWorkflowVersionId: string,
  snapshots: readonly WorkflowVersionSnapshot[],
): WorkflowSubworkflowImpactAnalysis {
  const references = collectWorkflowSubworkflowReferences(snapshots)
    .filter((reference) => reference.childWorkflowVersionId === childWorkflowVersionId);
  return Object.freeze({
    childWorkflowVersionId,
    referenceCount: references.length,
    references: Object.freeze(references),
  });
}
