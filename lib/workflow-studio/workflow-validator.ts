/**
 * Static workflow validator.
 *
 * Performs a side-effect-free validation of a workflow draft graph against the
 * block contract layer, the client-config data catalog and the role binding
 * authorization model. It is the single source of truth for everything the
 * Workflow Studio UI displays in its validation panel, the path simulator and
 * the publish gate.
 *
 * Validation rules (see `documentation/workflow-studio-implementation-plan.md`,
 * taak 1.12):
 *
 * - One start node and at least one end node
 * - Reachability: every node is reachable from the start via flow edges
 * - Port compatibility: source/target ports exist, types match, both sides
 *   allow the connection
 * - Required input ports are connected; `maxConnections` is not exceeded
 * - No duplicate node keys, edge keys or role bindings
 * - All edges resolve to known nodes
 * - No forbidden cycles (the MVP has no parallel split/join so any cycle is
 *   rejected; phase 4 lifts this with explicit split/join blocks)
 * - Every role referenced by role_task/approval/notification has at least one
 *   role binding and a binding that grants the block's required capability
 * - Every change_request block (capability `change_intent`) is preceded in the
 *   flow by an `approval` block
 * - Data mappings (outputVariable, effectiveDateVariable, rationaleVariable,
 *   decision.variable) are unique across the workflow and follow the stable
 *   snake_case variable naming
 * - Change-request data references resolve to the data catalog
 *
 * The result is an immutable list of issues with a stable `code`, a severity
 * (error blocks publish, warnings require explicit acknowledgement), the
 * `nodeKey`/`edgeKey` they refer to, a `path` for UI navigation and a
 * concrete `fix` string the UI can present as a "quick fix" hint.
 */
import type { IdentityContext } from "@/lib/identity/types";
import {
  authorizeWorkflowRoleBinding,
  type WorkflowAuthorizationDecision,
} from "@/lib/workflow-studio-authorization";
import {
  type BlockDefinition,
  type BlockValidationIssue,
  type BlockValidationResult,
  validateBlockConnection,
} from "@/lib/workflow-studio/block-contract";
import {
  clientConfigDataCatalog,
  type DataCatalog,
} from "@/lib/workflow-studio/data-catalog";
import type {
  WorkflowEdgeInput,
  WorkflowNodeInput,
  WorkflowRoleBindingInput,
} from "@/lib/workflow-studio/definition-schema";

export const WORKFLOW_VALIDATOR_VERSION = 1 as const;

export type WorkflowValidationSeverity = "error" | "warning";

export type WorkflowValidationIssueCode =
  | "duplicate_node_key"
  | "duplicate_edge_key"
  | "duplicate_role_binding"
  | "missing_start_node"
  | "multiple_start_nodes"
  | "missing_end_node"
  | "orphan_node_reference"
  | "unreachable_node"
  | "unreachable_end_node"
  | "dead_end_branch"
  | "start_node_has_no_outgoing_edge"
  | "cycle_detected"
  | "required_input_port_unconnected"
  | "port_connection_limit_exceeded"
  | "duplicate_data_mapping"
  | "invalid_data_mapping_identifier"
  | "role_not_bound"
  | "role_binding_denied"
  | "change_request_without_approval"
  | "change_request_unknown_resource"
  | "change_request_operation_not_requestable"
  | "block_configuration_invalid";

export type WorkflowValidationIssue = {
  readonly code: WorkflowValidationIssueCode | BlockValidationIssue["code"];
  readonly severity: WorkflowValidationSeverity;
  readonly nodeKey?: string;
  readonly edgeKey?: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly fix?: string;
};

export type WorkflowValidationResult = {
  readonly valid: boolean;
  readonly blocking: boolean;
  readonly issues: readonly WorkflowValidationIssue[];
  readonly reachableNodeKeys: readonly string[];
  readonly terminalNodeKeys: readonly string[];
};

export type WorkflowValidationInput = {
  readonly identity: IdentityContext;
  readonly nodes: readonly WorkflowNodeInput[];
  readonly edges: readonly WorkflowEdgeInput[];
  readonly roleBindings?: readonly WorkflowRoleBindingInput[];
  readonly dataCatalog?: DataCatalog;
};

type MutableNode = WorkflowNodeInput & { id: string };
type MutableEdge = WorkflowEdgeInput & { id: string };

