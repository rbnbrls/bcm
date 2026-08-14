import type { ApplyStrategy } from "@/lib/change-types/templates";
import type { IdentityContext } from "@/lib/identity/types";
import { authorizeWorkflowAction, type WorkflowDataScope } from "@/lib/workflow-studio-authorization";
import {
  DataCatalog,
  clientConfigDataCatalog,
  type DataCatalogOperation,
} from "@/lib/workflow-studio/data-catalog";
import {
  type ClientConfigReadService,
  type JsonValue,
  type WorkflowDataSnapshot,
} from "@/lib/workflow-studio/read-adapters";

export const WORKFLOW_CHANGE_INTENT_VERSION = 1 as const;

/** Closed set of existing governed staging entry points. */
export type GovernedStageHandlerId =
  | "stage_client_onboarding"
  | "stage_change_lookup_request"
  | "stage_change_portfolio_metadata"
  | "stage_change_portfolio_configuration";

export type MutationAdapterDefinition = Readonly<{
  id: string;
  resourceId: string;
  operation: DataCatalogOperation;
  stageHandlerId: GovernedStageHandlerId;
  applyStrategy: ApplyStrategy;
}>;

export type MutationPreconditions = Readonly<{
  /** Required for UPDATE and RETIRE; absent for CREATE. */
  snapshot?: WorkflowDataSnapshot;
  /** Optional extra IST assertions, using catalog attribute IDs only. */
  expectedValues?: Readonly<Record<string, JsonValue>>;
}>;

export type WorkflowChangeIntent = Readonly<{
  intentVersion: typeof WORKFLOW_CHANGE_INTENT_VERSION;
  resourceId: string;
  operation: DataCatalogOperation;
  values: Readonly<Record<string, JsonValue>>;
  preconditions: MutationPreconditions;
  idempotencyKey: string;
  effectiveAt?: string;
  rationale: string;
}>;

export type MutationContractIssueCode =
  | "mutation_not_authorized"
  | "adapter_not_registered"
  | "invalid_intent"
  | "unknown_mutation_attribute"
  | "operation_not_requestable"
  | "invalid_mutation_value"
  | "snapshot_required"
  | "snapshot_not_allowed"
  | "snapshot_resource_mismatch"
  | "source_record_not_found"
  | "concurrency_conflict"
  | "precondition_failed";

export type MutationContractIssue = Readonly<{
  code: MutationContractIssueCode;
  path: readonly (string | number)[];
  message: string;
}>;

export type MutationDryRunResult = Readonly<{
  status: "ready" | "invalid" | "conflicted";
  adapterId?: string;
  stageHandlerId?: GovernedStageHandlerId;
  applyStrategy?: ApplyStrategy;
  issues: readonly MutationContractIssue[];
}>;

/** Result persisted after the runtime has invoked a governed stage/apply path. */
export type MutationExecutionResult = Readonly<{
  status: "staged" | "applied" | "rejected" | "conflicted" | "failed";
  adapterId: string;
  changeRequestId?: string;
  stagingReference?: string;
  auditReference?: string;
  appliedResourceId?: string;
  errorCode?: string;
  message?: string;
}>;

export class MutationAdapterRegistry {
  readonly #definitions: ReadonlyMap<string, MutationAdapterDefinition>;

  constructor(definitions: readonly MutationAdapterDefinition[]) {
    const entries = new Map<string, MutationAdapterDefinition>();
    for (const definition of definitions) {
      const key = MutationAdapterRegistry.key(definition.resourceId, definition.operation);
      if (entries.has(key)) throw new Error(`Dubbele mutation adapter voor ${key}.`);
      entries.set(key, Object.freeze({ ...definition }));
    }
    this.#definitions = entries;
  }

  static key(resourceId: string, operation: DataCatalogOperation): string {
    return `${resourceId}:${operation}`;
  }

  resolve(resourceId: string, operation: DataCatalogOperation): MutationAdapterDefinition | undefined {
    return this.#definitions.get(MutationAdapterRegistry.key(resourceId, operation));
  }

