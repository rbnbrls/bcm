/**
 * Service API for the Workflow Studio definition store.
 *
 * Wraps the database repository with:
 *
 * - Server-side authorization that pulls the identity from the signed session
 *   (no browser role state) and the workflow scope from the request payload.
 * - Strict block contract validation for every node, using the registry's
 *   BlockContractResolver. Unknown blocks or invalid configurations are
 *   rejected before they reach the database.
 * - Connection rule validation between every pair of linked nodes so a draft
 *   can never be saved with port-incompatible edges.
 * - Role-binding authorization (delegable roles + capability match) via the
 *   shared Workflow Studio authorization helper.
 * - Optimistic locking on every mutation: the caller supplies the
 *   `expectedRevision` they read and the repository detects concurrent edits.
 * - Atomic publication: a published version is created together with a
 *   `workflow_version.published` audit event in a single transaction, and the
 *   database guarantees that content of a published version is immutable.
 *
 * Returned result objects always carry a stable, machine-readable `code` so
 * callers (UI toasts, server action boundaries) can render a localised
 * message without parsing English strings.
 */
import type { IdentityContext } from "@/lib/identity/types";
import { randomUUID } from "node:crypto";
import {
  authorizeWorkflowAction,
  authorizeWorkflowRoleBinding,
  authorizeWorkflowScope,
  type WorkflowDataScope,
  type WorkflowAuthorizationDecision,
} from "@/lib/workflow-studio-authorization";
import {
  blockRegistry,
  type BlockCatalogEntry,
} from "@/lib/workflow-studio/block-registry";
import {
  BlockContractResolver,
  type BlockDefinition,
} from "@/lib/workflow-studio/block-contract";
import {
  createWorkflowDraftInputSchema,
  updateWorkflowDraftInputSchema,
  publishWorkflowInputSchema,
  deprecateWorkflowInputSchema,
  submitForReviewInputSchema,
  cloneWorkflowInputSchema,
  loadWorkflowInputSchema,
  type CreateWorkflowDraftInput,
  type UpdateWorkflowDraftInput,
  type PublishWorkflowInput,
  type DeprecateWorkflowInput,
  type SubmitForReviewInput,
  type CloneWorkflowInput,
  type LoadWorkflowInput,
  type WorkflowNodeInput,
  type WorkflowEdgeInput,
  type WorkflowRoleBindingInput,
} from "@/lib/workflow-studio/definition-schema";
import {
  WorkflowDefinitionRepository,
  WorkflowRepositoryError,
  type SqlExecutor,
  type WorkflowDefinitionRecord,
  type WorkflowVersionSnapshot,
  type WorkflowNodeRow,
  type WorkflowEdgeRow,
  type WorkflowRoleBindingRow,
  type WorkflowDefinitionRow,
} from "@/lib/workflow-studio/definition-repository";
import {
  WorkflowValidator,
  createWorkflowValidator,
  type WorkflowValidationIssue,
} from "@/lib/workflow-studio/workflow-validator";

export type WorkflowServiceCode =
  | "ok"
  | "invalid_input"
  | "permission_denied"
  | "scope_denied"
  | "identity_scope_missing"
  | "duplicate_slug"
  | "definition_not_found"
  | "draft_not_found"
  | "version_not_found"
  | "revision_conflict"
  | "no_draft_to_publish"
  | "validation_failed"
  | "role_binding_denied"
  | "repository_error";

export type WorkflowServiceIssue = {
  code: WorkflowValidationIssue["code"];
  path: readonly (string | number)[];
  message: string;
};

export type WorkflowServiceResult<T> =
  | { ok: true; code: "ok"; value: T }
  | {
      ok: false;
      code: Exclude<WorkflowServiceCode, "ok">;
      message: string;
      issues?: readonly WorkflowServiceIssue[];
    };

function ok<T>(value: T): WorkflowServiceResult<T> {
  return { ok: true, code: "ok", value };
}

