/**
 * Server-side repository for the Workflow Studio definition store.
 *
 * A workflow is composed of a `workflow_definition` (lifecycle root, scope
 * metadata) and one or more `workflow_version` rows that own the immutable
 * graph (nodes, edges, role bindings) at a specific content hash.
 *
 * Design rules enforced here:
 *
 * - Drafts are mutable. The unique partial index `uq_workflow_version_single_draft`
 *   guarantees at most one draft per definition.
 * - Every draft update is optimistic-locked against the version `revision`,
 *   which the database trigger `workflow_guard_version_immutability` increments
 *   on every successful update.
 * - Published versions are immutable (the database refuses inserts/updates/deletes
 *   on their nodes, edges and role bindings).
 * - Publishing atomically assigns a SHA-256 content hash and stamps
 *   published_at/published_by_user_id. A `workflow_event` audit row is emitted
 *   in the same transaction so the publication and its audit trail commit
 *   together or not at all.
 * - Repository methods take a `SqlExecutor` (the production `sql` instance or
 *   a transaction wrapper) so the service layer can compose them atomically
 *   and so unit tests can run without a live database.
 */
import { createHash } from "node:crypto";
import type { Sql } from "postgres";

import type {
  CreateWorkflowDraftInput,
  UpdateWorkflowDraftInput,
  WorkflowNodeInput,
  WorkflowEdgeInput,
  WorkflowRoleBindingInput,
} from "@/lib/workflow-studio/definition-schema";

/**
 * The minimal SQL surface the repository needs. `postgres.js` returns the
 * `sql` template tag for both connection and transaction scopes, so any
 * transaction handle is a drop-in replacement.
 */
export type SqlExecutor = Sql;

