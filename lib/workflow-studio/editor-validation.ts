import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import {
  connectWorkflowEditorPorts,
  createWorkflowEditorNode,
  updateWorkflowEditorNodeConfiguration,
  validateWorkflowEditorShell,
  type WorkflowEditorGraph,
  type WorkflowEditorNode,
} from "@/lib/workflow-studio/editor-model";
import { collectWorkflowVariableOptions, validateContractConfiguration } from "@/lib/workflow-studio/properties-schema";
import {
  collectDataMappings,
  type DataMapping,
} from "@/lib/workflow-studio/data-mappings";

export type WorkflowEditorQuickFix =
  | { kind: "add_end_nodes" }
  | { kind: "assign_variable"; nodeId: string; property: string; value: string | readonly string[] };

export type WorkflowEditorPanelIssue = {
  id: string;
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  property?: string;
  fix?: string;
  quickFix?: WorkflowEditorQuickFix;
};

export type WorkflowEditorValidationSummary = {
  blockers: readonly WorkflowEditorPanelIssue[];
  warnings: readonly WorkflowEditorPanelIssue[];
  publishBlocked: boolean;
};

function configRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function issueId(parts: readonly unknown[]): string {
  return parts.map(String).join(":");
}

export function validateWorkflowEditorDraft(
  nodes: readonly WorkflowEditorNode[],
  edges: WorkflowEditorGraph["edges"],
  catalog: readonly BlockCatalogEntry[],
): WorkflowEditorValidationSummary {
  const issues: WorkflowEditorPanelIssue[] = validateWorkflowEditorShell(nodes, edges).map((item) => ({
    ...item,
    id: issueId([item.code, item.nodeId ?? "graph"]),
    ...(item.code === "end_missing" ? {
      fix: "Voeg voor ieder open pad een expliciet eindblok toe.",
      quickFix: { kind: "add_end_nodes" as const },
    } : {}),
  }));

  for (const node of nodes) {
    const entry = catalog.find((candidate) => candidate.blockType === node.blockType && candidate.contractVersion === node.contractVersion);
    if (!entry) {
      issues.push({
        id: issueId(["unknown_contract", node.id]),
        code: "unknown_contract",
        severity: "error",
        nodeId: node.id,
        message: `Voor ${node.label} is blockcontract ${node.blockType}@${node.contractVersion} niet beschikbaar.`,
        fix: "Herstel de blockversie of verwijder het onbekende blok.",
      });
      continue;
    }
    const variableOptions = collectWorkflowVariableOptions(nodes, node.id);
    const contractIssues = validateContractConfiguration(entry.configurationSchema, node.configuration);
    for (const contractIssue of contractIssues) {
      const property = typeof contractIssue.path[0] === "string" ? contractIssue.path[0] : undefined;
      const widget = property ? entry.configurationUiSchema.widgets?.[property] : undefined;
      const missingVariable = property
        && (widget === "variable" || widget === "variable-multiselect")
        && configRecord(node.configuration)[property] === undefined;
      const uniqueVariable = missingVariable && variableOptions.length === 1 ? variableOptions[0] : undefined;
      issues.push({
        id: issueId(["contract", node.id, contractIssue.path.join(".")]),
        code: "block_configuration_invalid",
        severity: "error",
        nodeId: node.id,
        ...(property ? { property } : {}),
        message: `${node.label}: ${contractIssue.message}`,
        fix: uniqueVariable
          ? `Koppel de enige beschikbare bronvariabele ‘${uniqueVariable.id}’.`
          : property
            ? `Vul een geldige waarde in voor ${property}.`
            : "Herstel de blokconfiguratie volgens het contract.",
        ...(uniqueVariable && property ? {
          quickFix: {
            kind: "assign_variable" as const,
            nodeId: node.id,
            property,
            value: widget === "variable-multiselect" ? [uniqueVariable.id] : uniqueVariable.id,
          },
        } : {}),
      });
    }
  }

  // Duplicate data mapping detection, mirroring the server-side publish gate
  // (lib/workflow-studio/workflow-validator.ts). The server refuses to publish
  // when a variable is read or written by multiple blocks unless the warning
  // codes are explicitly acknowledged; the editor must show the same warnings
  // or the acknowledgement flow is dead and publish becomes impossible for
  // workflows where an approval reviews variables a change_request consumes.
  const allMappings: DataMapping[] = [];
  for (const node of nodes) {
    if (!catalog.some((entry) => entry.blockType === node.blockType && entry.contractVersion === node.contractVersion)) continue;
    allMappings.push(...collectDataMappings(node.nodeKey, node.blockType, node.configuration));
  }
  const mappingsByVariable = new Map<string, DataMapping[]>();
  for (const mapping of allMappings) {
    const list = mappingsByVariable.get(mapping.variable) ?? [];
    list.push(mapping);
    mappingsByVariable.set(mapping.variable, list);
  }
  for (const [variable, mappings] of mappingsByVariable) {
    if (mappings.length <= 1) continue;
    const writers = mappings.filter((mapping) => mapping.port === "out");
    const readers = mappings.filter((mapping) => mapping.port === "in");
    if (writers.length > 1) {
      for (const mapping of writers) {
        const node = nodes.find((candidate) => candidate.nodeKey === mapping.nodeKey);
        issues.push({
          id: issueId(["data_mapping_writer", mapping.nodeKey, mapping.field]),
          code: "duplicate_data_mapping",
          severity: "error",
          nodeId: node?.id ?? mapping.nodeKey,
          message: `Variabele ${variable} wordt door meerdere blokken geschreven.`,
          fix: "Hernoem de outputVariabele of verwijder één van de schrijvers.",
        });
      }
    }
    if (readers.length > 1) {
      for (const mapping of readers) {
        const node = nodes.find((candidate) => candidate.nodeKey === mapping.nodeKey);
        issues.push({
          id: issueId(["data_mapping_reader", mapping.nodeKey, mapping.field]),
          code: "duplicate_data_mapping",
          severity: "warning",
          nodeId: node?.id ?? mapping.nodeKey,
          message: `Variabele ${variable} wordt door meerdere blokken gelezen; controleer of dat de bedoeling is.`,
          fix: "Controleer of de lezers de juiste bronvariabele gebruiken.",
        });
      }
    }
  }

  const deduped = [...new Map(issues.map((item) => [item.id, item])).values()];
  const blockers = deduped.filter((item) => item.severity === "error");
  const warnings = deduped.filter((item) => item.severity === "warning");
  return { blockers, warnings, publishBlocked: blockers.length > 0 };
}

