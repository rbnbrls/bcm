import { createHash } from "node:crypto";
import type { IdentityContext } from "@/lib/identity/types";
import {
  getClientConfigPortfolioConfigurations,
  getClientConfigReferenceData,
} from "@/lib/client-config-db";
import { authorizeWorkflowAction, type WorkflowDataScope } from "@/lib/workflow-studio-authorization";
import {
  DataCatalog,
  clientConfigDataCatalog,
  type DataCatalogAttribute,
  type DataCatalogResource,
} from "@/lib/workflow-studio/data-catalog";

export const WORKFLOW_DATA_SNAPSHOT_VERSION = 1 as const;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ClientConfigSourceRecord = {
  sourceRecordId: string;
  values: Readonly<Record<string, JsonValue>>;
  /** Null means business-unit data; an array identifies the clients owning the record. */
  scopeClientIds: readonly string[] | null;
};

export interface ClientConfigReadSource {
  read(resourceId: string): Promise<readonly ClientConfigSourceRecord[]>;
}

export type ClientConfigReadRecord = {
  resourceId: string;
  sourceRecordId: string;
  fields: Readonly<Record<string, JsonValue>>;
  concurrencyToken: string;
};

export type WorkflowDataSnapshot = {
  snapshotVersion: typeof WORKFLOW_DATA_SNAPSHOT_VERSION;
  resourceId: string;
  sourceRecordId: string;
  selectedFields: Readonly<Record<string, JsonValue>>;
  concurrencyToken: string;
  readAt: string;
};

type ReadRequest = {
  identity: IdentityContext;
  scope: WorkflowDataScope;
  resourceId: string;
  fields?: readonly string[];
};

export type SearchClientConfigRequest = ReadRequest & {
  query?: string;
  limit?: number;
};

export type SelectClientConfigRequest = ReadRequest & {
  filters: readonly { attributeId: string; value: JsonValue }[];
  limit?: number;
};

export type GetClientConfigRequest = ReadRequest & {
  sourceRecordId: string;
};

export type ClientConfigReadErrorCode =
  | "read_not_authorized"
  | "invalid_read_request"
  | "unknown_read_resource"
  | "unknown_read_attribute"
  | "invalid_filter_value"
  | "source_record_not_found"
  | "source_contract_violation";