export type WorkflowDefinitionRow = {
  id: string;
  tenant: string;
  businessUnit: string;
  clientIds: string[] | null;
  slug: string;
  name: string;
  description: string;
  ownerUserId: string;
  status: "draft" | "published" | "deprecated" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type WorkflowVersionRow = {
  id: string;
  workflowDefinitionId: string;
  versionNumber: number;
  schemaVersion: number;
  status: "draft" | "published";
  contentHash: string | null;
  revision: string;
  publishedAt: string | null;
  publishedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowNodeRow = {
  id: string;
  workflowVersionId: string;
  nodeKey: string;
  blockType: string;
  blockContractVersion: number;
  configuration: unknown;
  positionX: number;
  positionY: number;
};

export type WorkflowEdgeRow = {
  id: string;
  workflowVersionId: string;
  edgeKey: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  condition: unknown | null;
};

export type WorkflowRoleBindingRow = {
  id: string;
  workflowVersionId: string;
  workflowRole: string;
  identityGroup: string;
  permissions: string[];
  tenant: string;
  businessUnit: string;
  clientIds: string[] | null;
};

export type WorkflowDefinitionRecord = {
  definition: WorkflowDefinitionRow;
  draft: WorkflowVersionRow | null;
  published: WorkflowVersionRow | null;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
  roleBindings: WorkflowRoleBindingRow[];
};

export type WorkflowVersionSnapshot = {
  version: WorkflowVersionRow;
  definition: WorkflowDefinitionRow;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
  roleBindings: WorkflowRoleBindingRow[];
};

export class WorkflowRepositoryError extends Error {
  readonly code: WorkflowRepositoryErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: WorkflowRepositoryErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "WorkflowRepositoryError";
    this.code = code;
    if (details) this.details = details;
  }
}

export type WorkflowRepositoryErrorCode =
  | "definition_not_found"
  | "version_not_found"
  | "draft_not_found"
  | "duplicate_slug"
  | "revision_conflict"
  | "no_draft_to_publish"
  | "already_published"
  | "published_version_immutable"
  | "invalid_node_reference";

function mapDefinition(row: Record<string, unknown>): WorkflowDefinitionRow {
  return {
    id: String(row.id),
    tenant: String(row.tenant),
    businessUnit: String(row.business_unit),
    clientIds: row.client_ids ? [...(row.client_ids as string[])] : null,
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ""),
    ownerUserId: String(row.owner_user_id),
    status: String(row.status) as WorkflowDefinitionRow["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapVersion(row: Record<string, unknown>): WorkflowVersionRow {
  return {
    id: String(row.id),
    workflowDefinitionId: String(row.workflow_definition_id),
    versionNumber: Number(row.version_number),
    schemaVersion: Number(row.schema_version ?? 1),
    status: String(row.status) as WorkflowVersionRow["status"],
    contentHash: row.content_hash ? String(row.content_hash) : null,
    revision: String(row.revision),
    publishedAt: row.published_at ? String(row.published_at) : null,
    publishedByUserId: row.published_by_user_id ? String(row.published_by_user_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapNode(row: Record<string, unknown>): WorkflowNodeRow {
  return {
    id: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    nodeKey: String(row.node_key),
    blockType: String(row.block_type),
    blockContractVersion: Number(row.block_contract_version),
    configuration: row.configuration ?? {},
    positionX: Number(row.position_x),
    positionY: Number(row.position_y),
  };
}

function mapEdge(row: Record<string, unknown>): WorkflowEdgeRow {
  return {
    id: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    edgeKey: String(row.edge_key),
    sourceNodeId: String(row.source_node_id),
    sourcePort: String(row.source_port),
    targetNodeId: String(row.target_node_id),
    targetPort: String(row.target_port),
    condition: row.condition ?? null,
  };
}

function mapRoleBinding(row: Record<string, unknown>): WorkflowRoleBindingRow {
  return {
    id: String(row.id),
    workflowVersionId: String(row.workflow_version_id),
    workflowRole: String(row.workflow_role),
    identityGroup: String(row.identity_group),
    permissions: [...(row.permissions as string[])],
    tenant: String(row.tenant),
    businessUnit: String(row.business_unit),
    clientIds: row.client_ids ? [...(row.client_ids as string[])] : null,
  };
}

const DEFINITION_COLUMNS =
  "id, tenant, business_unit, client_ids, slug, name, description, owner_user_id, status, created_at, updated_at";

const VERSION_COLUMNS =
  "id, workflow_definition_id, version_number, schema_version, status, content_hash, revision, published_at, published_by_user_id, created_at, updated_at";

const NODE_COLUMNS =
  "id, workflow_version_id, node_key, block_type, block_contract_version, configuration, position_x, position_y";

const EDGE_COLUMNS =
  "id, workflow_version_id, edge_key, source_node_id, source_port, target_node_id, target_port, condition";

const ROLE_BINDING_COLUMNS =
  "id, workflow_version_id, workflow_role, identity_group, permissions, tenant, business_unit, client_ids";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint|duplicate key/i.test(message);
}

function isRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "P0001" || code === "55000") {
    const message = error instanceof Error ? error.message : String(error);
    if (/immutable|published/i.test(message)) return true;
  }
  return false;
}

/**
 * postgres.js expects JSONValue for `sql.json(...)`. Configuration payloads
 * are validated against JSON Schema by the block contract, so a round-trip
 * through JSON.stringify normalises unknown shapes without runtime loss.
 */
function toJsonValue(value: unknown): Parameters<Sql["json"]>[0] {
  return JSON.parse(JSON.stringify(value)) as Parameters<Sql["json"]>[0];
}

/**
 * Stable content hash for a workflow draft. Sorting keys makes the hash
 * independent of insertion order; including block reference + configuration
 * ensures structural changes alter the hash.
 */
export function computeContentHash(payload: {
  nodes: ReadonlyArray<WorkflowNodeInput | WorkflowNodeRow>;
  edges: ReadonlyArray<WorkflowEdgeInput | WorkflowEdgeRow>;
  roleBindings: ReadonlyArray<WorkflowRoleBindingInput | WorkflowRoleBindingRow>;
}): string {
  const canonicalNodes = [...payload.nodes]
    .map((node) => ({
      nodeKey: "nodeKey" in node ? node.nodeKey : String((node as { id: string }).id),
      blockType: "block" in node
        ? (node as WorkflowNodeInput).block.blockType
        : (node as WorkflowNodeRow).blockType,
      blockContractVersion: "block" in node
        ? (node as WorkflowNodeInput).block.contractVersion
        : (node as WorkflowNodeRow).blockContractVersion,
      configuration: "block" in node
        ? (node as WorkflowNodeInput).configuration
        : (node as WorkflowNodeRow).configuration,
      position: {
        x: "block" in node
          ? (node as WorkflowNodeInput).position.x
          : (node as WorkflowNodeRow).positionX,
        y: "block" in node
          ? (node as WorkflowNodeInput).position.y
          : (node as WorkflowNodeRow).positionY,
      },
    }))
    .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));

  const canonicalEdges = [...payload.edges]
    .map((edge) => ({
      edgeKey: "edgeKey" in edge ? edge.edgeKey : String((edge as { id: string }).id),
      sourceNodeId: "sourceNodeId" in edge
        ? (edge as WorkflowEdgeInput).sourceNodeId
        : String((edge as { id: string }).id),
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort,
      condition: "condition" in edge
        ? (edge as WorkflowEdgeInput).condition ?? null
        : (edge as WorkflowEdgeRow).condition ?? null,
    }))
    .sort((left, right) => left.edgeKey.localeCompare(right.edgeKey));

  const canonicalBindings = [...payload.roleBindings]
    .map((binding) => ({
      workflowRole: binding.workflowRole,
      identityGroup: binding.identityGroup,
      permissions: [...(binding.permissions as readonly string[])].sort(),
      tenant: binding.tenant,
      businessUnit: binding.businessUnit,
      clientIds: binding.clientIds ? [...binding.clientIds].sort() : null,
    }))
    .sort((left, right) =>
      left.workflowRole.localeCompare(right.workflowRole)
      || left.identityGroup.localeCompare(right.identityGroup),
    );

  const canonical = JSON.stringify({
    nodes: canonicalNodes,
    edges: canonicalEdges,
    roleBindings: canonicalBindings,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export class WorkflowDefinitionRepository {
  readonly #sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.#sql = sql;
  }

  async createDraft(input: CreateWorkflowDraftInput, ownerUserId: string): Promise<WorkflowDefinitionRecord> {
    return this.#sql.begin(async (transaction) => {
      const sql = transaction as unknown as Sql;
      try {
        const [definitionRow] = await sql<Record<string, unknown>[]>`
          INSERT INTO workflow_definition (
            tenant, business_unit, client_ids, slug, name, description, owner_user_id, status
          ) VALUES (
            ${input.scope.tenant},
            ${input.scope.businessUnit},
            ${input.scope.clientIds ?? null},
            ${input.slug},
            ${input.name},
            ${input.description ?? ""},
            ${ownerUserId},
            'draft'
          )
          RETURNING ${sql.unsafe(DEFINITION_COLUMNS)}
        `;
        const definition = mapDefinition(definitionRow);

        const [versionRow] = await sql<Record<string, unknown>[]>`
          INSERT INTO workflow_version (workflow_definition_id, status)
          VALUES (${definition.id}, 'draft')
          RETURNING ${sql.unsafe(VERSION_COLUMNS)}
        `;
        const version = mapVersion(versionRow);

        await this.#replaceGraphContent(sql, version.id, input.nodes, input.edges, input.roleBindings);
        return await this.#loadDefinitionRecord(sql, definition.id);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new WorkflowRepositoryError(
            "duplicate_slug",
            "Er bestaat al een workflowdefinitie met deze slug binnen dezelfde tenant en businessunit.",
          );
        }
        throw error;
      }
    });
  }

  async loadDefinition(
    definitionId: string,
    options: { includeDraft?: boolean } = {},
  ): Promise<WorkflowDefinitionRecord | null> {
    const sql = this.#sql as unknown as Sql;
    const [definitionRow] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(DEFINITION_COLUMNS)} FROM workflow_definition WHERE id = ${definitionId}
    `;
    if (!definitionRow) return null;
    return await this.#loadDefinitionRecord(sql, definitionRow.id as string, options);
  }

  async loadVersion(versionId: string): Promise<WorkflowVersionSnapshot | null> {
    const sql = this.#sql as unknown as Sql;
    const [versionRow] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version WHERE id = ${versionId}
    `;
    if (!versionRow) return null;
    const version = mapVersion(versionRow);
    return await this.#loadVersionSnapshot(sql, version);
  }

  async loadLatestDraftVersion(definitionId: string): Promise<WorkflowVersionSnapshot | null> {
    const sql = this.#sql as unknown as Sql;
    const [versionRow] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version
      WHERE workflow_definition_id = ${definitionId} AND status = 'draft'
      LIMIT 1
    `;
    if (!versionRow) return null;
    const version = mapVersion(versionRow);
    return await this.#loadVersionSnapshot(sql, version);
  }

  async listDefinitionsForScope(scope: {
    tenant: string;
    businessUnit: string;
  }): Promise<WorkflowDefinitionRow[]> {
    const sql = this.#sql as unknown as Sql;
    const rows = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(DEFINITION_COLUMNS)} FROM workflow_definition
      WHERE tenant = ${scope.tenant} AND business_unit = ${scope.businessUnit}
      ORDER BY updated_at DESC
    `;
    return rows.map(mapDefinition);
  }

  async updateDraft(
    input: UpdateWorkflowDraftInput,
    updatedByUserId: string,
  ): Promise<WorkflowVersionSnapshot> {
    return this.#sql.begin(async (transaction) => {
      const sql = transaction as unknown as Sql;
      const [versionRow] = await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version
        WHERE workflow_definition_id = ${input.definitionId} AND status = 'draft'
        LIMIT 1
      `;
      if (!versionRow) {
        throw new WorkflowRepositoryError(
          "draft_not_found",
          "Deze workflowdefinitie heeft geen bewerkbare draft.",
        );
      }
      const version = mapVersion(versionRow);
      if (Number(version.revision) !== input.expectedRevision) {
        throw new WorkflowRepositoryError(
          "revision_conflict",
          "De draft is door een andere bewerker gewijzigd. Ververs en probeer opnieuw.",
          { expected: input.expectedRevision, actual: Number(version.revision) },
        );
      }

      const [definitionRow] = await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(DEFINITION_COLUMNS)} FROM workflow_definition WHERE id = ${input.definitionId}
      `;
      const definition = mapDefinition(definitionRow);

      if (input.metadata) {
        const nextName = input.metadata.name ?? definition.name;
        const nextDescription = input.metadata.description ?? definition.description;
        const updated = await sql<Record<string, unknown>[]>`
          UPDATE workflow_definition
          SET name = ${nextName},
              description = ${nextDescription},
              owner_user_id = ${updatedByUserId},
              updated_at = now()
          WHERE id = ${input.definitionId}
        `;
        if (updated.length === 0) {
          throw new WorkflowRepositoryError(
            "definition_not_found",
            "De workflowdefinitie bestaat niet meer.",
          );
        }
      }

      if (input.nodes || input.edges || input.roleBindings) {
        // Graph updates must be atomic: nodes, edges and role bindings are
        // always replaced together so foreign keys (edge -> node) and the
        // immutable-version trigger remain consistent in a single transaction.
        if (!input.nodes || !input.edges || !input.roleBindings) {
          throw new WorkflowRepositoryError(
            "invalid_node_reference",
            "Nodes, edges en rolbindingen moeten gezamenlijk vervangen worden om de graph consistent te houden.",
          );
        }
        await this.#replaceGraphContent(
          sql,
          version.id,
          input.nodes,
          input.edges,
          input.roleBindings,
        );
      }

      // Bumping revision is handled by the immutability trigger on the version row.
      // The trigger rejects updates on published versions, so we explicitly touch
      // the draft row to advance revision and updated_at.
      try {
        const touched = await sql<Record<string, unknown>[]>`
          UPDATE workflow_version
          SET updated_at = now()
          WHERE id = ${version.id} AND status = 'draft' AND revision = ${input.expectedRevision}::bigint
          RETURNING revision
        `;
        if (touched.length === 0) {
          // The row exists (we read it above) but the trigger refused to
          // update it: only published versions are immutable, so this branch
          // is unreachable in normal operation. Surface as a clear error.
          throw new WorkflowRepositoryError(
            "published_version_immutable",
            "Gepubliceerde versies zijn onveranderbaar.",
          );
        }
      } catch (error) {
        if (isRevisionConflict(error)) {
          throw new WorkflowRepositoryError(
            "published_version_immutable",
            "Gepubliceerde versies zijn onveranderbaar.",
          );
        }
        throw error;
      }

      return await this.#loadVersionSnapshot(sql, version.id);
    });
  }

  async clone(
    sourceVersionId: string,
    target: {
      scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] };
      slug: string;
      name: string;
      description?: string;
      ownerUserId: string;
    },
  ): Promise<WorkflowDefinitionRecord> {
    return this.#sql.begin(async (transaction) => {
      const sql = transaction as unknown as Sql;
      const [source] = await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version WHERE id = ${sourceVersionId}
      `;
      if (!source) {
        throw new WorkflowRepositoryError(
          "version_not_found",
          "De bronversie bestaat niet.",
        );
      }
      const sourceVersion = mapVersion(source);
      const sourceNodes = (await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(NODE_COLUMNS)} FROM workflow_node WHERE workflow_version_id = ${sourceVersionId}
      `).map(mapNode);
      const sourceEdges = (await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(EDGE_COLUMNS)} FROM workflow_edge WHERE workflow_version_id = ${sourceVersionId}
      `).map(mapEdge);
      const sourceBindings = (await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(ROLE_BINDING_COLUMNS)} FROM workflow_role_binding WHERE workflow_version_id = ${sourceVersionId}
      `).map(mapRoleBinding);

      // 1. Create new definition in target scope.
      let definitionId: string;
      try {
        const [definition] = await sql<Record<string, unknown>[]>`
          INSERT INTO workflow_definition (
            tenant, business_unit, client_ids, slug, name, description, owner_user_id, status
          ) VALUES (
            ${target.scope.tenant},
            ${target.scope.businessUnit},
            ${target.scope.clientIds ? sql.array(target.scope.clientIds as string[]) : null},
            ${target.slug},
            ${target.name},
            ${target.description ?? ""},
            ${target.ownerUserId},
            'draft'
          )
          RETURNING id
        `;
        definitionId = String(definition.id);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new WorkflowRepositoryError(
            "duplicate_slug",
            "Er bestaat al een workflowdefinitie met deze slug binnen dezelfde tenant en businessunit.",
          );
        }
        throw error;
      }

      // 2. Create first draft version on the new definition.
      const [draftVersion] = await sql<Record<string, unknown>[]>`
        INSERT INTO workflow_version (workflow_definition_id, status)
        VALUES (${definitionId}, 'draft')
        RETURNING id
      `;
      const newVersionId = String(draftVersion.id);

      // 3. Reuse nodeKey/edgeKey but generate fresh ids so cross-version
      //    references are impossible.
      const nodeIdMap = new Map<string, string>();
      for (const node of sourceNodes) {
        const [created] = await sql<Record<string, unknown>[]>`
          INSERT INTO workflow_node (
            workflow_version_id, node_key, block_type, block_contract_version, configuration, position_x, position_y
          ) VALUES (
            ${newVersionId},
            ${node.nodeKey},
            ${node.blockType},
            ${node.blockContractVersion},
            ${sql.json(toJsonValue(node.configuration))},
            ${node.positionX},
            ${node.positionY}
          )
          RETURNING id
        `;
        nodeIdMap.set(node.id, String(created.id));
      }

      for (const edge of sourceEdges) {
        await sql`
          INSERT INTO workflow_edge (
            workflow_version_id, edge_key, source_node_id, source_port, target_node_id, target_port, condition
          ) VALUES (
            ${newVersionId},
            ${edge.edgeKey},
            ${nodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId},
            ${edge.sourcePort},
            ${nodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId},
            ${edge.targetPort},
            ${edge.condition === null ? null : sql.json(toJsonValue(edge.condition))}
          )
        `;
      }
      for (const binding of sourceBindings) {
        await sql`
          INSERT INTO workflow_role_binding (
            workflow_version_id, workflow_role, identity_group, permissions, tenant, business_unit, client_ids
          ) VALUES (
            ${newVersionId},
            ${binding.workflowRole},
            ${binding.identityGroup},
            ${sql.json(toJsonValue(binding.permissions))},
            ${binding.tenant},
            ${binding.businessUnit},
            ${binding.clientIds ?? null}
          )
        `;
      }

      return await this.#loadDefinitionRecord(sql, definitionId);
    });
  }

  async publish(
    definitionId: string,
    expectedRevision: number,
    publishedByUserId: string,
  ): Promise<WorkflowVersionSnapshot> {
    return this.#sql.begin(async (transaction) => {
      const sql = transaction as unknown as Sql;
      const [versionRow] = await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version
        WHERE workflow_definition_id = ${definitionId} AND status = 'draft'
        LIMIT 1
      `;
      if (!versionRow) {
        throw new WorkflowRepositoryError(
          "no_draft_to_publish",
          "Er is geen draft om te publiceren.",
        );
      }
      const version = mapVersion(versionRow);
      if (Number(version.revision) !== expectedRevision) {
        throw new WorkflowRepositoryError(
          "revision_conflict",
          "De draft is gewijzigd sinds je deze hebt geladen. Ververs en probeer opnieuw.",
          { expected: expectedRevision, actual: Number(version.revision) },
        );
      }
      const nodes = (await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(NODE_COLUMNS)} FROM workflow_node WHERE workflow_version_id = ${version.id}
      `).map(mapNode);
      const edges = (await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(EDGE_COLUMNS)} FROM workflow_edge WHERE workflow_version_id = ${version.id}
      `).map(mapEdge);
      const bindings = (await sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(ROLE_BINDING_COLUMNS)} FROM workflow_role_binding WHERE workflow_version_id = ${version.id}
      `).map(mapRoleBinding);
      const contentHash = computeContentHash({ nodes, edges, roleBindings: bindings });

      try {
        const [published] = await sql<Record<string, unknown>[]>`
          UPDATE workflow_version
          SET status = 'published',
              content_hash = ${contentHash},
              published_at = now(),
              published_by_user_id = ${publishedByUserId}
          WHERE id = ${version.id} AND status = 'draft'
          RETURNING ${sql.unsafe(VERSION_COLUMNS)}
        `;
        if (!published) {
          throw new WorkflowRepositoryError(
            "revision_conflict",
            "De draft is gewijzigd sinds je deze hebt geladen. Ververs en probeer opnieuw.",
          );
        }
        await sql`
          UPDATE workflow_definition
          SET status = 'published', updated_at = now()
          WHERE id = ${definitionId}
        `;
        await sql`
          INSERT INTO workflow_event (
            workflow_version_id, sequence, event_type, actor_user_id, payload
          ) VALUES (
            ${version.id},
            COALESCE((SELECT MAX(sequence) + 1 FROM workflow_event
              WHERE workflow_version_id = ${version.id}), 1),
            'workflow_version.published',
            ${publishedByUserId},
            ${sql.json({
              contentHash,
              versionNumber: version.versionNumber,
              publishedAt: new Date().toISOString(),
            })}
          )
        `;
        return await this.#loadVersionSnapshot(sql, version.id);
      } catch (error) {
        if (isRevisionConflict(error)) {
          throw new WorkflowRepositoryError(
            "published_version_immutable",
            "Gepubliceerde versies zijn onveranderbaar.",
          );
        }
        throw error;
      }
    });
  }

  async deprecate(definitionId: string, _deprecatedByUserId: string): Promise<WorkflowDefinitionRow> {
    return this.#sql.begin(async (transaction) => {
      const sql = transaction as unknown as Sql;
      const [row] = await sql<Record<string, unknown>[]>`
        UPDATE workflow_definition
        SET status = 'deprecated', updated_at = now()
        WHERE id = ${definitionId} AND status IN ('published', 'draft')
        RETURNING ${sql.unsafe(DEFINITION_COLUMNS)}
      `;
      if (!row) {
        throw new WorkflowRepositoryError(
          "definition_not_found",
          "De workflowdefinitie bestaat niet of is al uitgephaseerd.",
        );
      }
      return mapDefinition(row);
    });
  }

  async #loadDefinitionRecord(
    sql: Sql,
    definitionId: string,
    options: { includeDraft?: boolean } = {},
  ): Promise<WorkflowDefinitionRecord> {
    const [definitionRow] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(DEFINITION_COLUMNS)} FROM workflow_definition WHERE id = ${definitionId}
    `;
    if (!definitionRow) {
      throw new WorkflowRepositoryError(
        "definition_not_found",
        "De workflowdefinitie bestaat niet.",
      );
    }
    const definition = mapDefinition(definitionRow);

    const [publishedRow] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version
      WHERE workflow_definition_id = ${definitionId} AND status = 'published'
      ORDER BY version_number DESC LIMIT 1
    `;
    const published = publishedRow ? mapVersion(publishedRow) : null;

    let draft: WorkflowVersionRow | null = null;
    const [draftRow] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version
      WHERE workflow_definition_id = ${definitionId} AND status = 'draft'
      LIMIT 1
    `;
    if (draftRow) draft = mapVersion(draftRow);

    const activeVersion = options.includeDraft && draft ? draft : published ?? draft;
    if (!activeVersion) {
      return { definition, draft, published, nodes: [], edges: [], roleBindings: [] };
    }

    const [nodes, edges, roleBindings] = await Promise.all([
      sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(NODE_COLUMNS)} FROM workflow_node WHERE workflow_version_id = ${activeVersion.id}
      `,
      sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(EDGE_COLUMNS)} FROM workflow_edge WHERE workflow_version_id = ${activeVersion.id}
      `,
      sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(ROLE_BINDING_COLUMNS)} FROM workflow_role_binding WHERE workflow_version_id = ${activeVersion.id}
      `,
    ]);

    return {
      definition,
      draft,
      published,
      nodes: nodes.map(mapNode),
      edges: edges.map(mapEdge),
      roleBindings: roleBindings.map(mapRoleBinding),
    };
  }

  async #loadVersionSnapshot(sql: Sql, versionOrId: WorkflowVersionRow | string): Promise<WorkflowVersionSnapshot> {
    const version = typeof versionOrId === "string"
      ? await this.#fetchVersion(sql, versionOrId)
      : versionOrId;
    if (!version) {
      throw new WorkflowRepositoryError(
        "version_not_found",
        "De workflowversie bestaat niet.",
      );
    }
    const [definitionRow] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(DEFINITION_COLUMNS)} FROM workflow_definition WHERE id = ${version.workflowDefinitionId}
    `;
    const definition = mapDefinition(definitionRow);
    const [nodes, edges, roleBindings] = await Promise.all([
      sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(NODE_COLUMNS)} FROM workflow_node WHERE workflow_version_id = ${version.id}
      `,
      sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(EDGE_COLUMNS)} FROM workflow_edge WHERE workflow_version_id = ${version.id}
      `,
      sql<Record<string, unknown>[]>`
        SELECT ${sql.unsafe(ROLE_BINDING_COLUMNS)} FROM workflow_role_binding WHERE workflow_version_id = ${version.id}
      `,
    ]);
    return {
      version,
      definition,
      nodes: nodes.map(mapNode),
      edges: edges.map(mapEdge),
      roleBindings: roleBindings.map(mapRoleBinding),
    };
  }

  async #fetchVersion(sql: Sql, versionId: string): Promise<WorkflowVersionRow | null> {
    const [row] = await sql<Record<string, unknown>[]>`
      SELECT ${sql.unsafe(VERSION_COLUMNS)} FROM workflow_version WHERE id = ${versionId}
    `;
    return row ? mapVersion(row) : null;
  }

  async #replaceGraphContent(
    sql: Sql,
    versionId: string,
    nodes: readonly WorkflowNodeInput[],
    edges: readonly WorkflowEdgeInput[],
    roleBindings: readonly WorkflowRoleBindingInput[],
  ): Promise<void> {
    await sql`DELETE FROM workflow_edge WHERE workflow_version_id = ${versionId}`;
    await sql`DELETE FROM workflow_role_binding WHERE workflow_version_id = ${versionId}`;
    await sql`DELETE FROM workflow_node WHERE workflow_version_id = ${versionId}`;

    for (const node of nodes) {
      await sql`
        INSERT INTO workflow_node (
          workflow_version_id, node_key, block_type, block_contract_version, configuration, position_x, position_y
        ) VALUES (
          ${versionId},
          ${node.nodeKey},
          ${node.block.blockType},
          ${node.block.contractVersion},
          ${sql.json(toJsonValue(node.configuration ?? {}))},
          ${node.position?.x ?? 0},
          ${node.position?.y ?? 0}
        )
      `;
    }
    for (const edge of edges) {
      await sql`
        INSERT INTO workflow_edge (
          workflow_version_id, edge_key, source_node_id, source_port, target_node_id, target_port, condition
        ) VALUES (
          ${versionId},
          ${edge.edgeKey},
          ${edge.sourceNodeId},
          ${edge.sourcePort},
          ${edge.targetNodeId},
          ${edge.targetPort},
          ${edge.condition === undefined || edge.condition === null ? null : sql.json(toJsonValue(edge.condition))}
        )
      `;
    }
    for (const binding of roleBindings) {
      await sql`
        INSERT INTO workflow_role_binding (
          workflow_version_id, workflow_role, identity_group, permissions, tenant, business_unit, client_ids
        ) VALUES (
          ${versionId},
          ${binding.workflowRole},
          ${binding.identityGroup},
          ${sql.json(toJsonValue(binding.permissions))},
          ${binding.tenant},
          ${binding.businessUnit},
          ${binding.clientIds ?? null}
        )
      `;
    }
  }
}