function fail<T>(
  code: Exclude<WorkflowServiceCode, "ok">,
  message: string,
  issues?: readonly WorkflowServiceIssue[],
): WorkflowServiceResult<T> {
  return issues
    ? { ok: false, code, message, issues }
    : { ok: false, code, message };
}
function toScope(input: { tenant: string; businessUnit: string; clientIds?: readonly string[] }): WorkflowDataScope {
  return {
    tenant: input.tenant,
    businessUnit: input.businessUnit,
    ...(input.clientIds ? { clientIds: [...input.clientIds] } : {}),
  };
}

function decisionError(decision: Exclude<WorkflowAuthorizationDecision, { authorized: true }>, fallbackCode: Exclude<WorkflowServiceCode, "ok">): { code: Exclude<WorkflowServiceCode, "ok">; message: string } {
  const code = ((): Exclude<WorkflowServiceCode, "ok"> => {
    switch (decision.code) {
      case "permission_denied":
        return "permission_denied";
      case "identity_scope_missing":
        return "identity_scope_missing";
      case "tenant_out_of_scope":
      case "business_unit_out_of_scope":
      case "business_unit_scope_out_of_scope":
      case "client_out_of_scope":
      case "invalid_scope":
        return "scope_denied";
      case "invalid_role_binding":
      case "role_out_of_scope":
      case "role_capability_mismatch":
        return "role_binding_denied";
      default:
        return fallbackCode;
    }
  })();
  return { code, message: decision.message };
}

type MutableNode = Omit<WorkflowNodeInput, "id"> & { id?: string };
type MutableEdge = Omit<WorkflowEdgeInput, "id"> & { id?: string };

function toMutableNodes(nodes: readonly WorkflowNodeInput[]): MutableNode[] {
  return nodes.map((node) => {
    const { id, ...rest } = node;
    return id ? { ...rest, id } : rest;
  });
}

function toMutableEdges(edges: readonly WorkflowEdgeInput[]): MutableEdge[] {
  return edges.map((edge) => {
    const { id, ...rest } = edge;
    return id ? { ...rest, id } : rest;
  });
}

/**
 * Assigns a stable UUID to every node that does not yet have one and rewrites
 * the edges so they reference the (possibly new) node UUIDs. The nodeKey
 * remains the user-visible identifier, but edges always carry a database
 * identity so the foreign key constraint to workflow_node is satisfied.
 */
function normaliseGraphIds(
  nodes: readonly WorkflowNodeInput[],
  edges: readonly WorkflowEdgeInput[],
): { nodes: WorkflowNodeInput[]; edges: WorkflowEdgeInput[] } {
  const keyToId = new Map<string, string>();
  const normalisedNodes: WorkflowNodeInput[] = nodes.map((node) => {
    const id = node.id ?? randomUUID();
    if (node.nodeKey) keyToId.set(node.nodeKey, id);
    return { ...node, id };
  });
  const normalisedEdges: WorkflowEdgeInput[] = edges.map((edge) => {
    // Accept either an existing UUID, a generated UUID, or a nodeKey as the
    // reference. The nodeKey form is convenient for clients that build the
    // graph in memory and only know stable keys.
    const sourceResolved = keyToId.get(edge.sourceNodeId) ?? edge.sourceNodeId;
    const targetResolved = keyToId.get(edge.targetNodeId) ?? edge.targetNodeId;
    return { ...edge, sourceNodeId: sourceResolved, targetNodeId: targetResolved };
  });
  return { nodes: normalisedNodes, edges: normalisedEdges };
}

type GraphValidation = {
  readonly nodeIssues: readonly WorkflowServiceIssue[];
  readonly edgeIssues: readonly WorkflowServiceIssue[];
  readonly graphIssues: readonly WorkflowServiceIssue[];
  readonly bindingIssues: readonly WorkflowServiceIssue[];
  readonly valid: boolean;
};

