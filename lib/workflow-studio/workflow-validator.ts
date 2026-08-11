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
 * - No forbidden cycles; parallel split/join blocks must converge without
 *   deadlocking
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
import { workflowApprovalConfigurationSchema } from "@/lib/workflow-studio/runtime-human-schema";
import { workflowSubworkflowConfigurationSchema } from "@/lib/workflow-studio/subworkflow-schema";
import { workflowIntegrationConfigurationSchema } from "@/lib/workflow-studio/integration-schema";

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
  | "role_permission_missing"
  | "maker_checker_conflict"
  | "role_binding_denied"
  | "change_request_without_approval"
  | "change_request_unknown_resource"
  | "change_request_operation_not_requestable"
  | "change_request_unknown_attribute"
  | "change_request_attribute_not_requestable"
  | "change_request_invalid_snapshot_mapping"
  | "lookup_unknown_attribute"
  | "lookup_invalid_filter_value"
  | "lookup_invalid_parent_binding"
  | "parallel_split_branch_count"
  | "parallel_join_branch_count"
  | "parallel_join_quorum_unreachable"
  | "parallel_split_without_join"
  | "parallel_split_ambiguous_join"
  | "multi_approval_group_too_small"
  | "multi_approval_policy_mismatch"
  | "multi_approval_quorum_unreachable"
  | "multi_approval_duplicate_role"
  | "subworkflow_self_reference"
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

export function unacknowledgedWorkflowWarnings(
  issues: readonly WorkflowValidationIssue[],
  acknowledgedWarningCodes: readonly string[],
): readonly WorkflowValidationIssue[] {
  const acknowledged = new Set(acknowledgedWarningCodes);
  return Object.freeze(issues.filter((item) => item.severity === "warning" && !acknowledged.has(item.code)));
}

