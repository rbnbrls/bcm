import type { IdentityContext } from "@/lib/identity/types";
import { captureError } from "@/lib/sentry-helper";
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
import { clientConfigReadService } from "@/lib/workflow-studio/read-adapters";
import type { WorkflowFormField } from "@/lib/workflow-studio/form-schema";

export type WorkflowRuntimeAccountOption = Readonly<{
  value: string;
  label: string;
  currentValues: Readonly<Record<string, string | null>>;
}>;

export type WorkflowRuntimeStartModel = Readonly<{
  definitionId: string;
  workflowVersionId: string;
  versionNumber: number;
  contentHash: string;
  slug: string;
  name: string;
  description: string;
  catalogDescription: string;
  category: string;
  costModel: Readonly<{ baseCost: number; perItemCost?: number; currency: string; description: string }>;
  scope: WorkflowDataScope;
  forms: readonly WorkflowRuntimeFormDefinition[];
  accountOptions?: readonly WorkflowRuntimeAccountOption[];
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

const dynamicOptionFields: Readonly<Record<string, Readonly<{
  resourceId: string;
  fields: readonly string[];
  label: (values: Readonly<Record<string, unknown>>) => string;
}>>> = {
  client_code: {
    resourceId: "client",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)} — ${String(values.name)}`,
  },
  asset_class_code: {
    resourceId: "asset_class",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)} — ${String(values.name)}`,
  },
  sub_asset_class_code: {
    resourceId: "sub_asset_class",
    fields: ["code", "name", "asset_class_code"],
    label: (values) => `${String(values.code)} — ${String(values.name)} (${String(values.asset_class_code)})`,
  },
  manager_code: {
    resourceId: "manager",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)} — ${String(values.name)}`,
  },
  benchmark_code: {
    resourceId: "benchmark",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)}${values.name ? ` — ${String(values.name)}` : ""}`,
  },
  npc_classification_id: {
    resourceId: "npc_classification",
    fields: ["id", "name"],
    label: (values) => `${String(values.id)} — ${String(values.name)}`,
  },
  requested_asset_class_code: {
    resourceId: "asset_class",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)} — ${String(values.name)}`,
  },
  requested_sub_asset_class_code: {
    resourceId: "sub_asset_class",
    fields: ["code", "name", "asset_class_code"],
    label: (values) => `${String(values.code)} — ${String(values.name)} (${String(values.asset_class_code)})`,
  },
  requested_benchmark_code: {
    resourceId: "benchmark",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)}${values.name ? ` — ${String(values.name)}` : ""}`,
  },
  requested_manager_code: {
    resourceId: "manager",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)} — ${String(values.name)}`,
  },
  requested_client_code: {
    resourceId: "client",
    fields: ["code", "name"],
    label: (values) => `${String(values.code)} — ${String(values.name)}`,
  },
  requested_portfolio_code: {
    resourceId: "portfolio",
    fields: ["code", "parent_account_code"],
    label: (values) => `${String(values.code)}${values.parent_account_code ? ` — ${String(values.parent_account_code)}` : ""}`,
  },
  requested_npc_classification_id: {
    resourceId: "npc_classification",
    fields: ["id", "name"],
    label: (values) => `${String(values.id)} — ${String(values.name)}`,
  },
};

function asDynamicSelect(field: WorkflowFormField, options: readonly { value: string; label: string }[]): WorkflowFormField {
  if (!(field.id in dynamicOptionFields) && field.id !== "primary_account_id") return field;
  return {
    id: field.id,
    label: field.label,
    type: "select",
    required: field.required,
    ...(field.helpText ? { helpText: field.helpText } : {}),
    options: [...options],
  };
}

function uniqueSelectOptions(options: readonly { value: string; label: string }[]): readonly { value: string; label: string }[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

async function enrichForms(
  snapshot: WorkflowVersionSnapshot,
  identity: IdentityContext,
  scope: WorkflowDataScope,
  forms: readonly WorkflowRuntimeFormDefinition[],
): Promise<Readonly<{
  forms: readonly WorkflowRuntimeFormDefinition[];
  accountOptions: readonly WorkflowRuntimeAccountOption[];
}>> {
  const fields = forms.flatMap((form) => form.configuration.fields);
  const hasAccountSelector = fields.some((field) => field.id === "primary_account_id");
  const accountOptions = hasAccountSelector
    ? (await clientConfigReadService.search({
      identity,
      scope,
      resourceId: "portfolio_configuration",
      fields: [
        "primary_account_id",
        "client_code",
        "portfolio_code",
        "asset_class_code",
        "sub_asset_class_code",
        "manager_code",
        "benchmark_code",
        "npc_classification_id",
        "long_name",
        "short_name",
        "active",
        "effective_from",
        "effective_until",
      ],
      limit: 250,
    })).map((record) => ({
      value: record.sourceRecordId,
      label: `${record.sourceRecordId} — ${String(record.fields.portfolio_code ?? "Portfolio")} · ${String(record.fields.asset_class_code ?? "")} / ${String(record.fields.sub_asset_class_code ?? "")}`,
      currentValues: {
        current_client_code: String(record.fields.client_code ?? ""),
        current_portfolio_code: String(record.fields.portfolio_code ?? ""),
        current_asset_class_code: String(record.fields.asset_class_code ?? ""),
        current_sub_asset_class_code: String(record.fields.sub_asset_class_code ?? ""),
        current_manager_code: String(record.fields.manager_code ?? ""),
        current_benchmark_code: String(record.fields.benchmark_code ?? ""),
        current_npc_classification_id: String(record.fields.npc_classification_id ?? ""),
        current_long_name: String(record.fields.long_name ?? ""),
        current_short_name: String(record.fields.short_name ?? ""),
        current_active: String(record.fields.active ?? ""),
        current_effective_from: String(record.fields.effective_from ?? ""),
        current_effective_until: String(record.fields.effective_until ?? ""),
      },
    }))
    : [];

  if (hasAccountSelector && accountOptions.length === 0) {
    throw new Error("Er zijn geen bestaande portfolio-configuraties beschikbaar binnen jouw scope.");
  }

  const optionCache = new Map<string, readonly { value: string; label: string }[]>();
  const loadOptions = async (field: WorkflowFormField): Promise<readonly { value: string; label: string }[] | null> => {
    const spec = dynamicOptionFields[field.id];
    if (!spec) return null;
    const cached = optionCache.get(field.id);
    if (cached) return cached;
    const options = uniqueSelectOptions((await clientConfigReadService.search({
      identity,
      scope,
      resourceId: spec.resourceId,
      fields: spec.fields,
      limit: 250,
    })).map((record) => ({ value: String(record.fields.code ?? record.sourceRecordId), label: spec.label(record.fields) })));
    optionCache.set(field.id, options);
    return options;
  };

  const enrichedForms = await Promise.all(forms.map(async (form) => {
    const enrichedFields = await Promise.all(form.configuration.fields.map(async (field) => {
      if (field.id === "primary_account_id") {
        // currentValues is runtime enrichment metadata used to populate the
        // read-only current fields. It is not part of the strict select
        // option contract and must never be sent to form validation.
        return asDynamicSelect(field, uniqueSelectOptions(accountOptions.map(({ value, label }) => ({ value, label }))));
      }
      const options = await loadOptions(field);
      return options ? asDynamicSelect(field, options) : field;
    }));
    return {
      ...form,
      configuration: { ...form.configuration, fields: enrichedFields },
    };
  }));
  return { forms: enrichedForms, accountOptions };
}

async function startModel(
  snapshot: WorkflowVersionSnapshot,
  identity: IdentityContext,
  scope: WorkflowDataScope,
): Promise<WorkflowRuntimeStartServiceResult<WorkflowRuntimeStartModel>> {
  const forms: WorkflowRuntimeFormDefinition[] = [];
  for (const node of snapshot.nodes.filter((item) => item.blockType === "form")) {
    const parsed = workflowFormBlockConfigurationSchema.safeParse(node.configuration);
    if (!parsed.success) return denied("invalid_definition", `Formuliernode ${node.nodeKey} heeft geen geldig gepubliceerd contract.`);
    forms.push({ nodeId: node.id, nodeKey: node.nodeKey, configuration: parsed.data });
  }
  if (forms.length === 0) return denied("invalid_definition", "Deze workflow heeft geen aanvraagformulier.");
  let enriched: Awaited<ReturnType<typeof enrichForms>>;
  try {
    enriched = await enrichForms(snapshot, identity, scope, forms);
  } catch (error) {
    captureError(error, {
      endpoint: "WorkflowRuntimeStartService",
      phase: "load_dynamic_form_options",
      workflowVersionId: snapshot.version.id,
    });
    return denied("invalid_definition", "De keuzelijsten voor deze aanvraag konden niet worden geladen.");
  }
  return {
    ok: true,
      value: {
        definitionId: snapshot.definition.id,
        workflowVersionId: snapshot.version.id,
        versionNumber: snapshot.version.versionNumber,
        contentHash: snapshot.version.contentHash ?? "",
        slug: snapshot.definition.slug,
        name: snapshot.definition.name,
      description: snapshot.definition.description,
      catalogDescription: snapshot.definition.catalogDescription ?? "",
      category: snapshot.definition.category ?? "other",
      costModel: snapshot.definition.costModel ?? { baseCost: 0, currency: "EUR", description: "" },
      scope,
      forms: Object.freeze(enriched.forms),
      accountOptions: Object.freeze(enriched.accountOptions),
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
    return startModel(snapshot, identity, scope);
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