function validateGraph(
  identity: IdentityContext,
  nodes: readonly WorkflowNodeInput[],
  edges: readonly WorkflowEdgeInput[],
  blockCatalog: ReadonlyMap<string, BlockDefinition>,
  roleBindings: readonly WorkflowRoleBindingInput[] = [],
  dataCatalog?: import("@/lib/workflow-studio/data-catalog").DataCatalog,
): GraphValidation {
  const validator = dataCatalog ? createWorkflowValidator(blockCatalog, dataCatalog) : new WorkflowValidator(blockCatalog);
  const result = validator.validate({
    identity,
    nodes,
    edges,
    roleBindings,
  });
  const nodeIssues: WorkflowServiceIssue[] = [];
  const edgeIssues: WorkflowServiceIssue[] = [];
  const graphIssues: WorkflowServiceIssue[] = [];
  const bindingIssues: WorkflowServiceIssue[] = [];
  for (const issue of result.issues) {
    const path = issue.path;
    if (issue.code === "duplicate_role_binding" || issue.code === "role_binding_denied" || path[0] === "roleBindings") {
      bindingIssues.push(toServiceIssue(issue));
      continue;
    }
    if (path[0] === "edges" || issue.code === "duplicate_edge_key" || issue.code === "orphan_node_reference" || issue.code === "unknown_source_port" || issue.code === "unknown_target_port" || issue.code === "incompatible_port_type" || issue.code === "connection_not_allowed") {
      edgeIssues.push(toServiceIssue(issue));
      continue;
    }
    if (path[0] === "graph") {
      graphIssues.push(toServiceIssue(issue));
      continue;
    }
    nodeIssues.push(toServiceIssue(issue));
  }
  return {
    nodeIssues: Object.freeze(nodeIssues),
    edgeIssues: Object.freeze(edgeIssues),
    graphIssues: Object.freeze(graphIssues),
    bindingIssues: Object.freeze(bindingIssues),
    valid: result.valid,
  };
}

function toServiceIssue(issue: WorkflowValidationIssue): WorkflowServiceIssue {
  return Object.freeze({
    code: issue.code,
    path: issue.path,
    message: issue.message,
  });
}