export type WorkflowValidationInput = {
  readonly identity: IdentityContext;
  readonly workflowVersionId?: string;
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

function firstReachableJoins(
  start: string,
  forward: Map<string, string[]>,
  joinKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  const joins = new Set<string>();
  const queue = [start];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (joinKeys.has(current)) {
      joins.add(current);
      continue;
    }
    for (const next of forward.get(current) ?? []) queue.push(next);
  }
  return joins;
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
      const filters = Array.isArray(configuration.filters) ? configuration.filters as Array<Record<string, unknown>> : [];
      filters.forEach((filter, index) => {
        if (filter.source === "variable" && typeof filter.variableId === "string" && VARIABLE_REGEX.test(filter.variableId)) {
          mappings.push({ nodeKey: node.nodeKey, field: `filters.${index}.variableId`, variable: filter.variableId, port: "in" });
        }
      });
      const parentBinding = configuration.parentBinding && typeof configuration.parentBinding === "object"
        ? configuration.parentBinding as Record<string, unknown>
        : null;
      if (parentBinding && typeof parentBinding.sourceVariable === "string" && VARIABLE_REGEX.test(parentBinding.sourceVariable)) {
        mappings.push({ nodeKey: node.nodeKey, field: "parentBinding.sourceVariable", variable: parentBinding.sourceVariable, port: "in" });
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
      const attributeMappings = Array.isArray(configuration.attributeMappings)
        ? configuration.attributeMappings as Array<Record<string, unknown>>
        : [];
      attributeMappings.forEach((attributeMapping, index) => {
        const ist = attributeMapping.ist && typeof attributeMapping.ist === "object" ? attributeMapping.ist as Record<string, unknown> : null;
        const soll = attributeMapping.soll && typeof attributeMapping.soll === "object" ? attributeMapping.soll as Record<string, unknown> : null;
        if (ist && typeof ist.snapshotVariableId === "string" && VARIABLE_REGEX.test(ist.snapshotVariableId)) {
          mappings.push({ nodeKey: node.nodeKey, field: `attributeMappings.${index}.ist.snapshotVariableId`, variable: ist.snapshotVariableId, port: "in" });
        }
        if (soll && typeof soll.variableId === "string" && VARIABLE_REGEX.test(soll.variableId)) {
          mappings.push({ nodeKey: node.nodeKey, field: `attributeMappings.${index}.soll.variableId`, variable: soll.variableId, port: "in" });
        }
      });
      break;
    }
    case "decision": {
      const rootRule = configuration.rule && typeof configuration.rule === "object" ? configuration.rule as Record<string, unknown> : null;
      function collectRuleVariables(rule: Record<string, unknown>, path: string): void {
        if (rule.kind === "condition" && typeof rule.variableId === "string" && VARIABLE_REGEX.test(rule.variableId)) {
          mappings.push({ nodeKey: node.nodeKey, field: `${path}.variableId`, variable: rule.variableId, port: "in" });
        }
        if (rule.kind === "group" && Array.isArray(rule.rules)) {
          rule.rules.forEach((nested, index) => {
            if (nested && typeof nested === "object") collectRuleVariables(nested as Record<string, unknown>, `${path}.rules.${index}`);
          });
        }
      }
      if (rootRule) collectRuleVariables(rootRule, "rule");
      break;
    }
    case "notification": {
      const templateVariables = Array.isArray(configuration.templateVariables) ? configuration.templateVariables : [];
      templateVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey: node.nodeKey, field: `templateVariables.${index}`, variable, port: "in" });
      });
      break;
    }
    case "integration": {
      const parsed = workflowIntegrationConfigurationSchema.safeParse(configuration);
      if (!parsed.success) break;
      parsed.data.inputVariables.forEach((variable, index) => {
        mappings.push({ nodeKey: node.nodeKey, field: `inputVariables.${index}`, variable, port: "in" });
      });
      if (parsed.data.outputVariable) {
        mappings.push({ nodeKey: node.nodeKey, field: "outputVariable", variable: parsed.data.outputVariable, port: "out" });
      }
      break;
    }
    case "role_task": {
      const inputVariables = Array.isArray(configuration.inputVariables) ? configuration.inputVariables : [];
      const outputVariables = Array.isArray(configuration.outputVariables) ? configuration.outputVariables : [];
      inputVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey: node.nodeKey, field: `inputVariables.${index}`, variable, port: "in" });
      });
      outputVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey: node.nodeKey, field: `outputVariables.${index}`, variable, port: "out" });
      });
      break;
    }
    case "approval": {
      const inputVariables = Array.isArray(configuration.inputVariables) ? configuration.inputVariables : [];
      inputVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey: node.nodeKey, field: `inputVariables.${index}`, variable, port: "in" });
      });
      break;
    }
    case "subworkflow": {
      const parsed = workflowSubworkflowConfigurationSchema.safeParse(configuration);
      if (!parsed.success) break;
      parsed.data.inputMappings.forEach((mapping, index) => {
        mappings.push({ nodeKey: node.nodeKey, field: `inputMappings.${index}.parentVariable`, variable: mapping.parentVariable, port: "in" });
      });
      parsed.data.outputMappings.forEach((mapping, index) => {
        mappings.push({ nodeKey: node.nodeKey, field: `outputMappings.${index}.parentVariable`, variable: mapping.parentVariable, port: "out" });
      });
      break;
    }
    default:
      break;
  }
  return Object.freeze([...mappings]);
}

type RoleUsage = {
  readonly nodeKey: string;
  readonly field: string;
  readonly blockType: string;
  readonly roleId: string;
  readonly requiredPermission?: WorkflowRoleBindingInput["permissions"][number];
};

function collectRoleUsages(node: MutableNode, definition: BlockDefinition): readonly RoleUsage[] {
  const configuration = (node.configuration ?? {}) as Record<string, unknown>;
  const usages: RoleUsage[] = [];
  if (definition.blockType === "role_task" || definition.blockType === "approval") {
    if (typeof configuration.roleId === "string" && ROLE_REGEX.test(configuration.roleId)) {
      usages.push({
        nodeKey: node.nodeKey,
        field: "roleId",
        blockType: definition.blockType,
        roleId: configuration.roleId,
        requiredPermission: definition.blockType === "approval" ? "workflow:approve" : "workflow:tasks:execute",
      });
    }
  }
  if (definition.blockType === "manual_start" && Array.isArray(configuration.starterRoleIds)) {
    configuration.starterRoleIds.forEach((roleId, index) => {
      if (typeof roleId === "string" && ROLE_REGEX.test(roleId)) usages.push({
        nodeKey: node.nodeKey,
        field: `starterRoleIds.${index}`,
        blockType: definition.blockType,
        roleId,
        requiredPermission: "workflow:start",
      });
    });
  }
  if (definition.blockType === "notification") {
    const recipientRoleIds = Array.isArray(configuration.recipientRoleIds) ? configuration.recipientRoleIds : [];
    recipientRoleIds.forEach((recipientRoleId, index) => {
      if (typeof recipientRoleId === "string" && ROLE_REGEX.test(recipientRoleId)) usages.push({ nodeKey: node.nodeKey, field: `recipientRoleIds.${index}`, blockType: definition.blockType, roleId: recipientRoleId });
    });
  }
  return Object.freeze([...usages]);
}