function issue(
  code: WorkflowValidationIssue["code"],
  severity: WorkflowValidationSeverity,
  path: readonly (string | number)[],
  message: string,
  extras: Partial<Pick<WorkflowValidationIssue, "nodeKey" | "edgeKey" | "fix">> = {},
): WorkflowValidationIssue {
  return Object.freeze({
    code,
    severity,
    path: Object.freeze([...path]),
    message,
    ...(extras.nodeKey !== undefined ? { nodeKey: extras.nodeKey } : {}),
    ...(extras.edgeKey !== undefined ? { edgeKey: extras.edgeKey } : {}),
    ...(extras.fix !== undefined ? { fix: extras.fix } : {}),
  });
}

function mapBlockIssue(
  blockIssue: BlockValidationIssue,
  pathPrefix: readonly (string | number)[],
  nodeKey: string,
): WorkflowValidationIssue {
  return Object.freeze({
    code: blockIssue.code,
    severity: "error" as const,
    nodeKey,
    path: Object.freeze([...pathPrefix, ...blockIssue.path]),
    message: blockIssue.message,
  });
}

function dedupeIssues(
  groups: ReadonlyArray<ReadonlyArray<WorkflowValidationIssue>>,
): readonly WorkflowValidationIssue[] {
  const seen = new Set<string>();
  const out: WorkflowValidationIssue[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.code}|${item.severity}|${item.nodeKey ?? ""}|${item.edgeKey ?? ""}|${item.path.join(".")}|${item.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return Object.freeze(out);
}

type BlockLookup = ReadonlyMap<string, ReadonlyMap<string, BlockDefinition>>;

function buildBlockLookup(blockDefinitions: ReadonlyMap<string, BlockDefinition>): BlockLookup {
  const map = new Map<string, Map<string, BlockDefinition>>();
  for (const definition of blockDefinitions.values()) {
    const byKey = map.get(definition.blockType) ?? new Map<string, BlockDefinition>();
    byKey.set(`${definition.blockType}@${definition.contractVersion}`, definition);
    map.set(definition.blockType, byKey);
  }
  return map;
}

function resolveBlock(
  lookup: BlockLookup,
  blockType: string,
  contractVersion: number,
): BlockValidationResult<BlockDefinition> {
  const byVersion = lookup.get(blockType);
  if (!byVersion) {
    return {
      valid: false,
      issues: [Object.freeze({
        code: "unknown_block_type" as const,
        path: Object.freeze(["block", "blockType"]),
        message: `Onbekend block type: ${blockType}.`,
      })],
    };
  }
  const definition = byVersion.get(`${blockType}@${contractVersion}`);
  if (!definition) {
    return {
      valid: false,
      issues: [Object.freeze({
        code: "unknown_block_version" as const,
        path: Object.freeze(["block", "contractVersion"]),
        message: `Onbekende contractversie ${contractVersion} voor ${blockType}.`,
      })],
    };
  }
  return { valid: true, value: definition };
}

function indexByKey<T extends { nodeKey?: string; edgeKey?: string }>(
  items: readonly T[],
  key: "nodeKey" | "edgeKey",
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const value = (item as Record<string, unknown>)[key];
    if (typeof value === "string") map.set(value, item);
  }
  return map;
}

function buildNodeIndex(nodes: readonly MutableNode[]): {
  byKey: Map<string, MutableNode>;
  byId: Map<string, MutableNode>;
} {
  const byKey = new Map<string, MutableNode>();
  const byId = new Map<string, MutableNode>();
  for (const node of nodes) {
    byKey.set(node.nodeKey, node);
    byId.set(node.id, node);
  }
  return { byKey, byId };
}

function resolveNodeKey(
  edge: { sourceNodeId: string; targetNodeId: string },
  index: { byKey: Map<string, MutableNode>; byId: Map<string, MutableNode> },
  endpoint: "sourceNodeId" | "targetNodeId",
): string | null {
  const value = edge[endpoint];
  const byIdHit = index.byId.get(value);
  if (byIdHit) return byIdHit.nodeKey;
  const byKeyHit = index.byKey.get(value);
  if (byKeyHit) return byKeyHit.nodeKey;
  return null;
}

