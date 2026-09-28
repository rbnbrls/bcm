import type {
  WorkflowDefinitionRow,
  WorkflowVersionSnapshot,
} from "@/lib/workflow-studio/definition-repository";

export type WorkflowReviewChangeKind = "added" | "removed" | "changed";
export type WorkflowReviewChange = {
  kind: WorkflowReviewChangeKind;
  area: "metadata" | "nodes" | "edges" | "roleBindings";
  key: string;
  label: string;
};

export type WorkflowReviewDiff = {
  baselineVersionNumber: number | null;
  changes: readonly WorkflowReviewChange[];
  counts: Readonly<Record<WorkflowReviewChangeKind, number>>;
};

type ReviewableSnapshot = Pick<WorkflowVersionSnapshot, "nodes" | "edges" | "roleBindings"> & {
  definition: Pick<WorkflowDefinitionRow, "name" | "description" | "category" | "tags" | "catalogDescription" | "costModel">;
  version?: Pick<WorkflowVersionSnapshot["version"], "versionNumber">;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(stable).sort());
  if (value && typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)])));
  }
  return JSON.stringify(value);
}

function compareMaps(
  area: WorkflowReviewChange["area"],
  current: ReadonlyMap<string, { label: string; value: unknown }>,
  baseline: ReadonlyMap<string, { label: string; value: unknown }>,
): WorkflowReviewChange[] {
  const keys = [...new Set([...current.keys(), ...baseline.keys()])].sort();
  const changes: WorkflowReviewChange[] = [];
  for (const key of keys) {
    const next = current.get(key);
    const before = baseline.get(key);
    if (!before && next) changes.push({ kind: "added", area, key, label: next.label });
    else if (before && !next) changes.push({ kind: "removed", area, key, label: before.label });
    if (before && next && stable(before.value) !== stable(next.value)) {
      changes.push({ kind: "changed", area, key, label: next.label });
    }
  }
  return changes;
}

function maps(snapshot: ReviewableSnapshot) {
  const nodeKeys = new Map(snapshot.nodes.map((node) => [node.id, node.nodeKey]));
  return {
    metadata: new Map(Object.entries({
      name: snapshot.definition.name,
      description: snapshot.definition.description,
      category: snapshot.definition.category,
      tags: snapshot.definition.tags,
      catalogDescription: snapshot.definition.catalogDescription,
      costModel: snapshot.definition.costModel,
    }).map(([key, value]) => [key, { label: key, value }])),
    nodes: new Map(snapshot.nodes.map((node) => [node.nodeKey, {
      label: node.nodeKey,
      value: {
        blockType: node.blockType,
        contractVersion: node.blockContractVersion,
        configuration: node.configuration,
        position: [node.positionX, node.positionY],
      },
    }])),
    edges: new Map(snapshot.edges.map((edge) => [edge.edgeKey, {
      label: edge.edgeKey,
      value: {
        source: nodeKeys.get(edge.sourceNodeId) ?? edge.sourceNodeId,
        sourcePort: edge.sourcePort,
        target: nodeKeys.get(edge.targetNodeId) ?? edge.targetNodeId,
        targetPort: edge.targetPort,
        condition: edge.condition,
      },
    }])),
    roleBindings: new Map(snapshot.roleBindings.map((binding) => [`${binding.workflowRole}:${binding.identityGroup}`, {
      label: `${binding.workflowRole} · ${binding.identityGroup}`,
      value: {
        permissions: [...binding.permissions].sort(),
        tenant: binding.tenant,
        businessUnit: binding.businessUnit,
        clientIds: binding.clientIds ? [...binding.clientIds].sort() : null,
      },
    }])),
  };
}

export function createWorkflowReviewDiff(
  current: ReviewableSnapshot,
  baseline: ReviewableSnapshot | null,
): WorkflowReviewDiff {
  const currentMaps = maps(current);
  const baselineMaps = baseline ? maps(baseline) : {
    metadata: new Map(), nodes: new Map(), edges: new Map(), roleBindings: new Map(),
  };
  const changes = (Object.keys(currentMaps) as (keyof typeof currentMaps)[])
    .flatMap((area) => compareMaps(area, currentMaps[area], baselineMaps[area]));
  return {
    baselineVersionNumber: baseline?.version?.versionNumber ?? null,
    changes,
    counts: {
      added: changes.filter((change) => change.kind === "added").length,
      removed: changes.filter((change) => change.kind === "removed").length,
      changed: changes.filter((change) => change.kind === "changed").length,
    },
  };
}