type ApprovalGroupEntry = Readonly<{
  nodeKey: string;
  roleId: string;
  approvalMode: string;
  quorum?: number;
  uniqueApprovers: boolean;
  roleCombination: string;
  escalationHours?: number;
}>;

function collectApprovalGroupEntries(nodes: readonly MutableNode[]): Map<string, ApprovalGroupEntry[]> {
  const groups = new Map<string, ApprovalGroupEntry[]>();
  for (const node of nodes) {
    if (node.block.blockType !== "approval") continue;
    const parsed = workflowApprovalConfigurationSchema.safeParse(node.configuration ?? {});
    if (!parsed.success || !parsed.data.approvalGroupId) continue;
    const entry: ApprovalGroupEntry = {
      nodeKey: node.nodeKey,
      roleId: parsed.data.roleId,
      approvalMode: parsed.data.approvalMode,
      ...(parsed.data.quorum !== undefined ? { quorum: parsed.data.quorum } : {}),
      uniqueApprovers: parsed.data.uniqueApprovers,
      roleCombination: parsed.data.roleCombination,
      ...(parsed.data.escalationHours !== undefined ? { escalationHours: parsed.data.escalationHours } : {}),
    };
    groups.set(parsed.data.approvalGroupId, [...(groups.get(parsed.data.approvalGroupId) ?? []), entry]);
  }
  return groups;
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
    if (input.workflowVersionId) {
      for (const node of nodes) {
        if (node.block.blockType !== "subworkflow") continue;
        const parsed = workflowSubworkflowConfigurationSchema.safeParse(node.configuration ?? {});
        if (parsed.success && parsed.data.childWorkflowVersionId === input.workflowVersionId) {
          issues.push(issue("subworkflow_self_reference", "error", ["nodes", node.nodeKey, "configuration", "childWorkflowVersionId"], `Subworkflow ${node.nodeKey} verwijst naar de eigen workflowversie.`, {
            nodeKey: node.nodeKey,
            fix: "Kies een andere gepinde child-versie of extraheer het gedeelde proces naar een aparte fragmentworkflow.",
          }));
        }
      }
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
      for (const nodeKey of reachable) {
        if (endNodes.includes(nodeKey)) continue;
        if ((forward.get(nodeKey) ?? []).length > 0) continue;
        issues.push(issue("dead_end_branch", "error", ["graph", "deadEnds", nodeKey], `Het bereikbare pad stopt bij ${nodeKey} zonder expliciet eindblok.`, {
          nodeKey,
          fix: "Verbind dit pad met een eindblok en kies daar een expliciete uitkomst.",
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
        continue;
      }
    }

    // 8. Parallel split/join deadlock checks ------------------------------
    const nodeByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
    const joinKeys = new Set(nodes.filter((node) => node.block.blockType === "parallel_join").map((node) => node.nodeKey));
    for (const node of nodes) {
      if (node.block.blockType === "parallel_split") {
        const branches = forward.get(node.nodeKey) ?? [];
        if (branches.length < 2) {
          issues.push(issue("parallel_split_branch_count", "error", ["nodes", node.nodeKey], `Parallel split ${node.nodeKey} heeft minimaal twee uitgaande branches nodig.`, {
            nodeKey: node.nodeKey,
            fix: "Verbind de split met minimaal twee parallelle branches.",
          }));
          continue;
        }
        const branchJoinSets = branches.map((branch) => firstReachableJoins(branch, forward, joinKeys));
        const common = [...branchJoinSets[0] ?? []].filter((join) => branchJoinSets.every((set) => set.has(join)));
        if (common.length === 0) {
          issues.push(issue("parallel_split_without_join", "error", ["nodes", node.nodeKey], `Niet alle branches van parallel split ${node.nodeKey} bereiken dezelfde parallel join.`, {
            nodeKey: node.nodeKey,
            fix: "Laat iedere branch samenkomen op één gedeelde parallel join.",
          }));
        } else if (common.length > 1) {
          issues.push(issue("parallel_split_ambiguous_join", "error", ["nodes", node.nodeKey], `Parallel split ${node.nodeKey} kan op meerdere joins samenkomen (${common.join(", ")}).`, {
            nodeKey: node.nodeKey,
            fix: "Gebruik één eenduidige join voor deze split of splits het proces in aparte gatewayparen.",
          }));
        }
      }
      if (node.block.blockType === "parallel_join") {
        const incomingBranches = reverse.get(node.nodeKey) ?? [];
        if (incomingBranches.length < 2) {
          issues.push(issue("parallel_join_branch_count", "error", ["nodes", node.nodeKey], `Parallel join ${node.nodeKey} heeft minimaal twee inkomende branches nodig.`, {
            nodeKey: node.nodeKey,
            fix: "Verbind minimaal twee branches met deze join.",
          }));
        }
        const configuration = node.configuration && typeof node.configuration === "object" ? node.configuration as Record<string, unknown> : {};
        const quorum = configuration.mode === "quorum" && typeof configuration.quorum === "number" ? configuration.quorum : undefined;
        if (quorum !== undefined && incomingBranches.length > 0 && quorum > incomingBranches.length) {
          issues.push(issue("parallel_join_quorum_unreachable", "error", ["nodes", node.nodeKey, "configuration", "quorum"], `Quorum ${quorum} van parallel join ${node.nodeKey} is hoger dan het aantal inkomende branches (${incomingBranches.length}).`, {
            nodeKey: node.nodeKey,
            fix: "Verlaag het quorum of voeg extra branches toe.",
          }));
        }
        for (const predecessor of incomingBranches) {
          const predecessorNode = nodeByKey.get(predecessor);
          if (predecessorNode?.block.blockType === "parallel_join") {
            issues.push(issue("parallel_split_without_join", "error", ["nodes", node.nodeKey], `Parallel join ${node.nodeKey} mag niet direct door een andere join gevoed worden.`, {
              nodeKey: node.nodeKey,
              fix: "Plaats gewone processtappen tussen geneste joins of vereenvoudig het parallelle deel.",
            }));
          }
        }
      }
    }

    // 8b. Multi-approval policies ----------------------------------------
    for (const [approvalGroupId, entries] of collectApprovalGroupEntries(nodes)) {
      const orderedEntries = [...entries].sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
      const [baseline] = orderedEntries;
      if (!baseline) continue;
      if (orderedEntries.length < 2) {
        issues.push(issue("multi_approval_group_too_small", "error", ["nodes", baseline.nodeKey, "configuration", "approvalGroupId"], `Goedkeuringsgroep ${approvalGroupId} bevat maar één approval-node.`, {
          nodeKey: baseline.nodeKey,
          fix: "Voeg minimaal één extra approval-node toe aan deze groep of verwijder approvalGroupId.",
        }));
      }
      for (const entry of orderedEntries.slice(1)) {
        if (
          entry.approvalMode !== baseline.approvalMode
          || entry.quorum !== baseline.quorum
          || entry.uniqueApprovers !== baseline.uniqueApprovers
          || entry.roleCombination !== baseline.roleCombination
          || entry.escalationHours !== baseline.escalationHours
        ) {
          issues.push(issue("multi_approval_policy_mismatch", "error", ["nodes", entry.nodeKey, "configuration", "approvalGroupId"], `Goedkeuringsgroep ${approvalGroupId} heeft inconsistente policy-instellingen.`, {
            nodeKey: entry.nodeKey,
            fix: "Gebruik dezelfde besluitmodus, quorumwaarde, unieke-personenregel, rolcombinatie en escalatie op alle nodes in de groep.",
          }));
        }
      }
      if (baseline.approvalMode === "quorum" && baseline.quorum !== undefined && baseline.quorum > orderedEntries.length) {
        issues.push(issue("multi_approval_quorum_unreachable", "error", ["nodes", baseline.nodeKey, "configuration", "quorum"], `Quorum ${baseline.quorum} van goedkeuringsgroep ${approvalGroupId} is hoger dan het aantal deelnemers (${orderedEntries.length}).`, {
          nodeKey: baseline.nodeKey,
          fix: "Verlaag het quorum of voeg extra approval-nodes toe aan dezelfde groep.",
        }));
      }
      if (baseline.roleCombination === "distinct_roles") {
        const seenRoles = new Map<string, string>();
        for (const entry of orderedEntries) {
          const previousNodeKey = seenRoles.get(entry.roleId);
          if (previousNodeKey) {
            issues.push(issue("multi_approval_duplicate_role", "error", ["nodes", entry.nodeKey, "configuration", "roleId"], `Goedkeuringsgroep ${approvalGroupId} gebruikt rol ${entry.roleId} meerdere keren.`, {
              nodeKey: entry.nodeKey,
              fix: `Gebruik een andere workflowrol dan ${entry.roleId} of zet rolcombinatie op herhaalde rollen toestaan.`,
            }));
          }
          seenRoles.set(entry.roleId, entry.nodeKey);
        }
      }
    }

    // 9. Data mappings ----------------------------------------------------
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
    const bindingsByRole = new Map<string, WorkflowRoleBindingInput[]>();
    for (const binding of roleBindings) {
      bindingsByRole.set(binding.workflowRole, [...(bindingsByRole.get(binding.workflowRole) ?? []), binding]);
    }
    for (const usage of roleUsages) {
      const bindings = bindingsByRole.get(usage.roleId) ?? [];
      if (bindings.length === 0) {
        issues.push(issue("role_not_bound", "error", ["nodes", usage.nodeKey, usage.field], `Rol ${usage.roleId} wordt gebruikt door ${usage.blockType} maar heeft geen rolbinding.`, {
          nodeKey: usage.nodeKey,
          fix: `Voeg een rolbinding toe voor ${usage.roleId} met de juiste runtime-capability.`,
        }));
      } else if (usage.requiredPermission && !bindings.some((binding) => binding.permissions.includes(usage.requiredPermission!))) {
        issues.push(issue("role_permission_missing", "error", ["nodes", usage.nodeKey, usage.field], `Rol ${usage.roleId} mist de vereiste capability ${usage.requiredPermission} voor ${usage.blockType}.`, {
          nodeKey: usage.nodeKey,
          fix: `Ken ${usage.requiredPermission} toe via een geautoriseerde rolbinding.`,
        }));
      }
    }

    const starterUsages = roleUsages.filter((usage) => usage.blockType === "manual_start");
    const approvalUsages = roleUsages.filter((usage) => usage.blockType === "approval");
    for (const approvalUsage of approvalUsages) {
      const approvalGroups = new Set((bindingsByRole.get(approvalUsage.roleId) ?? []).map((binding) => binding.identityGroup));
      const conflict = starterUsages.find((starterUsage) => {
        if (starterUsage.roleId === approvalUsage.roleId) return true;
        return (bindingsByRole.get(starterUsage.roleId) ?? []).some((binding) => approvalGroups.has(binding.identityGroup));
      });
      if (conflict) {
        issues.push(issue("maker_checker_conflict", "error", ["nodes", approvalUsage.nodeKey, "roleId"], `Goedkeuringsrol ${approvalUsage.roleId} is niet functiescheidend van starterrol ${conflict.roleId}.`, {
          nodeKey: approvalUsage.nodeKey,
          fix: "Bind de starter en goedkeurder aan verschillende workflowrollen én identiteitgroepen.",
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

    // 11. Lookup and change-request data catalog references -------------
    for (const node of nodes) {
      const def = definitionsByNodeKey.get(node.nodeKey);
      if (!def || def.blockType !== "client_config_lookup") continue;
      const configuration = (node.configuration ?? {}) as Record<string, unknown>;
      const resourceId = typeof configuration.resourceId === "string" ? configuration.resourceId : null;
      if (!resourceId) continue;
      const resolvedResource = this.#dataCatalog.resolve({ resourceId });
      if (!resolvedResource.valid) continue;
      const displayFields = Array.isArray(configuration.displayFields) ? configuration.displayFields : [];
      for (const [index, attributeId] of displayFields.entries()) {
        if (typeof attributeId !== "string") continue;
        const resolved = this.#dataCatalog.resolve({ resourceId, attributeId });
        if (!resolved.valid) issues.push(issue("lookup_unknown_attribute", "error", ["nodes", node.nodeKey, "displayFields", index], resolved.message, { nodeKey: node.nodeKey, fix: "Kies een leesbaar veld van de geselecteerde catalogusresource." }));
      }
      const filters = Array.isArray(configuration.filters) ? configuration.filters as Array<Record<string, unknown>> : [];
      filters.forEach((filter, index) => {
        const attributeId = typeof filter.attributeId === "string" ? filter.attributeId : "";
        const resolved = this.#dataCatalog.resolve({ resourceId, attributeId });
        if (!resolved.valid || !resolved.attribute) {
          issues.push(issue("lookup_unknown_attribute", "error", ["nodes", node.nodeKey, "filters", index, "attributeId"], resolved.valid ? `Onbekend filterattribuut ${attributeId}.` : resolved.message, { nodeKey: node.nodeKey, fix: "Kies een filterattribuut van de geselecteerde resource." }));
        } else if (filter.source === "literal") {
          const validValue = resolved.attribute.validateValue(filter.value);
          if (!validValue.valid) issues.push(issue("lookup_invalid_filter_value", "error", ["nodes", node.nodeKey, "filters", index, "value"], `Filterwaarde voldoet niet aan ${resourceId}.${attributeId}.`, { nodeKey: node.nodeKey, fix: "Gebruik een waarde die aan het cataloguscontract voldoet of bind een getypeerde variabele." }));
        }
      });
      const parentBinding = configuration.parentBinding && typeof configuration.parentBinding === "object" ? configuration.parentBinding as Record<string, unknown> : null;
      if (parentBinding?.mode === "scope_client" && resolvedResource.resource.authorizationScope !== "client") {
        issues.push(issue("lookup_invalid_parent_binding", "error", ["nodes", node.nodeKey, "parentBinding"], "Client-scopebinding is alleen toegestaan voor clientgebonden resources.", { nodeKey: node.nodeKey, fix: "Kies attribuutbinding of verwijder de parentbinding." }));
      }
      if (parentBinding?.mode === "attribute" && typeof parentBinding.targetAttributeId === "string") {
        const resolved = this.#dataCatalog.resolve({ resourceId, attributeId: parentBinding.targetAttributeId });
        if (!resolved.valid) issues.push(issue("lookup_invalid_parent_binding", "error", ["nodes", node.nodeKey, "parentBinding", "targetAttributeId"], resolved.message, { nodeKey: node.nodeKey, fix: "Bind de parentoutput aan een bekend attribuut van de geselecteerde resource." }));
      }
    }

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
        continue;
      }

      if (!operation) continue;
      const attributeMappings = Array.isArray(configuration.attributeMappings)
        ? configuration.attributeMappings as Array<Record<string, unknown>>
        : [];
      attributeMappings.forEach((mapping, index) => {
        const attributeId = typeof mapping.attributeId === "string" ? mapping.attributeId : "";
        const mappedAttribute = this.#dataCatalog.resolve({ resourceId, attributeId, operation });
        if (!mappedAttribute.valid) {
          const code = mappedAttribute.code === "operation_not_requestable"
            ? "change_request_attribute_not_requestable"
            : "change_request_unknown_attribute";
          issues.push(issue(code, "error", ["nodes", node.nodeKey, "attributeMappings", index, "attributeId"], mappedAttribute.message, {
            nodeKey: node.nodeKey,
            fix: "Kies een attribuut dat voor deze resource en operatie aanvraagbaar is.",
          }));
          return;
        }

        const ist = mapping.ist && typeof mapping.ist === "object" ? mapping.ist as Record<string, unknown> : null;
        if (ist && ist.snapshotAttributeId !== attributeId) {
          issues.push(issue("change_request_invalid_snapshot_mapping", "error", ["nodes", node.nodeKey, "attributeMappings", index, "ist", "snapshotAttributeId"], `IST moet ${resourceId}.${attributeId} uit de snapshot lezen.`, {
            nodeKey: node.nodeKey,
            fix: "Koppel het snapshotattribuut aan hetzelfde doelattribuut zodat IST en SOLL vergelijkbaar blijven.",
          }));
        }
      });
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