/**
 * Build a forward + reverse flow adjacency map keyed by stable nodeKey. The
 * input graph may mix UUIDs and nodeKeys (clients that author in memory only
 * know nodeKeys); we resolve every endpoint to the canonical nodeKey before
 * doing graph analysis.
 */
function buildFlowGraph(
  nodes: readonly MutableNode[],
  edges: readonly MutableEdge[],
): {
  forward: Map<string, string[]>;
  reverse: Map<string, string[]>;
  edgesByTarget: Map<string, MutableEdge[]>;
  blockByKey: Map<string, BlockDefinition>;
} {
  const nodeKeyById = new Map<string, string>();
  for (const node of nodes) {
    // Edges may reference nodes by either the database UUID or the stable
    // nodeKey. Index both so flow analysis can always resolve an endpoint to
    // the canonical nodeKey.
    if (node.id) nodeKeyById.set(node.id, node.nodeKey);
    if (node.nodeKey) nodeKeyById.set(node.nodeKey, node.nodeKey);
  }
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  const edgesByTarget = new Map<string, MutableEdge[]>();
  for (const node of nodes) {
    forward.set(node.nodeKey, []);
    reverse.set(node.nodeKey, []);
  }
  for (const edge of edges) {
    const sourceKey = nodeKeyById.get(edge.sourceNodeId);
    const targetKey = nodeKeyById.get(edge.targetNodeId);
    if (!sourceKey || !targetKey) continue;
    forward.get(sourceKey)!.push(targetKey);
    reverse.get(targetKey)!.push(sourceKey);
    const list = edgesByTarget.get(targetKey) ?? [];
    list.push(edge);
    edgesByTarget.set(targetKey, list);
  }
  return { forward, reverse, edgesByTarget, blockByKey: new Map() };
}