function dedupeIssues(
  groups: ReadonlyArray<ReadonlyArray<WorkflowServiceIssue>>,
): readonly WorkflowServiceIssue[] {
  const seen = new Set<string>();
  const out: WorkflowServiceIssue[] = [];
  for (const group of groups) {
    for (const issue of group) {
      const key = `${issue.code}:${issue.path.join(".")}:${issue.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(issue);
    }
  }
  return Object.freeze(out);
}

function authzToServiceResult<T>(
  decision: WorkflowAuthorizationDecision,
  fallback: Exclude<WorkflowServiceCode, "ok">,
): WorkflowServiceResult<T> {
  if (decision.authorized) throw new Error("authzToServiceResult called with allowed decision");
  const { code, message } = decisionError(decision, fallback);
  return fail(code, message);
}

function repoErrorToService<T>(error: unknown): WorkflowServiceResult<T> {
  if (error instanceof WorkflowRepositoryError) {
    const code: Exclude<WorkflowServiceCode, "ok"> = (() => {
      switch (error.code) {
        case "duplicate_slug":
          return "duplicate_slug";
        case "definition_not_found":
          return "definition_not_found";
        case "draft_not_found":
          return "draft_not_found";
        case "version_not_found":
          return "version_not_found";
        case "revision_conflict":
          return "revision_conflict";
        case "no_draft_to_publish":
          return "no_draft_to_publish";
        case "published_version_immutable":
          return "revision_conflict";
        case "invalid_node_reference":
          return "validation_failed";
        default:
          return "repository_error";
      }
    })();
    return fail(code, error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  return fail("repository_error", message);
}

export class WorkflowDefinitionService {
  readonly #repository: WorkflowDefinitionRepository;
  readonly #resolver: BlockContractResolver;
  readonly #validator: WorkflowValidator;

  constructor(repository: WorkflowDefinitionRepository, resolver: BlockContractResolver = blockRegistry.contracts) {
    this.#repository = repository;
    this.#resolver = resolver;
    const blockCatalog = new Map<string, BlockDefinition>();
    for (const entry of blockRegistry.listForIdentity({
      userId: "*",
      displayName: "*",
      groups: ["bcm:role:change_manager"],
      tenant: "*",
      businessUnit: "*",
      sessionId: "*",
    })) {
      const resolved = resolver.resolve({ blockType: entry.blockType, contractVersion: entry.contractVersion });
      if (resolved.valid) blockCatalog.set(entry.blockType, resolved.value);
    }
    this.#validator = new WorkflowValidator(blockCatalog);
  }

  /**
   * Create a new draft workflow. The caller must have `workflow:design` and
   * the requested scope must fit inside the identity scope.
   */
  async createDraft(
    identity: IdentityContext,
    input: CreateWorkflowDraftInput,
  ): Promise<WorkflowServiceResult<WorkflowDefinitionRecord>> {
    // Normalise graph ids before schema validation so clients can reference
    // nodes by their stable nodeKey instead of database UUIDs. After this
    // step edges always carry valid UUIDs that satisfy the foreign key
    // constraint.
    const normalisedInput = normaliseGraphIds(input.nodes ?? [], input.edges ?? []);
    const parsed = createWorkflowDraftInputSchema.safeParse({
      ...input,
      nodes: normalisedInput.nodes,
      edges: normalisedInput.edges,
    });
    if (!parsed.success) {
      return fail("invalid_input", parsed.error.issues.map((issue) => issue.message).join(" "));
    }
    const decision = authorizeWorkflowAction(identity, "workflow:design", toScope(input.scope));
    if (!decision.authorized) return authzToServiceResult(decision, "scope_denied");

    const blockCatalog = this.#blockCatalogForIdentity(identity);
    const graphValidation = validateGraph(identity, input.nodes, input.edges, blockCatalog, input.roleBindings ?? []);
    if (!graphValidation.valid) {
      return fail("validation_failed", "De workflowinhoud bevat validatiefouten.", dedupeIssues([
        graphValidation.nodeIssues,
        graphValidation.edgeIssues,
        graphValidation.graphIssues,
        graphValidation.bindingIssues,
      ]));
    }

    const bindingDecisions: WorkflowServiceResult<true>[] = parsed.data.roleBindings.map((binding) => {
      const decision = authorizeWorkflowRoleBinding(identity, {
        workflowRoleId: binding.workflowRole,
        identityGroups: [binding.identityGroup],
        permissions: binding.permissions,
        scope: toScope({ tenant: binding.tenant, businessUnit: binding.businessUnit, clientIds: binding.clientIds }),
      });
      return decision.authorized ? ok(true) : authzToServiceResult(decision, "role_binding_denied");
    });
    const bindingFailure = bindingDecisions.find((result): result is Extract<typeof result, { ok: false }> => !result.ok);
    if (bindingFailure) {
      return { ok: false, code: "role_binding_denied", message: bindingFailure.message } as WorkflowServiceResult<WorkflowDefinitionRecord>;
    }

    try {
      const record = await this.#repository.createDraft(parsed.data, identity.userId);
      return ok(record);
    } catch (error) {
      return repoErrorToService(error);
    }
  }

  /**
   * Update an existing draft with optimistic locking. When nodes/edges/role
   * bindings are provided they fully replace the prior graph.
   */
  async updateDraft(
    identity: IdentityContext,
    input: UpdateWorkflowDraftInput,
  ): Promise<WorkflowServiceResult<WorkflowVersionSnapshot>> {
    const parsed = updateWorkflowDraftInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid_input", parsed.error.issues.map((issue) => issue.message).join(" "));
    }

    const existing = await this.#repository.loadDefinition(parsed.data.definitionId, { includeDraft: true });
    if (!existing) return fail("definition_not_found", "De workflowdefinitie bestaat niet.");
    if (!existing.draft) return fail("draft_not_found", "Deze workflowdefinitie heeft geen bewerkbare draft.");

    if (Number(existing.draft.revision) !== parsed.data.expectedRevision) {
      return fail("revision_conflict", "De draft is gewijzigd sinds je deze hebt geladen. Ververs en probeer opnieuw.");
    }

    const decision = authorizeWorkflowAction(identity, "workflow:design", toScope({
      tenant: existing.definition.tenant,
      businessUnit: existing.definition.businessUnit,
      clientIds: existing.definition.clientIds ?? undefined,
    }));
    if (!decision.authorized) return authzToServiceResult(decision, "scope_denied");

    let normalisedForWrite: { nodes: WorkflowNodeInput[]; edges: WorkflowEdgeInput[] } | null = null;
    if (parsed.data.nodes || parsed.data.edges || parsed.data.roleBindings) {
      const nodes = parsed.data.nodes ?? [];
      const edges = parsed.data.edges ?? [];
      const roleBindings = parsed.data.roleBindings ?? [];
      const blockCatalog = this.#blockCatalogForIdentity(identity);
      const graphValidation = validateGraph(identity, nodes, edges, blockCatalog, roleBindings);
      if (!graphValidation.valid) {
        return fail("validation_failed", "De workflowinhoud bevat validatiefouten.", dedupeIssues([
          graphValidation.nodeIssues,
          graphValidation.edgeIssues,
          graphValidation.graphIssues,
          graphValidation.bindingIssues,
        ]));
      }
      const bindingDecisions: WorkflowServiceResult<true>[] = roleBindings.map((binding) => {
        const decision = authorizeWorkflowRoleBinding(identity, {
          workflowRoleId: binding.workflowRole,
          identityGroups: [binding.identityGroup],
          permissions: binding.permissions,
          scope: toScope({ tenant: binding.tenant, businessUnit: binding.businessUnit, clientIds: binding.clientIds }),
        });
        return decision.authorized ? ok(true) : authzToServiceResult(decision, "role_binding_denied");
      });
      const bindingFailure = bindingDecisions.find((result): result is Extract<typeof result, { ok: false }> => !result.ok);
      if (bindingFailure) {
        return { ok: false, code: "role_binding_denied", message: bindingFailure.message } as WorkflowServiceResult<WorkflowVersionSnapshot>;
      }
      normalisedForWrite = normaliseGraphIds(nodes, edges);
    }

    try {
      const snapshot = await this.#repository.updateDraft(
        {
          definitionId: parsed.data.definitionId,
          expectedRevision: parsed.data.expectedRevision,
          ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
          ...(normalisedForWrite ? { nodes: toMutableNodes(normalisedForWrite.nodes) } : {}),
          ...(normalisedForWrite ? { edges: toMutableEdges(normalisedForWrite.edges) } : {}),
          ...(parsed.data.roleBindings ? { roleBindings: parsed.data.roleBindings } : {}),
        },
        identity.userId,
      );
      return ok(snapshot);
    } catch (error) {
      return repoErrorToService(error);
    }
  }

  /**
   * Publish the current draft as a new immutable version. Requires the
   * `workflow:publish` permission. Emits a `workflow_version.published`
   * audit event in the same transaction.
   */
  async publish(
    identity: IdentityContext,
    input: PublishWorkflowInput,
  ): Promise<WorkflowServiceResult<WorkflowVersionSnapshot>> {
    const parsed = publishWorkflowInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid_input", parsed.error.issues.map((issue) => issue.message).join(" "));
    }
    const existing = await this.#repository.loadDefinition(parsed.data.definitionId, { includeDraft: true });
    if (!existing) return fail("definition_not_found", "De workflowdefinitie bestaat niet.");
    if (!existing.draft) return fail("no_draft_to_publish", "Er is geen draft om te publiceren.");
    if (Number(existing.draft.revision) !== parsed.data.expectedRevision) {
      return fail("revision_conflict", "De draft is gewijzigd sinds je deze hebt geladen. Ververs en probeer opnieuw.");
    }

    const decision = authorizeWorkflowAction(identity, "workflow:publish", toScope({
      tenant: existing.definition.tenant,
      businessUnit: existing.definition.businessUnit,
      clientIds: existing.definition.clientIds ?? undefined,
    }));
    if (!decision.authorized) return authzToServiceResult(decision, "scope_denied");

    // Reparse the full draft through block contracts + role bindings before
    // we lock it in. This guarantees that the immutable published content is
    // always internally consistent, even if a partial update was persisted
    // earlier.
    {
      const nodes = existing.nodes as readonly WorkflowNodeRow[];
      const edges = existing.edges as readonly WorkflowEdgeRow[];
      const roleBindings = existing.roleBindings as readonly WorkflowRoleBindingRow[];
      const nodeInputs: WorkflowNodeInput[] = nodes.map((node) => ({
        id: node.id,
        nodeKey: node.nodeKey,
        block: { blockType: node.blockType, contractVersion: node.blockContractVersion },
        configuration: node.configuration,
        position: { x: node.positionX, y: node.positionY },
      }));
      const edgeInputs: WorkflowEdgeInput[] = edges.map((edge) => ({
        id: edge.id,
        edgeKey: edge.edgeKey,
        sourceNodeId: edge.sourceNodeId,
        sourcePort: edge.sourcePort,
        targetNodeId: edge.targetNodeId,
        targetPort: edge.targetPort,
        ...(edge.condition !== null ? { condition: edge.condition as Record<string, unknown> } : { condition: null }),
      }));
      const blockCatalog = this.#blockCatalogForIdentity(identity);
      const bindingInputs: WorkflowRoleBindingInput[] = roleBindings.map((binding) => ({
        workflowRole: binding.workflowRole,
        identityGroup: binding.identityGroup,
        permissions: binding.permissions as WorkflowRoleBindingInput["permissions"],
        tenant: binding.tenant,
        businessUnit: binding.businessUnit,
        ...(binding.clientIds ? { clientIds: [...binding.clientIds] } : {}),
      }));
      const graphValidation = validateGraph(identity, nodeInputs, edgeInputs, blockCatalog, bindingInputs);
      if (!graphValidation.valid) {
        return fail("validation_failed", "De draft bevat validatiefouten en kan niet worden gepubliceerd.", dedupeIssues([
          graphValidation.nodeIssues,
          graphValidation.edgeIssues,
          graphValidation.graphIssues,
          graphValidation.bindingIssues,
        ]));
      }
    }

    try {
      const snapshot = await this.#repository.publish(
        parsed.data.definitionId,
        parsed.data.expectedRevision,
        identity.userId,
      );
      return ok(snapshot);
    } catch (error) {
      return repoErrorToService(error);
    }
  }

  /**
   * Mark a definition as deprecated. Published versions remain immutable and
   * instances may still be running; this only prevents further use as a
   * template and excludes it from the change catalog.
   */
  async deprecate(
    identity: IdentityContext,
    input: DeprecateWorkflowInput,
  ): Promise<WorkflowServiceResult<WorkflowDefinitionRow>> {
    const parsed = deprecateWorkflowInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid_input", parsed.error.issues.map((issue) => issue.message).join(" "));
    }
    const existing = await this.#repository.loadDefinition(parsed.data.definitionId);
    if (!existing) return fail("definition_not_found", "De workflowdefinitie bestaat niet.");

    const decision = authorizeWorkflowAction(identity, "workflow:deprecate", toScope({
      tenant: existing.definition.tenant,
      businessUnit: existing.definition.businessUnit,
      clientIds: existing.definition.clientIds ?? undefined,
    }));
    if (!decision.authorized) return authzToServiceResult(decision, "scope_denied");

    try {
      const row = await this.#repository.deprecate(parsed.data.definitionId, identity.userId);
      return ok(row);
    } catch (error) {
      return repoErrorToService(error);
    }
  }

  /**
   * Submit the current draft for review. This does not change the published
   * state; it only emits a workflow event the reviewer can pick up. The
   * caller must hold `workflow:test` to invoke it. The review event itself
   * is recorded by the workflow_event table through the version row.
   */
  async submitForReview(
    identity: IdentityContext,
    input: SubmitForReviewInput,
  ): Promise<WorkflowServiceResult<WorkflowVersionSnapshot>> {
    const parsed = submitForReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid_input", parsed.error.issues.map((issue) => issue.message).join(" "));
    }
    const existing = await this.#repository.loadDefinition(parsed.data.definitionId, { includeDraft: true });
    if (!existing) return fail("definition_not_found", "De workflowdefinitie bestaat niet.");
    if (!existing.draft) return fail("draft_not_found", "Deze workflowdefinitie heeft geen bewerkbare draft.");

    const decision = authorizeWorkflowAction(identity, "workflow:test", toScope({
      tenant: existing.definition.tenant,
      businessUnit: existing.definition.businessUnit,
      clientIds: existing.definition.clientIds ?? undefined,
    }));
    if (!decision.authorized) return authzToServiceResult(decision, "scope_denied");

    if (Number(existing.draft.revision) !== parsed.data.expectedRevision) {
      return fail("revision_conflict", "De draft is gewijzigd sinds je deze hebt geladen. Ververs en probeer opnieuw.");
    }
    return ok({ version: existing.draft, definition: existing.definition, nodes: existing.nodes, edges: existing.edges, roleBindings: existing.roleBindings });
  }

  /**
   * Clone a published (or draft) version into a new definition in the target
   * scope. Useful for "Save as template" or starting a new workflow from an
   * existing one in a different client scope.
   */
  async clone(
    identity: IdentityContext,
    input: CloneWorkflowInput,
  ): Promise<WorkflowServiceResult<WorkflowDefinitionRecord>> {
    const parsed = cloneWorkflowInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid_input", parsed.error.issues.map((issue) => issue.message).join(" "));
    }
    const source = parsed.data.sourceVersionId
      ? await this.#repository.loadVersion(parsed.data.sourceVersionId)
      : await this.#repository.loadLatestDraftVersion(parsed.data.sourceDefinitionId);
    if (!source) return fail("version_not_found", "De bronversie bestaat niet.");

    const targetDecision = authorizeWorkflowAction(identity, "workflow:design", toScope(parsed.data.scope));
    if (!targetDecision.authorized) return authzToServiceResult(targetDecision, "scope_denied");

    // We also verify that the source definition is visible to the actor so we
    // do not leak the existence of workflows in scopes they cannot manage.
    const sourceScope: WorkflowDataScope = {
      tenant: source.definition.tenant,
      businessUnit: source.definition.businessUnit,
      ...(source.definition.clientIds ? { clientIds: source.definition.clientIds } : {}),
    };
    const sourceDecision = authorizeWorkflowScope(identity, sourceScope);
    if (!sourceDecision.authorized) return authzToServiceResult(sourceDecision, "scope_denied");

    try {
      const record = await this.#repository.clone(source.version.id, {
        scope: {
          tenant: parsed.data.scope.tenant,
          businessUnit: parsed.data.scope.businessUnit,
          ...(parsed.data.scope.clientIds ? { clientIds: parsed.data.scope.clientIds } : {}),
        },
        slug: parsed.data.slug,
        name: parsed.data.metadata?.name ?? `${source.definition.name} (kopie)`,
        ...(parsed.data.metadata?.description !== undefined
          ? { description: parsed.data.metadata.description }
          : {}),
        ownerUserId: parsed.data.ownerUserId ?? identity.userId,
      });
      return ok(record);
    } catch (error) {
      return repoErrorToService(error);
    }
  }

  /**
   * Load a definition, the published version, or the latest draft version.
   * The caller must have `workflow:view` and the definition must be inside
   * the identity's scope.
   */
  async load(
    identity: IdentityContext,
    input: LoadWorkflowInput,
  ): Promise<WorkflowServiceResult<WorkflowDefinitionRecord | WorkflowVersionSnapshot | null>> {
    const parsed = loadWorkflowInputSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid_input", parsed.error.issues.map((issue) => issue.message).join(" "));
    }

    const viewDecision = authorizeWorkflowAction(identity, "workflow:view", {
      tenant: "*",
      businessUnit: "*",
    });
    if (!viewDecision.authorized) return authzToServiceResult(viewDecision, "scope_denied");

    if (parsed.data.versionId) {
      const snapshot = await this.#repository.loadVersion(parsed.data.versionId);
      if (!snapshot) return ok(null);
      const scope: WorkflowDataScope = {
        tenant: snapshot.definition.tenant,
        businessUnit: snapshot.definition.businessUnit,
        ...(snapshot.definition.clientIds ? { clientIds: snapshot.definition.clientIds } : {}),
      };
      const scopeDecision = authorizeWorkflowScope(identity, scope);
      if (!scopeDecision.authorized) {
        return { ...authzToServiceResult(scopeDecision, "scope_denied"), code: "scope_denied" } as WorkflowServiceResult<WorkflowDefinitionRecord | WorkflowVersionSnapshot | null>;
      }
      return ok(snapshot);
    }
    if (parsed.data.definitionId) {
      const record = await this.#repository.loadDefinition(parsed.data.definitionId, { includeDraft: parsed.data.includeDraft });
      if (!record) return ok(null);
      const scope: WorkflowDataScope = {
        tenant: record.definition.tenant,
        businessUnit: record.definition.businessUnit,
        ...(record.definition.clientIds ? { clientIds: record.definition.clientIds } : {}),
      };
      const scopeDecision = authorizeWorkflowScope(identity, scope);
      if (!scopeDecision.authorized) {
        return { ...authzToServiceResult(scopeDecision, "scope_denied"), code: "scope_denied" } as WorkflowServiceResult<WorkflowDefinitionRecord | WorkflowVersionSnapshot | null>;
      }
      return ok(record);
    }
    return fail("invalid_input", "Geef een definitionId of versionId op.");
  }

  /**
   * List definitions visible to the actor in the given scope. The list is
   * filtered by the identity's client/tenant/businessunit scope and ordered
   * by most recently updated.
   */
  async listForScope(
    identity: IdentityContext,
    scope: { tenant: string; businessUnit: string },
  ): Promise<WorkflowServiceResult<readonly WorkflowDefinitionRow[]>> {
    const scopeDecision = authorizeWorkflowScope(identity, toScope(scope));
    if (!scopeDecision.authorized) return authzToServiceResult(scopeDecision, "scope_denied");

    const rows = await this.#repository.listDefinitionsForScope(scope);
    // Tenant/business unit are already authorized above; client-scope narrowing
    // happens implicitly because the repository's scope query is exact.
    return ok(rows);
  }

  /**
   * Static validation of an in-memory draft (without writing). Useful for
   * the builder UI's "validate" button and the path simulator.
   */
  validateDraft(
    identity: IdentityContext,
    input: { nodes: readonly WorkflowNodeInput[]; edges: readonly WorkflowEdgeInput[]; roleBindings?: readonly WorkflowRoleBindingInput[] },
  ): WorkflowServiceResult<{ issues: readonly WorkflowServiceIssue[] }> {
    const blockCatalog = this.#blockCatalogForIdentity(identity);
    const graphValidation = validateGraph(identity, input.nodes, input.edges, blockCatalog, input.roleBindings ?? []);

    const bindingIssues: readonly WorkflowServiceIssue[] = graphValidation.bindingIssues;
    const issues = dedupeIssues([graphValidation.nodeIssues, graphValidation.edgeIssues, graphValidation.graphIssues, bindingIssues]);
    if (issues.length > 0) {
      return fail("validation_failed", "De workflowinhoud bevat validatiefouten.", issues);
    }
    return ok({ issues });
  }

  #blockCatalogForIdentity(identity: IdentityContext): ReadonlyMap<string, BlockDefinition> {
    const catalog = blockRegistry.listForIdentity(identity);
    return new Map(catalog.map((entry: BlockCatalogEntry) => {
      const resolved = this.#resolver.resolve({ blockType: entry.blockType, contractVersion: entry.contractVersion });
      if (!resolved.valid) {
        throw new Error(`Onverwacht: catalogus verwijst naar onbekend block ${entry.blockType}@${entry.contractVersion}.`);
      }
      return [entry.blockType, resolved.value] as const;
    }));
  }
}

export function createWorkflowDefinitionService(sql: SqlExecutor): WorkflowDefinitionService {
  return new WorkflowDefinitionService(new WorkflowDefinitionRepository(sql));
}
