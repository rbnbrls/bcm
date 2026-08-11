import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowVersionSnapshot } from "@/lib/workflow-studio/definition-repository";
import type { WorkflowEngineResult, WorkflowRuntimeEngine } from "@/lib/workflow-studio/runtime-engine";
import { workflowFormBlockConfigurationSchema } from "@/lib/workflow-studio/form-schema";
import type { WorkflowRuntimeFormDefinition } from "@/lib/workflow-studio/runtime-form";
import type { WorkflowVariableAssignment } from "@/lib/workflow-studio/runtime-variables";
import {
  authorizeWorkflowAction,
  getIdentityClientScope,
  type WorkflowDataScope,
} from "@/lib/workflow-studio-authorization";

export type WorkflowRuntimeStartModel = Readonly<{
  definitionId: string;
  workflowVersionId: string;
  versionNumber: number;
  contentHash: string;
  name: string;
  description: string;
  catalogDescription: string;
  category: string;
  costModel: Readonly<{ baseCost: number; perItemCost?: number; currency: string; description: string }>;
  scope: WorkflowDataScope;
  forms: readonly WorkflowRuntimeFormDefinition[];
}>;

export type WorkflowRuntimeStartServiceCode =
  | "definition_not_startable"
  | "identity_scope_missing"
  | "invalid_definition"
  | "permission_denied"
  | "scope_denied"
  | "starter_role_denied"
  | "version_not_found";

export type WorkflowRuntimeStartServiceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: WorkflowRuntimeStartServiceCode; message: string }>;

export interface WorkflowRuntimeDefinitionReader {
  loadVersion(versionId: string): Promise<WorkflowVersionSnapshot | null>;
}

function denied<T>(code: WorkflowRuntimeStartServiceCode, message: string): WorkflowRuntimeStartServiceResult<T> {
  return { ok: false, code, message };
}

function runtimeScope(identity: IdentityContext, snapshot: WorkflowVersionSnapshot): WorkflowDataScope | null {
  if (!identity.tenant || !identity.businessUnit) return null;
  const identityClients = getIdentityClientScope(identity);
  const definitionClients = snapshot.definition.clientIds;
  let clientIds: string[] | undefined;
  if (identityClients && definitionClients) {
    clientIds = identityClients.filter((id) => definitionClients.includes(id));
    if (clientIds.length === 0) return null;
  } else if (identityClients) {
    clientIds = identityClients;
  } else if (definitionClients) {
    clientIds = [...definitionClients];
  }
  return {
    tenant: snapshot.definition.tenant,
    businessUnit: snapshot.definition.businessUnit,
    ...(clientIds ? { clientIds } : {}),
  };
}

function starterRoles(snapshot: WorkflowVersionSnapshot): readonly string[] {
  const start = snapshot.nodes.find((node) => node.blockType === "manual_start");
  if (!start || !start.configuration || typeof start.configuration !== "object") return [];
  const value = (start.configuration as Record<string, unknown>).starterRoleIds;
  // Older published versions predate persisted schema defaults. For those
  // versions workflow:start remains the complete starter contract. Once roles
  // are explicit, the matching role binding is mandatory.
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function identityCanUseStarterRole(identity: IdentityContext, snapshot: WorkflowVersionSnapshot): boolean {
  const roles = new Set(starterRoles(snapshot));
  if (roles.size === 0) return true;
  return snapshot.roleBindings.some((binding) => (
    roles.has(binding.workflowRole)
    && binding.permissions.includes("workflow:start")
    && identity.groups.includes(binding.identityGroup)
  ));
}

function startModel(snapshot: WorkflowVersionSnapshot, scope: WorkflowDataScope): WorkflowRuntimeStartServiceResult<WorkflowRuntimeStartModel> {
  const forms: WorkflowRuntimeFormDefinition[] = [];
  for (const node of snapshot.nodes.filter((item) => item.blockType === "form")) {
    const parsed = workflowFormBlockConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) return denied("invalid_definition", `Formuliernode ${node.nodeKey} heeft geen geldig gepubliceerd contract.`);
    forms.push({ nodeId: node.id, nodeKey: node.nodeKey, configuration: parsed.data });
  }
  if (forms.length === 0) return denied("invalid_definition", "Deze workflow heeft geen aanvraagformulier.");
  return {
    ok: true,
    value: {
      definitionId: snapshot.definition.id,
      workflowVersionId: snapshot.version.id,
      versionNumber: snapshot.version.versionNumber,
      contentHash: snapshot.version.contentHash ?? "",
      name: snapshot.definition.name,
      description: snapshot.definition.description,
      catalogDescription: snapshot.definition.catalogDescription ?? "",
      category: snapshot.definition.category ?? "other",
      costModel: snapshot.definition.costModel ?? { baseCost: 0, currency: "EUR", description: "" },
      scope,
      forms: Object.freeze(forms),
    },
  };
}

export class WorkflowRuntimeStartService {
  constructor(
    private readonly definitions: WorkflowRuntimeDefinitionReader,
    private readonly engine: Pick<WorkflowRuntimeEngine, "start">,
  ) {}

  async prepare(identity: IdentityContext, workflowVersionId: string): Promise<WorkflowRuntimeStartServiceResult<WorkflowRuntimeStartModel>> {
    const snapshot = await this.definitions.loadVersion(workflowVersionId);
    if (!snapshot) return denied("version_not_found", "De workflowversie bestaat niet.");
    if (snapshot.version.status !== "published" || snapshot.definition.status !== "published") {
      return denied("definition_not_startable", "Alleen een gepubliceerde, actieve workflow kan worden gestart.");
    }
    const scope = runtimeScope(identity, snapshot);
    if (!scope) return denied("identity_scope_missing", "De identiteit en workflow hebben geen gemeenschappelijke datascope.");
    const authorization = authorizeWorkflowAction(identity, "workflow:start", scope);
    if (!authorization.authorized) {
      return denied(authorization.code === "permission_denied" ? "permission_denied" : "scope_denied", authorization.message);
    }
    if (!identityCanUseStarterRole(identity, snapshot)) {
      return denied("starter_role_denied", "De gebruiker is niet gekoppeld aan een toegestane starterrol voor deze workflowversie.");
    }
    return startModel(snapshot, scope);
  }

  async start(identity: IdentityContext, input: Readonly<{
    workflowVersionId: string;
    idempotencyKey: string;
    correlationId: string;
    values: Readonly<Record<string, unknown>>;
    variables: readonly WorkflowVariableAssignment[];
    occurredAt: string;
  }>): Promise<WorkflowRuntimeStartServiceResult<WorkflowEngineResult>> {
    const prepared = await this.prepare(identity, input.workflowVersionId);
    if (!prepared.ok) return prepared;
    const result = await this.engine.start({
      workflowVersionId: input.workflowVersionId,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      actor: { type: "user", id: identity.userId, sessionId: identity.sessionId },
      input: input.values,
      variables: input.variables,
      ...(prepared.value.scope.clientIds ? { clientIds: prepared.value.scope.clientIds } : {}),
      occurredAt: input.occurredAt,
    });
    return { ok: true, value: result };
  }
}

export function createWorkflowRuntimeStartService(
  definitions: WorkflowRuntimeDefinitionReader,
  engine: Pick<WorkflowRuntimeEngine, "start">,
): WorkflowRuntimeStartService {
  return new WorkflowRuntimeStartService(definitions, engine);
}