export class ClientConfigReadError extends Error {
  constructor(readonly code: ClientConfigReadErrorCode, message: string) {
    super(message);
    this.name = "ClientConfigReadError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function concurrencyToken(resourceId: string, record: ClientConfigSourceRecord): string {
  const content = canonicalJson({
    snapshotVersion: WORKFLOW_DATA_SNAPSHOT_VERSION,
    resourceId,
    sourceRecordId: record.sourceRecordId,
    values: record.values,
  });
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function limitOrDefault(value: number | undefined): number {
  const limit = value ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ClientConfigReadError("invalid_read_request", "Een read-limit moet tussen 1 en 100 liggen.");
  }
  return limit;
}

function scoped(record: ClientConfigSourceRecord, scope: WorkflowDataScope): boolean {
  if (record.scopeClientIds === null || scope.clientIds === undefined) return true;
  return record.scopeClientIds.some((clientId) => scope.clientIds!.includes(clientId));
}

function comparable(value: JsonValue): string {
  return typeof value === "string" ? value.toLocaleLowerCase("nl-NL") : canonicalJson(value);
}

function sameValue(left: JsonValue, right: JsonValue): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function immutableSourceRecord(
  sourceRecordId: string,
  values: Record<string, JsonValue>,
  scopeClientIds: readonly string[] | null,
): ClientConfigSourceRecord {
  return Object.freeze({
    sourceRecordId,
    values: deepFreeze({ ...values }),
    scopeClientIds: scopeClientIds === null ? null : Object.freeze([...new Set(scopeClientIds)]),
  });
}

/**
 * Fixed server-side mappings from the normalized client-config repository to
 * catalog IDs. Callers can never supply table names, columns or query text.
 */
export class DefaultClientConfigReadSource implements ClientConfigReadSource {
  async read(resourceId: string): Promise<readonly ClientConfigSourceRecord[]> {
    const [referenceData, configurations] = await Promise.all([
      getClientConfigReferenceData(),
      getClientConfigPortfolioConfigurations(),
    ]);
    const portfolioClients = new Map<string, Set<string>>();
    const parentAccountClients = new Map<string, Set<string>>();
    for (const configuration of configurations) {
      const portfolioSet = portfolioClients.get(configuration.portfolioCode) ?? new Set<string>();
      portfolioSet.add(configuration.clientCode);
      portfolioClients.set(configuration.portfolioCode, portfolioSet);
      if (configuration.parentAccountCode) {
        const parentSet = parentAccountClients.get(configuration.parentAccountCode) ?? new Set<string>();
        parentSet.add(configuration.clientCode);
        parentAccountClients.set(configuration.parentAccountCode, parentSet);
      }
    }
    const assetClassCodes = new Map(referenceData.assetClasses.map((item) => [item.assetClassId, item.assetClassCode]));

    const records: Record<string, readonly ClientConfigSourceRecord[]> = {
      client: referenceData.clients.map((item) => immutableSourceRecord(item.clientCode, {
        code: item.clientCode,
        name: item.clientName,
      }, [item.clientCode])),
      parent_account: referenceData.parentAccounts.map((item) => immutableSourceRecord(item.parentAccountCode, {
        code: item.parentAccountCode,
        msa_code: item.msaParentAccountCode,
        active: item.activeInd,
      }, [...(parentAccountClients.get(item.parentAccountCode) ?? [])])),
      portfolio: referenceData.portfolios.map((item) => {
        const parentAccount = item.parentAccountId === null
          ? null
          : referenceData.parentAccounts.find((candidate) => candidate.parentAccountId === item.parentAccountId);
        return immutableSourceRecord(item.portfolioCode, {
          code: item.portfolioCode,
          parent_account_code: parentAccount?.parentAccountCode ?? null,
          active: item.activeInd,
        }, [...(portfolioClients.get(item.portfolioCode) ?? [])]);
      }),
      portfolio_configuration: configurations.map((item) => immutableSourceRecord(item.primaryAccountId, {
        primary_account_id: item.primaryAccountId,
        client_code: item.clientCode,
        portfolio_code: item.portfolioCode,
        asset_class_code: item.assetClassCode,
        sub_asset_class_code: item.subAssetClassCode,
        manager_code: item.managerCode,
        benchmark_code: item.benchmarkCode,
        npc_classification_id: item.npcClassificationId,
        long_name: item.longName,
        short_name: item.shortName,
        active: item.activeInd,
        effective_from: item.effectiveFrom,
        effective_until: item.effectiveUntil,
      }, [item.clientCode])),
      asset_class: referenceData.assetClasses.map((item) => immutableSourceRecord(item.assetClassCode, {
        code: item.assetClassCode,
        name: item.assetClassName,
      }, null)),
      sub_asset_class: referenceData.subAssetClasses.map((item) => immutableSourceRecord(
        `${assetClassCodes.get(item.assetClassId) ?? item.assetClassId}:${item.subAssetClassCode}`,
        {
          code: item.subAssetClassCode,
          name: item.subAssetClassName,
          asset_class_code: assetClassCodes.get(item.assetClassId) ?? "",
          sort_order: item.sortOrder ?? null,
        },
        null,
      )),
      manager: referenceData.managers.map((item) => immutableSourceRecord(item.managerCode, {
        code: item.managerCode,
        name: item.managerName,
      }, null)),
      benchmark: referenceData.benchmarks.map((item) => immutableSourceRecord(item.benchmarkCode, {
        code: item.benchmarkCode,
        name: item.benchmarkName,
        rimes_code: item.rimesCode,
      }, null)),
      npc_classification: referenceData.npcClassifications.map((item) => immutableSourceRecord(String(item.npcClassificationId), {
        id: item.npcClassificationId,
        name: item.classificationName,
      }, null)),
    };
    return records[resourceId] ?? [];
  }
}

export class ClientConfigReadService {
  constructor(
    readonly source: ClientConfigReadSource,
    readonly catalog: DataCatalog = clientConfigDataCatalog,
  ) {}

  #authorize(identity: IdentityContext, scope: WorkflowDataScope): void {
    const decision = authorizeWorkflowAction(identity, "workflow:view", scope);
    if (!decision.authorized) {
      throw new ClientConfigReadError("read_not_authorized", decision.message);
    }
  }