  list(): readonly MutationAdapterDefinition[] {
    return Object.freeze([...this.#definitions.values()]);
  }
}

const adapterDefinitions = [
  {
    id: "client-config.client.create.v1",
    resourceId: "client",
    operation: "CREATE",
    stageHandlerId: "stage_client_onboarding",
    applyStrategy: "staged_client_onboarding",
  },
  ...(["CREATE", "RETIRE"] as const).flatMap((operation) => [
    {
      id: `client-config.parent-account.${operation.toLowerCase()}.v1`,
      resourceId: "parent_account",
      operation,
      stageHandlerId: "stage_change_portfolio_metadata" as const,
      applyStrategy: "staged_metadata" as const,
    },
    {
      id: `client-config.portfolio.${operation.toLowerCase()}.v1`,
      resourceId: "portfolio",
      operation,
      stageHandlerId: "stage_change_portfolio_metadata" as const,
      applyStrategy: "staged_metadata" as const,
    },
  ]),
  {
    id: "client-config.asset-class.create.v1",
    resourceId: "asset_class",
    operation: "CREATE",
    stageHandlerId: "stage_change_lookup_request",
    applyStrategy: "staged_lookup",
  },
  {
    id: "client-config.sub-asset-class.create.v1",
    resourceId: "sub_asset_class",
    operation: "CREATE",
    stageHandlerId: "stage_change_lookup_request",
    applyStrategy: "staged_lookup",
  },
  {
    id: "client-config.benchmark.create.v1",
    resourceId: "benchmark",
    operation: "CREATE",
    stageHandlerId: "stage_change_lookup_request",
    applyStrategy: "staged_lookup",
  },
  ...(["CREATE", "UPDATE", "RETIRE"] as const).map((operation) => ({
    id: `client-config.portfolio-configuration.${operation.toLowerCase()}.v1`,
    resourceId: "portfolio_configuration",
    operation,
    stageHandlerId: "stage_change_portfolio_configuration" as const,
    applyStrategy: "staged_portfolio_configuration" as const,
  })),
] as const satisfies readonly MutationAdapterDefinition[];

export const clientConfigMutationAdapterRegistry = new MutationAdapterRegistry(adapterDefinitions);

function issue(
  code: MutationContractIssueCode,
  message: string,
  path: readonly (string | number)[] = [],
): MutationContractIssue {
  return Object.freeze({ code, message, path: Object.freeze([...path]) });
}

function freezeResult(result: MutationDryRunResult): MutationDryRunResult {
  return Object.freeze({ ...result, issues: Object.freeze([...result.issues]) });
}

function validIdempotencyKey(value: string): boolean {
  return value.trim().length >= 8 && value.length <= 200 && !/[\r\n]/.test(value);
}

function validInstant(value: string | undefined): boolean {
  return value === undefined || (!Number.isNaN(Date.parse(value)) && /T/.test(value));
}

export class ClientConfigMutationContractService {
  constructor(
    readonly reads: Pick<ClientConfigReadService, "snapshot">,
    readonly catalog: DataCatalog = clientConfigDataCatalog,
    readonly registry: MutationAdapterRegistry = clientConfigMutationAdapterRegistry,
  ) {}

  async dryRun(request: {
    identity: IdentityContext;
    scope: WorkflowDataScope;
    intent: WorkflowChangeIntent;
  }): Promise<MutationDryRunResult> {
    const auth = authorizeWorkflowAction(request.identity, "workflow:test", request.scope);
    if (!auth.authorized) {
      return freezeResult({
        status: "invalid",
        issues: [issue("mutation_not_authorized", auth.message)],
      });
    }

    const { intent } = request;
    const adapter = this.registry.resolve(intent.resourceId, intent.operation);
    if (!adapter) {
      return freezeResult({
        status: "invalid",
        issues: [issue(
          "adapter_not_registered",
          `Geen goedgekeurde mutation adapter voor ${intent.resourceId}:${intent.operation}.`,
          ["resourceId"],
        )],
      });
    }

    const issues = this.#validateIntent(intent);
    if (issues.length > 0) {
      return freezeResult({ status: "invalid", adapterId: adapter.id, issues });
    }

    if (intent.operation !== "CREATE") {
      const expected = intent.preconditions.snapshot!;
      let current: WorkflowDataSnapshot;
      try {
        current = await this.reads.snapshot({
          identity: request.identity,
          scope: request.scope,
          resourceId: intent.resourceId,
          sourceRecordId: expected.sourceRecordId,
          fields: Object.keys(expected.selectedFields),
        });
      } catch {
        return freezeResult({
          status: "conflicted",
          adapterId: adapter.id,
          issues: [issue("source_record_not_found", "De bronrecord bestaat niet meer.", ["preconditions", "snapshot"])],
        });
      }

      if (current.concurrencyToken !== expected.concurrencyToken) {
        return freezeResult({
          status: "conflicted",
          adapterId: adapter.id,
          issues: [issue(
            "concurrency_conflict",
            "De bronrecord is gewijzigd sinds de workflow-snapshot is gemaakt.",
            ["preconditions", "snapshot", "concurrencyToken"],
          )],
        });
      }
      for (const [attributeId, expectedValue] of Object.entries(intent.preconditions.expectedValues ?? {})) {
        if (JSON.stringify(current.selectedFields[attributeId]) !== JSON.stringify(expectedValue)) {
          return freezeResult({
            status: "conflicted",
            adapterId: adapter.id,
            issues: [issue(
              "precondition_failed",
              `De IST-precondition voor ${attributeId} is niet meer waar.`,
              ["preconditions", "expectedValues", attributeId],
            )],
          });
        }
      }
    }

    return freezeResult({
      status: "ready",
      adapterId: adapter.id,
      stageHandlerId: adapter.stageHandlerId,
      applyStrategy: adapter.applyStrategy,
      issues: [],
    });
  }

  #validateIntent(intent: WorkflowChangeIntent): MutationContractIssue[] {
    const issues: MutationContractIssue[] = [];
    if (
      intent.intentVersion !== WORKFLOW_CHANGE_INTENT_VERSION
      || !validIdempotencyKey(intent.idempotencyKey)
      || !intent.rationale.trim()
      || !validInstant(intent.effectiveAt)
      || Object.keys(intent.values).length === 0
    ) {
      issues.push(issue("invalid_intent", "Intentversie, idempotency key, rationale, ingangsdatum en waarden zijn ongeldig."));
    }

    const resource = this.catalog.resolve({ resourceId: intent.resourceId, operation: intent.operation });
    if (!resource.valid) {
      issues.push(issue(
        resource.code === "operation_not_requestable" ? "operation_not_requestable" : "invalid_intent",
        resource.message,
        ["resourceId"],
      ));
      return issues;
    }

    for (const [attributeId, value] of Object.entries(intent.values)) {
      const resolved = this.catalog.resolve({
        resourceId: intent.resourceId,
        attributeId,
        operation: intent.operation,
      });
      if (!resolved.valid || !resolved.attribute) {
        issues.push(issue(
          resolved.valid || resolved.code !== "operation_not_requestable"
            ? "unknown_mutation_attribute"
            : "operation_not_requestable",
          resolved.valid ? `Onbekend catalogusattribuut: ${attributeId}.` : resolved.message,
          ["values", attributeId],
        ));
        continue;
      }
      const validation = resolved.attribute.validateValue(value);
      if (!validation.valid) {
        issues.push(issue(
          "invalid_mutation_value",
          validation.issues.map((entry) => entry.message).join(" "),
          ["values", attributeId],
        ));
      }
    }

    if (intent.operation === "CREATE" && intent.preconditions.snapshot) {
      issues.push(issue("snapshot_not_allowed", "CREATE mag niet naar een bestaande snapshot verwijzen.", ["preconditions", "snapshot"]));
    }
    if (intent.operation !== "CREATE" && !intent.preconditions.snapshot) {
      issues.push(issue("snapshot_required", `${intent.operation} vereist een reproduceerbare bron-snapshot.`, ["preconditions", "snapshot"]));
    }
    if (intent.preconditions.snapshot?.resourceId !== undefined
      && intent.preconditions.snapshot.resourceId !== intent.resourceId) {
      issues.push(issue("snapshot_resource_mismatch", "De snapshot hoort bij een andere catalogusresource.", ["preconditions", "snapshot", "resourceId"]));
    }

    for (const [attributeId, value] of Object.entries(intent.preconditions.expectedValues ?? {})) {
      const resolved = this.catalog.resolve({ resourceId: intent.resourceId, attributeId });
      if (!resolved.valid || !resolved.attribute) {
        issues.push(issue("unknown_mutation_attribute", resolved.valid ? `Onbekend attribuut: ${attributeId}.` : resolved.message, ["preconditions", "expectedValues", attributeId]));
      } else if (!resolved.attribute.validateValue(value).valid) {
        issues.push(issue("invalid_mutation_value", `Ongeldige IST-waarde voor ${attributeId}.`, ["preconditions", "expectedValues", attributeId]));
      }
    }
    return issues;
  }
}