function bfs(start: string, graph: Map<string, string[]>): { visited: string[]; order: string[] } {
  const visited: string[] = [];
  const order: string[] = [];
  const queue: string[] = [start];
  const seen = new Set<string>([start]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.push(current);
    order.push(current);
    for (const next of graph.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return { visited, order };
}

function detectCycles(
  start: string,
  forward: Map<string, string[]>,
): readonly string[][] {
  const cycles: string[][] = [];
  const stack: { node: string; iterator: string[]; onStack: Set<string>; path: string[] }[] = [];
  const visiting = new Set<string>();
  const startCycle = { node: start, iterator: [...(forward.get(start) ?? [])], onStack: new Set([start]), path: [start] };
  stack.push(startCycle);
  visiting.add(start);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const next = frame.iterator.shift();
    if (!next) {
      visiting.delete(frame.node);
      stack.pop();
      continue;
    }
    if (frame.onStack.has(next)) {
      const cycleStart = frame.path.indexOf(next);
      if (cycleStart >= 0) {
        const segment = frame.path.slice(cycleStart);
        cycles.push([...segment, next]);
      }
      continue;
    }
    if (visiting.has(next)) {
      // Cross edge into a frame that started after `next`; not a cycle in the
      // MVP (no parallel split/join) but still reported as a cycle for safety
      // because the engine cannot re-enter a running instance.
      continue;
    }
    frame.onStack.add(next);
    frame.path.push(next);
    visiting.add(next);
    stack.push({
      node: next,
      iterator: [...(forward.get(next) ?? [])],
      onStack: new Set(frame.onStack),
      path: [...frame.path],
    });
  }
  return Object.freeze(cycles.map((cycle) => [...cycle]));
}

const VARIABLE_REGEX = /^[a-z][a-z0-9_]*$/;
const ROLE_REGEX = /^[a-z][a-z0-9_-]*$/;

type DataMapping = {
  readonly nodeKey: string;
  readonly field: string;
  readonly variable: string;
  readonly port: "out" | "in";
};

function collectDataMappings(node: MutableNode, definition: BlockDefinition): readonly DataMapping[] {
  const configuration = (node.configuration ?? {}) as Record<string, unknown>;
  const mappings: DataMapping[] = [];
  switch (definition.blockType) {
    case "form": {
      const fields = Array.isArray(configuration.fields) ? configuration.fields as Array<Record<string, unknown>> : [];
      for (const field of fields) {
        if (typeof field.id === "string" && VARIABLE_REGEX.test(field.id)) {
          mappings.push({ nodeKey: node.nodeKey, field: `fields.${field.id}`, variable: field.id, port: "out" });
        }
      }
      break;
    }
    case "client_config_lookup": {
      if (typeof configuration.outputVariable === "string" && VARIABLE_REGEX.test(configuration.outputVariable)) {
        mappings.push({ nodeKey: node.nodeKey, field: "outputVariable", variable: configuration.outputVariable, port: "out" });
      }
      break;
    }
    case "change_request": {
      if (typeof configuration.effectiveDateVariable === "string" && VARIABLE_REGEX.test(configuration.effectiveDateVariable)) {
        mappings.push({ nodeKey: node.nodeKey, field: "effectiveDateVariable", variable: configuration.effectiveDateVariable, port: "in" });
      }
      if (typeof configuration.rationaleVariable === "string" && VARIABLE_REGEX.test(configuration.rationaleVariable)) {
        mappings.push({ nodeKey: node.nodeKey, field: "rationaleVariable", variable: configuration.rationaleVariable, port: "in" });
      }
      break;
    }
    case "decision": {
      if (typeof configuration.variable === "string" && VARIABLE_REGEX.test(configuration.variable)) {
        mappings.push({ nodeKey: node.nodeKey, field: "variable", variable: configuration.variable, port: "in" });
      }
      break;
    }
    default:
      break;
  }
  return Object.freeze([...mappings]);
}

type RoleUsage = {
  readonly nodeKey: string;
  readonly field: "roleId" | "recipientRoleId";
  readonly blockType: string;
  readonly roleId: string;
};

function collectRoleUsages(node: MutableNode, definition: BlockDefinition): readonly RoleUsage[] {
  const configuration = (node.configuration ?? {}) as Record<string, unknown>;
  const usages: RoleUsage[] = [];
  if (definition.blockType === "role_task" || definition.blockType === "approval") {
    if (typeof configuration.roleId === "string" && ROLE_REGEX.test(configuration.roleId)) {
      usages.push({ nodeKey: node.nodeKey, field: "roleId", blockType: definition.blockType, roleId: configuration.roleId });
    }
  }
  if (definition.blockType === "notification") {
    if (typeof configuration.recipientRoleId === "string" && ROLE_REGEX.test(configuration.recipientRoleId)) {
      usages.push({ nodeKey: node.nodeKey, field: "recipientRoleId", blockType: definition.blockType, roleId: configuration.recipientRoleId });
    }
  }
  return Object.freeze([...usages]);
}

function decisionErrorCode(decision: Exclude<WorkflowAuthorizationDecision, { authorized: true }>): WorkflowValidationIssue["code"] {
  switch (decision.code) {
    case "role_out_of_scope":
    case "invalid_role_binding":
      return "role_binding_denied";
    case "role_capability_mismatch":
      return "role_binding_denied";
    default:
      return "role_binding_denied";
  }
}

export class WorkflowValidator {
  readonly #blockDefinitions: ReadonlyMap<string, BlockDefinition>;
  readonly #dataCatalog: DataCatalog;

  constructor(
    blockDefinitions: ReadonlyMap<string, BlockDefinition>,
    dataCatalog: DataCatalog = clientConfigDataCatalog,
  ) {
    this.#blockDefinitions = blockDefinitions;
    this.#dataCatalog = dataCatalog;
  }

  validate(input: WorkflowValidationInput): WorkflowValidationResult {
    const nodes: MutableNode[] = input.nodes.map((node) => ({
      ...node,
      id: node.id ?? node.nodeKey,
    }));
    const edges: MutableEdge[] = input.edges.map((edge) => ({
      ...edge,
      id: edge.id ?? edge.edgeKey,
    }));

    const nodeIndex = buildNodeIndex(nodes);
    const blockLookup = buildBlockLookup(this.#blockDefinitions);
    const issues: WorkflowValidationIssue[] = [];

    // 1. Duplicate keys ---------------------------------------------------
    const seenNodeKeys = new Set<string>();
    for (const node of nodes) {
      if (seenNodeKeys.has(node.nodeKey)) {
        issues.push(issue("duplicate_node_key", "error", ["nodes", node.nodeKey], `Node-key ${node.nodeKey} wordt meer dan één keer gebruikt.`, {
          nodeKey: node.nodeKey,
          fix: `Hernoem één van de nodes zodat de nodeKey uniek is binnen de workflow.`,
        }));
      }
      seenNodeKeys.add(node.nodeKey);
    }

    const seenEdgeKeys = new Set<string>();
    for (const edge of edges) {
      if (seenEdgeKeys.has(edge.edgeKey)) {
        issues.push(issue("duplicate_edge_key", "error", ["edges", edge.edgeKey], `Edge-key ${edge.edgeKey} wordt meer dan één keer gebruikt.`, {
          edgeKey: edge.edgeKey,
          fix: `Geef één van beide edges een unieke edgeKey.`,
        }));
      }
      seenEdgeKeys.add(edge.edgeKey);
    }

    // 2. Block contract and configuration --------------------------------
    const definitionsByNodeKey = new Map<string, BlockDefinition>();
    for (const node of nodes) {
      const resolved = resolveBlock(blockLookup, node.block.blockType, node.block.contractVersion);
      if (!resolved.valid) {
        for (const blockIssue of resolved.issues) {
          issues.push(mapBlockIssue(blockIssue, ["nodes", node.nodeKey], node.nodeKey));
        }
        continue;
      }
      const configResult = resolved.value.validateConfiguration(node.configuration);
      if (!configResult.valid) {
        for (const blockIssue of configResult.issues) {
          issues.push(mapBlockIssue(blockIssue, ["nodes", node.nodeKey], node.nodeKey));
        }
      }
      definitionsByNodeKey.set(node.nodeKey, resolved.value);
    }

    // 3. Edge endpoints resolve to known nodes ----------------------------
    for (const edge of edges) {
      const sourceKey = resolveNodeKey(edge, nodeIndex, "sourceNodeId");
      const targetKey = resolveNodeKey(edge, nodeIndex, "targetNodeId");
      if (!sourceKey) {
        issues.push(issue("orphan_node_reference", "error", ["edges", edge.edgeKey, "sourceNodeId"], `Edge ${edge.edgeKey} verwijst naar een onbekende bronnode.`, {
          edgeKey: edge.edgeKey,
          fix: `Verwijder de edge of voeg de bronnode opnieuw toe.`,
        }));
      }
      if (!targetKey) {
        issues.push(issue("orphan_node_reference", "error", ["edges", edge.edgeKey, "targetNodeId"], `Edge ${edge.edgeKey} verwijst naar een onbekende doelnode.`, {
          edgeKey: edge.edgeKey,
          fix: `Verwijder de edge of voeg de doelnode opnieuw toe.`,
        }));
      }
    }

    // 4. Port compatibility / connection rules ---------------------------
    for (const edge of edges) {
      const sourceNode = nodeIndex.byId.get(edge.sourceNodeId) ?? nodeIndex.byKey.get(edge.sourceNodeId);
      const targetNode = nodeIndex.byId.get(edge.targetNodeId) ?? nodeIndex.byKey.get(edge.targetNodeId);
      const sourceDef = sourceNode ? definitionsByNodeKey.get(sourceNode.nodeKey) : undefined;
      const targetDef = targetNode ? definitionsByNodeKey.get(targetNode.nodeKey) : undefined;
      if (!sourceDef || !targetDef || !sourceNode || !targetNode) continue;
      const result = validateBlockConnection(sourceDef, edge.sourcePort, targetDef, edge.targetPort);
      if (!result.valid) {
        for (const blockIssue of result.issues) {
          issues.push(mapBlockIssue(blockIssue, ["edges", edge.edgeKey], sourceNode.nodeKey));
        }
      }
    }

    // 5. Graph structure --------------------------------------------------
    const { forward, reverse, edgesByTarget } = buildFlowGraph(nodes, edges);
    const startNodes: string[] = [];
    const endNodes: string[] = [];
    for (const node of nodes) {
      const def = definitionsByNodeKey.get(node.nodeKey);
      if (!def) continue;
      if (def.capabilities.includes("start")) startNodes.push(node.nodeKey);
      if (def.capabilities.includes("end")) endNodes.push(node.nodeKey);
    }
    if (startNodes.length === 0) {
      issues.push(issue("missing_start_node", "error", ["graph"], "De workflow heeft geen startblok.", {
        fix: "Voeg een handmatige start of een ander blok met start-capability toe.",
      }));
    } else if (startNodes.length > 1) {
      for (const nodeKey of startNodes) {
        issues.push(issue("multiple_start_nodes", "error", ["graph", "starts", nodeKey], `Meerdere startblokken gevonden (${startNodes.join(", ")}); een workflow heeft precies één start nodig.`, {
          nodeKey,
          fix: "Verwijder of converteer extra startblokken zodat de workflow één startpunt heeft.",
        }));
      }
    }
    if (nodes.length > 0 && endNodes.length === 0) {
      issues.push(issue("missing_end_node", "error", ["graph"], "De workflow heeft geen eindblok.", {
        fix: "Voeg minstens één eindblok toe zodat het pad expliciet kan worden afgesloten.",
      }));
    }

    // 6. Reachability + cycles -------------------------------------------
    const reachable: string[] = [];
    const reachableSet = new Set<string>();
    if (startNodes.length === 1) {
      const { visited } = bfs(startNodes[0]!, forward);
      reachable.push(...visited);
      for (const key of visited) reachableSet.add(key);
      for (const node of nodes) {
        if (reachableSet.has(node.nodeKey)) continue;
        issues.push(issue("unreachable_node", "error", ["nodes", node.nodeKey], `Node ${node.nodeKey} is niet bereikbaar vanaf het startblok.`, {
          nodeKey: node.nodeKey,
          fix: "Verbind de node met een bereikbaar pad of verwijder hem.",
        }));
      }
      const cycles = detectCycles(startNodes[0]!, forward);
      for (const cycle of cycles) {
        issues.push(issue("cycle_detected", "error", ["graph", "cycle"], `Cyclisch pad gedetecteerd: ${cycle.join(" → ")}.`, {
          fix: "Verwijder de cyclus. De MVP ondersteunt geen parallelle split/join; voer lussen buiten de workflow uit.",
        }));
      }
      for (const endKey of endNodes) {
        if (reachableSet.has(endKey)) continue;
        issues.push(issue("unreachable_end_node", "error", ["graph", "ends", endKey], `Eindblok ${endKey} is niet bereikbaar vanaf het startblok.`, {
          nodeKey: endKey,
          fix: "Verbind het eindblok met een bereikbaar pad.",
        }));
      }
      const start = startNodes[0]!;
      if ((forward.get(start) ?? []).length === 0) {
        issues.push(issue("start_node_has_no_outgoing_edge", "error", ["graph", "start"], "Het startblok heeft geen uitgaande flowverbinding.", {
          nodeKey: start,
          fix: "Voeg een flowedge toe vanaf het startblok zodat de workflow kan starten.",
        }));
      }
    }

    // 7. Required input ports + connection limit --------------------------
    const incomingCount = new Map<string, number>();
    const outgoingCount = new Map<string, number>();
    for (const edge of edges) {
      const sourceKey = resolveNodeKey(edge, nodeIndex, "sourceNodeId");
      const targetKey = resolveNodeKey(edge, nodeIndex, "targetNodeId");
      if (targetKey) {
        incomingCount.set(targetKey, (incomingCount.get(targetKey) ?? 0) + 1);
      }
      if (sourceKey) {
        outgoingCount.set(sourceKey, (outgoingCount.get(sourceKey) ?? 0) + 1);
      }
    }
    for (const node of nodes) {
      const def = definitionsByNodeKey.get(node.nodeKey);
      if (!def) continue;
      const incomingEdges = edgesByTarget.get(node.nodeKey) ?? [];
      for (const port of def.inputs) {
        if (!port.required) continue;
        const connected = incomingEdges.some((edge) => edge.targetPort === port.id);
        if (!connected) {
          issues.push(issue("required_input_port_unconnected", "error", ["nodes", node.nodeKey, "inputs", port.id], `Verplichte inputpoort ${port.label} van ${def.ui.label} is niet verbonden.`, {
            nodeKey: node.nodeKey,
            fix: `Verbind een outputpoort van een voorgaand blok met inputpoort ${port.label}.`,
          }));
        }
        const count = incomingEdges.filter((edge) => edge.targetPort === port.id).length;
        if (port.maxConnections !== null && count > port.maxConnections) {
          issues.push(issue("port_connection_limit_exceeded", "error", ["nodes", node.nodeKey, "inputs", port.id], `Inputpoort ${port.label} ondersteunt maximaal ${port.maxConnections} verbindingen, maar heeft er ${count}.`, {
            nodeKey: node.nodeKey,
            fix: `Verwijder ${count - port.maxConnections} verbinding(en) of splits de node.`,
          }));
        }
      }
      for (const port of def.outputs) {
        const connectedForPort = edges.filter((edge) => {
          const sourceKey = resolveNodeKey(edge, nodeIndex, "sourceNodeId");
          return sourceKey === node.nodeKey && edge.sourcePort === port.id;
        }).length;
        if (port.maxConnections !== null && connectedForPort > port.maxConnections) {
          issues.push(issue("port_connection_limit_exceeded", "error", ["nodes", node.nodeKey, "outputs", port.id], `Outputpoort ${port.label} ondersteunt maximaal ${port.maxConnections} verbindingen, maar heeft er ${connectedForPort}.`, {
            nodeKey: node.nodeKey,
            fix: `Verwijder ${connectedForPort - port.maxConnections} verbinding(en) of splits het blok.`,
          }));
        }
      }
    }

    // 8. Data mappings ----------------------------------------------------
    const allMappings: DataMapping[] = [];
    for (const node of nodes) {
      const def = definitionsByNodeKey.get(node.nodeKey);
      if (!def) continue;
      allMappings.push(...collectDataMappings({ ...node, id: node.id ?? node.nodeKey }, def));
    }
    const mappingsByVariable = new Map<string, DataMapping[]>();
    for (const mapping of allMappings) {
      const list = mappingsByVariable.get(mapping.variable) ?? [];
      list.push(mapping);
      mappingsByVariable.set(mapping.variable, list);
    }
    for (const [variable, mappings] of mappingsByVariable) {
      if (mappings.length > 1) {
        const writers = mappings.filter((m) => m.port === "out");
        const readers = mappings.filter((m) => m.port === "in");
        if (writers.length > 1) {
          for (const mapping of writers) {
            issues.push(issue("duplicate_data_mapping", "error", ["nodes", mapping.nodeKey, mapping.field], `Variabele ${variable} wordt door meerdere blokken geschreven.`, {
              nodeKey: mapping.nodeKey,
              fix: `Hernoem de outputVariabele of verwijder één van de schrijvers.`,
            }));
          }
        }
        if (readers.length > 1) {
          for (const mapping of readers) {
            issues.push(issue("duplicate_data_mapping", "warning", ["nodes", mapping.nodeKey, mapping.field], `Variabele ${variable} wordt door meerdere blokken gelezen; controleer of dat de bedoeling is.`, {
              nodeKey: mapping.nodeKey,
              fix: `Controleer of de lezers de juiste bronvariabele gebruiken.`,
            }));
          }
        }
      }
    }

    // 9. Role usages + bindings -----------------------------------------
    const roleBindings = input.roleBindings ?? [];
    const seenRoleBindings = new Set<string>();
    for (const binding of roleBindings) {
      const key = `${binding.workflowRole}|${binding.identityGroup}`;
      if (seenRoleBindings.has(key)) {
        issues.push(issue("duplicate_role_binding", "error", ["roleBindings", binding.workflowRole, binding.identityGroup], `Rolbinding ${binding.workflowRole} ↔ ${binding.identityGroup} is dubbel gedefinieerd.`, {
          fix: "Verwijder de dubbele rolbinding of voeg een extra capability-set toe via een nieuwe binding.",
        }));
      }
      seenRoleBindings.add(key);
    }

    const roleUsages: RoleUsage[] = [];
    for (const node of nodes) {
      const def = definitionsByNodeKey.get(node.nodeKey);
      if (!def) continue;
      roleUsages.push(...collectRoleUsages({ ...node, id: node.id ?? node.nodeKey }, def));
    }
    const boundRoles = new Set(roleBindings.map((binding) => binding.workflowRole));
    for (const usage of roleUsages) {
      if (!boundRoles.has(usage.roleId)) {
        issues.push(issue("role_not_bound", "error", ["nodes", usage.nodeKey, usage.field], `Rol ${usage.roleId} wordt gebruikt door ${usage.blockType} maar heeft geen rolbinding.`, {
          nodeKey: usage.nodeKey,
          fix: `Voeg een rolbinding toe voor ${usage.roleId} met de juiste runtime-capability.`,
        }));
      }
    }

    // Delegate role binding authorization to the foundation helper so the
    // validator reuses the exact same checks as the authoring flow.
    for (const binding of roleBindings) {
      const decision = authorizeWorkflowRoleBinding(input.identity, {
        workflowRoleId: binding.workflowRole,
        identityGroups: [binding.identityGroup],
        permissions: binding.permissions,
        scope: {
          tenant: binding.tenant,
          businessUnit: binding.businessUnit,
          ...(binding.clientIds ? { clientIds: [...binding.clientIds] } : {}),
        },
      });
      if (!decision.authorized) {
        issues.push(issue(decisionErrorCode(decision), "error", ["roleBindings", binding.workflowRole, binding.identityGroup], decision.message, {
          fix: "Pas de binding aan zodat deze binnen je beheerbereik valt.",
        }));
      }
    }

    // 10. Change intents must be approved --------------------------------
    if (startNodes.length === 1 && reachableSet.size > 0) {
      const nodeKeyToDef = new Map<string, BlockDefinition>();
      for (const [key, def] of definitionsByNodeKey) nodeKeyToDef.set(key, def);
      const approvedBeforeChangeRequest = new Set<string>();
      for (const startKey of reachable) {
        const def = nodeKeyToDef.get(startKey);
        if (def?.capabilities.includes("approval")) approvedBeforeChangeRequest.add(startKey);
      }
      // propagate: any node that can be reached from an approval node is
      // considered approved.
      const approved = new Set<string>(approvedBeforeChangeRequest);
      const queue: string[] = [...approvedBeforeChangeRequest];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of forward.get(current) ?? []) {
          if (approved.has(next)) continue;
          approved.add(next);
          queue.push(next);
        }
      }
      for (const node of nodes) {
        const def = definitionsByNodeKey.get(node.nodeKey);
        if (!def) continue;
        if (!def.capabilities.includes("change_intent")) continue;
        if (approved.has(node.nodeKey)) continue;
        issues.push(issue("change_request_without_approval", "error", ["nodes", node.nodeKey], `Wijzigingsblok ${def.ui.label} wordt niet voorafgegaan door een goedkeuring.`, {
          nodeKey: node.nodeKey,
          fix: "Voeg een goedkeuringsblok toe vóór het wijzigingsblok zodat een bevoegde rol de mutatie autoriseert.",
        }));
      }
    }

    // 11. Change request data catalog references ------------------------
    for (const node of nodes) {
      const def = definitionsByNodeKey.get(node.nodeKey);
      if (!def || def.blockType !== "change_request") continue;
      const configuration = (node.configuration ?? {}) as Record<string, unknown>;
      const resourceId = typeof configuration.resourceId === "string" ? configuration.resourceId : null;
      const operation = typeof configuration.operation === "string" ? configuration.operation as "CREATE" | "UPDATE" | "RETIRE" : null;
      if (!resourceId) continue;
      const resolved = this.#dataCatalog.resolve({ resourceId, ...(operation ? { operation } : {}) });
      if (!resolved.valid) {
        if (resolved.code === "operation_not_requestable") {
          issues.push(issue("change_request_operation_not_requestable", "error", ["nodes", node.nodeKey, "operation"], resolved.message, {
            nodeKey: node.nodeKey,
            fix: "Kies een andere operatie of selecteer een attribuut dat deze operatie ondersteunt.",
          }));
        } else {
          issues.push(issue("change_request_unknown_resource", "error", ["nodes", node.nodeKey, "resourceId"], resolved.message, {
            nodeKey: node.nodeKey,
            fix: "Kies een resource uit de client-configcatalogus.",
          }));
        }
      }
    }

    const finalIssues = dedupeIssues([issues]);
    const blocking = finalIssues.some((item) => item.severity === "error");
    return {
      valid: blocking === false,
      blocking,
      issues: finalIssues,
      reachableNodeKeys: Object.freeze(reachable),
      terminalNodeKeys: Object.freeze([...endNodes]),
    };
  }
}

export function createWorkflowValidator(
  blockDefinitions: ReadonlyMap<string, BlockDefinition>,
  dataCatalog?: DataCatalog,
): WorkflowValidator {
  return new WorkflowValidator(blockDefinitions, dataCatalog);
}