  #resource(resourceId: string): DataCatalogResource {
    const resolved = this.catalog.resolve({ resourceId });
    if (!resolved.valid) {
      throw new ClientConfigReadError("unknown_read_resource", resolved.message);
    }
    return resolved.resource;
  }

  #attributes(resource: DataCatalogResource, fields: readonly string[] | undefined): readonly DataCatalogAttribute[] {
    const requested = fields ?? resource.attributes.filter((item) => item.readable).map((item) => item.id);
    if (requested.length === 0 || new Set(requested).size !== requested.length) {
      throw new ClientConfigReadError("invalid_read_request", "Selecteer minimaal één uniek catalogusattribuut.");
    }
    return Object.freeze(requested.map((attributeId) => {
      const resolved = this.catalog.resolve({ resourceId: resource.id, attributeId });
      if (!resolved.valid) {
        throw new ClientConfigReadError("unknown_read_attribute", resolved.message);
      }
      if (!resolved.attribute) {
        throw new ClientConfigReadError("unknown_read_attribute", `Onbekend catalogusattribuut: ${resource.id}.${attributeId}.`);
      }
      return resolved.attribute;
    }));
  }

  async #records(resource: DataCatalogResource, scope: WorkflowDataScope): Promise<readonly ClientConfigSourceRecord[]> {
    const records = (await this.source.read(resource.id)).filter((record) => scoped(record, scope));
    const recordIds = records.map((record) => record.sourceRecordId);
    if (recordIds.some((id) => !id.trim()) || new Set(recordIds).size !== recordIds.length) {
      throw new ClientConfigReadError("source_contract_violation", `Read adapter voor ${resource.id} leverde ongeldige bron-ID's.`);
    }
    return records;
  }

  #project(
    resource: DataCatalogResource,
    record: ClientConfigSourceRecord,
    attributes: readonly DataCatalogAttribute[],
  ): ClientConfigReadRecord {
    const fields: Record<string, JsonValue> = {};
    for (const attribute of attributes) {
      const value = record.values[attribute.id];
      const validation = attribute.validateValue(value);
      if (!validation.valid) {
        throw new ClientConfigReadError(
          "source_contract_violation",
          `Bronwaarde voor ${resource.id}.${attribute.id} voldoet niet aan het cataloguscontract.`,
        );
      }
      fields[attribute.id] = value;
    }
    return Object.freeze({
      resourceId: resource.id,
      sourceRecordId: record.sourceRecordId,
      fields: deepFreeze(fields),
      concurrencyToken: concurrencyToken(resource.id, record),
    });
  }

  async search(request: SearchClientConfigRequest): Promise<readonly ClientConfigReadRecord[]> {
    this.#authorize(request.identity, request.scope);
    const resource = this.#resource(request.resourceId);
    const attributes = this.#attributes(resource, request.fields);
    const limit = limitOrDefault(request.limit);
    const query = request.query?.trim().toLocaleLowerCase("nl-NL") ?? "";
    if (query.length > 200) {
      throw new ClientConfigReadError("invalid_read_request", "Een zoekterm mag maximaal 200 tekens bevatten.");
    }
    const records = await this.#records(resource, request.scope);
    return Object.freeze(records
      .filter((record) => !query || Object.values(record.values).some((value) => comparable(value).includes(query)))
      .sort((left, right) => left.sourceRecordId.localeCompare(right.sourceRecordId, "nl-NL"))
      .slice(0, limit)
      .map((record) => this.#project(resource, record, attributes)));
  }

  async select(request: SelectClientConfigRequest): Promise<readonly ClientConfigReadRecord[]> {
    this.#authorize(request.identity, request.scope);
    const resource = this.#resource(request.resourceId);
    const attributes = this.#attributes(resource, request.fields);
    const limit = limitOrDefault(request.limit);
    if (request.filters.length === 0 || request.filters.length > 10) {
      throw new ClientConfigReadError("invalid_read_request", "Selecteren vereist één tot tien filters.");
    }
    const filters = request.filters.map((filter) => {
      const resolved = this.catalog.resolve({ resourceId: resource.id, attributeId: filter.attributeId });
      if (!resolved.valid) {
        throw new ClientConfigReadError("unknown_read_attribute", resolved.message);
      }
      if (!resolved.attribute) {
        throw new ClientConfigReadError("unknown_read_attribute", `Onbekend catalogusattribuut: ${resource.id}.${filter.attributeId}.`);
      }
      const validation = resolved.attribute.validateValue(filter.value);
      if (!validation.valid) {
        throw new ClientConfigReadError("invalid_filter_value", `Ongeldige filterwaarde voor ${resource.id}.${filter.attributeId}.`);
      }
      return { attributeId: filter.attributeId, value: validation.value as JsonValue };
    });
    const records = await this.#records(resource, request.scope);
    return Object.freeze(records
      .filter((record) => filters.every((filter) => sameValue(record.values[filter.attributeId], filter.value)))
      .sort((left, right) => left.sourceRecordId.localeCompare(right.sourceRecordId, "nl-NL"))
      .slice(0, limit)
      .map((record) => this.#project(resource, record, attributes)));
  }

  async get(request: GetClientConfigRequest): Promise<ClientConfigReadRecord> {
    this.#authorize(request.identity, request.scope);
    if (!request.sourceRecordId.trim()) {
      throw new ClientConfigReadError("invalid_read_request", "Een bronrecord-ID is verplicht.");
    }
    const resource = this.#resource(request.resourceId);
    const attributes = this.#attributes(resource, request.fields);
    const record = (await this.#records(resource, request.scope))
      .find((candidate) => candidate.sourceRecordId === request.sourceRecordId);
    if (!record) {
      throw new ClientConfigReadError("source_record_not_found", "Het bronrecord bestaat niet binnen de toegestane datascope.");
    }
    return this.#project(resource, record, attributes);
  }

  async snapshot(
    request: GetClientConfigRequest,
    readAt: Date = new Date(),
  ): Promise<WorkflowDataSnapshot> {
    const record = await this.get(request);
    if (Number.isNaN(readAt.getTime())) {
      throw new ClientConfigReadError("invalid_read_request", "De snapshot-leestijd is ongeldig.");
    }
    return deepFreeze({
      snapshotVersion: WORKFLOW_DATA_SNAPSHOT_VERSION,
      resourceId: record.resourceId,
      sourceRecordId: record.sourceRecordId,
      selectedFields: { ...record.fields },
      concurrencyToken: record.concurrencyToken,
      readAt: readAt.toISOString(),
    });
  }
}

export const clientConfigReadService = new ClientConfigReadService(new DefaultClientConfigReadSource());