export function applyWorkflowEditorQuickFix(
  graph: WorkflowEditorGraph,
  fix: WorkflowEditorQuickFix,
  catalog: readonly BlockCatalogEntry[],
  createId: () => string,
): WorkflowEditorGraph {
  if (fix.kind === "assign_variable") {
    const node = graph.nodes.find((candidate) => candidate.id === fix.nodeId);
    if (!node) return graph;
    return {
      nodes: updateWorkflowEditorNodeConfiguration(graph.nodes, node.id, {
        ...configRecord(node.configuration),
        [fix.property]: fix.value,
      }),
      edges: graph.edges,
    };
  }

  const endEntry = catalog.find((entry) => entry.blockType === "end");
  if (!endEntry || graph.nodes.some((node) => node.blockType === "end")) return graph;
  const outgoingNodeIds = new Set(graph.edges.map((edge) => edge.sourceNodeId));
  const terminals = graph.nodes.filter((node) => node.blockType !== "end" && !outgoingNodeIds.has(node.id));
  const sources = terminals.length > 0 ? terminals : [undefined];
  let nextGraph: WorkflowEditorGraph = graph;
  for (const source of sources) {
    const end = createWorkflowEditorNode(endEntry, nextGraph.nodes, createId(), source
      ? { x: source.position.x + 240, y: source.position.y }
      : undefined);
    nextGraph = { nodes: [...nextGraph.nodes, end], edges: nextGraph.edges };
    if (!source) continue;
    const sourceEntry = catalog.find((entry) => entry.blockType === source.blockType && entry.contractVersion === source.contractVersion);
    const sourcePort = sourceEntry?.outputs.find((port) => port.valueType === "flow" && (port.maxConnections === null || !nextGraph.edges.some((edge) => edge.sourceNodeId === source.id && edge.sourcePort === port.id)));
    const targetPort = endEntry.inputs.find((port) => port.valueType === "flow");
    if (!sourcePort || !targetPort) continue;
    nextGraph = connectWorkflowEditorPorts(catalog, nextGraph, { nodeId: source.id, portId: sourcePort.id }, { nodeId: end.id, portId: targetPort.id }) ?? nextGraph;
  }
  return nextGraph;
}
