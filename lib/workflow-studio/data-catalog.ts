import { z } from "zod";
import type { IdentityContext } from "@/lib/identity/types";
import {
  authorizeWorkflowAction,
  type WorkflowDataScope,
} from "@/lib/workflow-studio-authorization";

export const DATA_CATALOG_OPERATIONS = ["CREATE", "UPDATE", "RETIRE"] as const;
export type DataCatalogOperation = (typeof DATA_CATALOG_OPERATIONS)[number];

export const DATA_CATALOG_VALUE_TYPES = [
  "string",
  "integer",
  "boolean",
  "date",
  "reference",
] as const;
export type DataCatalogValueType = (typeof DATA_CATALOG_VALUE_TYPES)[number];

export type DataCatalogAuthorizationScope = "business_unit" | "client";
export type DataCatalogRelationshipCardinality = "many_to_one" | "one_to_many";

export type DataCatalogRelationship = {
  resourceId: string;
  attributeId: string;
  cardinality: DataCatalogRelationshipCardinality;
};

export type DataCatalogValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; issues: readonly { path: readonly (string | number)[]; message: string }[] };

export type DataCatalogAttribute = {
  id: string;
  label: string;
  description: string;
  valueType: DataCatalogValueType;
  readable: boolean;
  requestableOperations: readonly DataCatalogOperation[];
  authorizationScope: DataCatalogAuthorizationScope;
  validationSchema: Readonly<Record<string, unknown>>;
  relationship?: DataCatalogRelationship;
  validateValue(value: unknown): DataCatalogValidationResult<unknown>;
};

export type DataCatalogResource = {
  id: string;
  label: string;
  description: string;
  authorizationScope: DataCatalogAuthorizationScope;
  identityAttributeId: string;
  attributes: readonly DataCatalogAttribute[];
};

export type PublicDataCatalogAttribute = Pick<
  DataCatalogAttribute,
  "id" | "label" | "description" | "valueType" | "authorizationScope" | "relationship"
>;

export type PublicDataCatalogResource = Pick<
  DataCatalogResource,
  "id" | "label" | "description" | "authorizationScope" | "identityAttributeId"
> & { attributes: readonly PublicDataCatalogAttribute[] };

export type PublicChangeRequestCatalogAttribute = PublicDataCatalogAttribute & {
  requestableOperations: readonly DataCatalogOperation[];
};

export type PublicChangeRequestCatalogResource = Pick<
  DataCatalogResource,
  "id" | "label" | "description" | "authorizationScope" | "identityAttributeId"
> & { attributes: readonly PublicChangeRequestCatalogAttribute[] };

type AttributeInput<TSchema extends z.ZodType> = Omit<
  DataCatalogAttribute,
  "validationSchema" | "validateValue"
> & { schema: TSchema };

type ResourceInput = Omit<DataCatalogResource, "attributes"> & {
  attributes: readonly DataCatalogAttribute[];
};

export type DataCatalogReference = {
  resourceId: string;
  attributeId?: string;
  operation?: DataCatalogOperation;
};

export type DataCatalogReferenceErrorCode =
  | "unknown_catalog_resource"
  | "unknown_catalog_attribute"
  | "attribute_not_readable"
  | "operation_not_requestable";

export type DataCatalogReferenceResult =
  | { valid: true; resource: DataCatalogResource; attribute?: DataCatalogAttribute }
  | { valid: false; code: DataCatalogReferenceErrorCode; message: string };

export class InvalidDataCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDataCatalogError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function assertStableId(id: string, label: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    throw new InvalidDataCatalogError(`${label} moet een stabiele snake_case-ID zijn.`);
  }
}

function attribute<TSchema extends z.ZodType>(input: AttributeInput<TSchema>): DataCatalogAttribute {
  assertStableId(input.id, "Attribuut-ID");
  if (!input.label.trim() || !input.description.trim()) {
    throw new InvalidDataCatalogError(`Attribuut ${input.id} vereist een label en beschrijving.`);
  }
  if (new Set(input.requestableOperations).size !== input.requestableOperations.length) {
    throw new InvalidDataCatalogError(`Attribuut ${input.id} bevat dubbele operaties.`);
  }
  const validationSchema = z.toJSONSchema(input.schema, {
    target: "draft-07",
    io: "input",
    unrepresentable: "throw",
  }) as Record<string, unknown>;
  const { schema, ...definition } = input;

  return Object.freeze({
    ...definition,
    requestableOperations: Object.freeze([...input.requestableOperations]),
    relationship: input.relationship ? Object.freeze({ ...input.relationship }) : undefined,
    validationSchema: deepFreeze(validationSchema),
    validateValue(value: unknown): DataCatalogValidationResult<z.output<TSchema>> {
      const parsed = schema.safeParse(value);
      return parsed.success
        ? { valid: true, value: parsed.data }
        : {
            valid: false,
            issues: Object.freeze(parsed.error.issues.map((issue) => Object.freeze({
              path: Object.freeze(issue.path.map((part) => typeof part === "symbol" ? String(part) : part)),
              message: issue.message,
            }))),
          };
    },
  });
}

function resource(input: ResourceInput): DataCatalogResource {
  assertStableId(input.id, "Resource-ID");
  if (!input.label.trim() || !input.description.trim()) {
    throw new InvalidDataCatalogError(`Resource ${input.id} vereist een label en beschrijving.`);
  }
  const attributeIds = input.attributes.map((item) => item.id);
  if (new Set(attributeIds).size !== attributeIds.length) {
    throw new InvalidDataCatalogError(`Resource ${input.id} bevat dubbele attribuut-ID's.`);
  }
  if (!attributeIds.includes(input.identityAttributeId)) {
    throw new InvalidDataCatalogError(`Identiteitsattribuut van ${input.id} bestaat niet.`);
  }
  return Object.freeze({ ...input, attributes: Object.freeze([...input.attributes]) });
}

const code = (length: number, pattern: RegExp) => z.string().trim().min(1).max(length).regex(pattern);
const text = (length: number) => z.string().trim().min(1).max(length).regex(/^[^\r\n]+$/);
const nullableText = (length: number) => z.string().trim().max(length).regex(/^[^\r\n]*$/).nullable();
const positiveInteger = z.number().int().positive();
const isoDate = z.string().date();

function field<TSchema extends z.ZodType>(input: {
  id: string;
  label: string;
  description: string;
  valueType: DataCatalogValueType;
  schema: TSchema;
  scope: DataCatalogAuthorizationScope;
  operations?: readonly DataCatalogOperation[];
  relationship?: DataCatalogRelationship;
  readable?: boolean;
}): DataCatalogAttribute {
  return attribute({
    id: input.id,
    label: input.label,
    description: input.description,
    valueType: input.valueType,
    readable: input.readable ?? true,
    requestableOperations: input.operations ?? [],
    authorizationScope: input.scope,
    relationship: input.relationship,
    schema: input.schema,
  });
}

const clientCode = code(3, /^[A-Z0-9]{1,3}$/);
const portfolioCode = code(15, /^[A-Z0-9]{2,15}$/);
const parentAccountCode = code(16, /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/);
const assetClassCode = code(2, /^[A-Z]{2}$/);
const subAssetClassCode = code(3, /^[A-Z]{3}$/);
const managerCode = code(3, /^[A-Z0-9]{3}$/);

const resources = [
  resource({
    id: "client",
    label: "Client",
    description: "Een client binnen de geautoriseerde BCM-datascope.",
    authorizationScope: "client",
    identityAttributeId: "code",
    attributes: [
      field({ id: "code", label: "Clientcode", description: "Stabiele bedrijfscode van de client.", valueType: "string", schema: clientCode, scope: "client", operations: ["CREATE"] }),
      field({ id: "name", label: "Clientnaam", description: "Weergavenaam van de client.", valueType: "string", schema: text(100), scope: "client", operations: ["CREATE"] }),
    ],
  }),
  resource({
    id: "parent_account",
    label: "Parent account",
    description: "Hoofdrekening die portfolio's groepeert.",
    authorizationScope: "client",
    identityAttributeId: "code",
    attributes: [
      field({ id: "code", label: "Parent-accountcode", description: "Stabiele functionele identiteit van het parent account.", valueType: "string", schema: parentAccountCode, scope: "client", operations: ["CREATE", "RETIRE"] }),
      field({ id: "msa_code", label: "MSA-code", description: "Optionele parent-accountcode in MSA.", valueType: "string", schema: parentAccountCode.nullable(), scope: "client", operations: ["CREATE"] }),
      field({ id: "active", label: "Actief", description: "Geeft aan of het parent account actief is.", valueType: "boolean", schema: z.boolean(), scope: "client" }),
    ],
  }),
  resource({
    id: "portfolio",
    label: "Portfolio",
    description: "Portfolio binnen een client- en parent-accountcontext.",
    authorizationScope: "client",
    identityAttributeId: "code",
    attributes: [
      field({ id: "code", label: "Portfoliocode", description: "Stabiele functionele identiteit van het portfolio.", valueType: "string", schema: portfolioCode, scope: "client", operations: ["CREATE", "RETIRE"] }),
      field({
        id: "parent_account_code", label: "Parent account", description: "Optionele bovenliggende hoofdrekening.", valueType: "reference", schema: parentAccountCode.nullable(), scope: "client", operations: ["CREATE"],
        relationship: { resourceId: "parent_account", attributeId: "code", cardinality: "many_to_one" },
      }),
      field({ id: "active", label: "Actief", description: "Geeft aan of het portfolio actief is.", valueType: "boolean", schema: z.boolean(), scope: "client" }),
    ],
  }),
  resource({
    id: "portfolio_configuration",
    label: "Portfolioconfiguratie",
    description: "Effectieve configuratieregel voor een beleggingsrekening.",
    authorizationScope: "client",
    identityAttributeId: "primary_account_id",
    attributes: [
      field({ id: "primary_account_id", label: "Primary account-ID", description: "Afgeleide stabiele identiteit van de configuratieregel.", valueType: "string", schema: code(13, /^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$/), scope: "client", operations: ["RETIRE"] }),
      field({ id: "client_code", label: "Client", description: "Client waartoe de configuratie behoort.", valueType: "reference", schema: clientCode, scope: "client", operations: ["CREATE"], relationship: { resourceId: "client", attributeId: "code", cardinality: "many_to_one" } }),
      field({ id: "portfolio_code", label: "Portfolio", description: "Portfolio waartoe de configuratie behoort.", valueType: "reference", schema: portfolioCode, scope: "client", operations: ["CREATE", "UPDATE"], relationship: { resourceId: "portfolio", attributeId: "code", cardinality: "many_to_one" } }),
      field({ id: "asset_class_code", label: "Asset class", description: "Asset-classdimensie van de rekening.", valueType: "reference", schema: assetClassCode, scope: "client", operations: ["CREATE", "UPDATE"], relationship: { resourceId: "asset_class", attributeId: "code", cardinality: "many_to_one" } }),
      field({ id: "sub_asset_class_code", label: "Sub-asset class", description: "Sub-asset-classdimensie van de rekening.", valueType: "reference", schema: subAssetClassCode, scope: "client", operations: ["CREATE", "UPDATE"], relationship: { resourceId: "sub_asset_class", attributeId: "code", cardinality: "many_to_one" } }),
      field({ id: "manager_code", label: "Manager", description: "Beheerder van de rekening.", valueType: "reference", schema: managerCode, scope: "client", operations: ["CREATE", "UPDATE"], relationship: { resourceId: "manager", attributeId: "code", cardinality: "many_to_one" } }),
      field({ id: "benchmark_code", label: "Benchmark", description: "Benchmark voor prestatievergelijking.", valueType: "reference", schema: text(60), scope: "client", operations: ["CREATE", "UPDATE"], relationship: { resourceId: "benchmark", attributeId: "code", cardinality: "many_to_one" } }),
      field({ id: "npc_classification_id", label: "NPC-classificatie", description: "Interne NPC-classificatie.", valueType: "reference", schema: positiveInteger, scope: "client", operations: ["CREATE", "UPDATE"], relationship: { resourceId: "npc_classification", attributeId: "id", cardinality: "many_to_one" } }),
      field({ id: "long_name", label: "Lange naam", description: "Volledige naam van de configuratieregel.", valueType: "string", schema: text(255), scope: "client", operations: ["CREATE", "UPDATE"] }),
      field({ id: "short_name", label: "Korte naam", description: "Beknopte naam van de configuratieregel.", valueType: "string", schema: text(100), scope: "client", operations: ["CREATE", "UPDATE"] }),
      field({ id: "active", label: "Actief", description: "Geeft aan of deze effectieve versie actief is.", valueType: "boolean", schema: z.boolean(), scope: "client" }),
      field({ id: "effective_from", label: "Geldig vanaf", description: "Startdatum van de geldigheid.", valueType: "date", schema: isoDate, scope: "client", operations: ["CREATE", "UPDATE"] }),
      field({ id: "effective_until", label: "Geldig tot", description: "Optionele einddatum van de geldigheid.", valueType: "date", schema: isoDate.nullable(), scope: "client", operations: ["UPDATE", "RETIRE"] }),
    ],
  }),
  resource({
    id: "asset_class",
    label: "Asset class",
    description: "Aanvraagbare hoofdclassificatie voor beleggingen.",
    authorizationScope: "business_unit",
    identityAttributeId: "code",
    attributes: [
      field({ id: "code", label: "Asset-classcode", description: "Unieke code van twee hoofdletters.", valueType: "string", schema: assetClassCode, scope: "business_unit", operations: ["CREATE"] }),
      field({ id: "name", label: "Asset-classnaam", description: "Unieke naam van de asset class.", valueType: "string", schema: text(30), scope: "business_unit", operations: ["CREATE"] }),
    ],
  }),
  resource({
    id: "sub_asset_class",
    label: "Sub-asset class",
    description: "Aanvraagbare subcategorie binnen een asset class.",
    authorizationScope: "business_unit",
    identityAttributeId: "code",
    attributes: [
      field({ id: "code", label: "Sub-asset-classcode", description: "Code van drie hoofdletters binnen de bovenliggende asset class.", valueType: "string", schema: subAssetClassCode, scope: "business_unit", operations: ["CREATE"] }),
      field({ id: "name", label: "Sub-asset-classnaam", description: "Naam binnen de bovenliggende asset class.", valueType: "string", schema: text(100), scope: "business_unit", operations: ["CREATE"] }),
      field({ id: "asset_class_code", label: "Asset class", description: "Bovenliggende asset class.", valueType: "reference", schema: assetClassCode, scope: "business_unit", operations: ["CREATE"], relationship: { resourceId: "asset_class", attributeId: "code", cardinality: "many_to_one" } }),
      field({ id: "sort_order", label: "Sorteervolgorde", description: "Optionele volgorde voor weergave.", valueType: "integer", schema: z.number().int().nonnegative().nullable(), scope: "business_unit", operations: ["CREATE"] }),
    ],
  }),
  resource({
    id: "manager",
    label: "Manager",
    description: "Door beheerders onderhouden externe tegenpartij.",
    authorizationScope: "business_unit",
    identityAttributeId: "code",
    attributes: [
      field({ id: "code", label: "Managercode", description: "Unieke operationele managercode.", valueType: "string", schema: managerCode, scope: "business_unit" }),
      field({ id: "name", label: "Managernaam", description: "Naam van de manager.", valueType: "string", schema: text(50), scope: "business_unit" }),
    ],
  }),
  resource({
    id: "benchmark",
    label: "Benchmark",
    description: "Referentie-index die via een change kan worden aangevraagd.",
    authorizationScope: "business_unit",
    identityAttributeId: "code",
    attributes: [
      field({ id: "code", label: "Benchmarkcode", description: "Unieke code van de benchmark.", valueType: "string", schema: text(60), scope: "business_unit", operations: ["CREATE"] }),
      field({ id: "name", label: "Benchmarknaam", description: "Optionele naam van de benchmark.", valueType: "string", schema: nullableText(100), scope: "business_unit", operations: ["CREATE"] }),
      field({ id: "rimes_code", label: "RIMES-code", description: "Optionele externe RIMES-identificatie.", valueType: "string", schema: nullableText(40), scope: "business_unit" }),
    ],
  }),
  resource({
    id: "npc_classification",
    label: "NPC-classificatie",
    description: "Door beheerders onderhouden interne classificatie.",
    authorizationScope: "business_unit",
    identityAttributeId: "id",
    attributes: [
      field({ id: "id", label: "NPC-ID", description: "Stabiele numerieke classificatie-ID.", valueType: "integer", schema: positiveInteger, scope: "business_unit" }),
      field({ id: "name", label: "Classificatienaam", description: "Weergavenaam van de NPC-classificatie.", valueType: "string", schema: text(80), scope: "business_unit" }),
    ],
  }),
] as const satisfies readonly DataCatalogResource[];

export class DataCatalog {
  readonly #resources: ReadonlyMap<string, DataCatalogResource>;

  constructor(resourceDefinitions: readonly DataCatalogResource[]) {
    const byId = new Map<string, DataCatalogResource>();
    for (const definition of resourceDefinitions) {
      if (byId.has(definition.id)) {
        throw new InvalidDataCatalogError(`Dubbele catalogusresource: ${definition.id}.`);
      }
      byId.set(definition.id, definition);
    }
    for (const definition of resourceDefinitions) {
      for (const item of definition.attributes) {
        if (!item.relationship) continue;
        const target = byId.get(item.relationship.resourceId);
        if (!target?.attributes.some((attributeDefinition) => (
          attributeDefinition.id === item.relationship?.attributeId
        ))) {
          throw new InvalidDataCatalogError(
            `Relatie ${definition.id}.${item.id} verwijst naar een onbekend catalogusattribuut.`,
          );
        }
      }
    }
    this.#resources = byId;
  }

  list(): readonly DataCatalogResource[] {
    return Object.freeze([...this.#resources.values()]);
  }

  listForIdentity(identity: IdentityContext, scope: WorkflowDataScope): readonly DataCatalogResource[] {
    return authorizeWorkflowAction(identity, "workflow:design", scope).authorized ? this.list() : [];
  }

  resolve(reference: DataCatalogReference): DataCatalogReferenceResult {
    const catalogResource = this.#resources.get(reference.resourceId);
    if (!catalogResource) {
      return { valid: false, code: "unknown_catalog_resource", message: `Onbekende catalogusresource: ${reference.resourceId}.` };
    }
    if (!reference.attributeId) {
      if (reference.operation && !catalogResource.attributes.some((item) => (
        item.requestableOperations.includes(reference.operation!)
      ))) {
        return { valid: false, code: "operation_not_requestable", message: `${reference.operation} kan niet worden aangevraagd voor ${reference.resourceId}.` };
      }
      return { valid: true, resource: catalogResource };
    }
    const catalogAttribute = catalogResource.attributes.find((item) => item.id === reference.attributeId);
    if (!catalogAttribute) {
      return { valid: false, code: "unknown_catalog_attribute", message: `Onbekend catalogusattribuut: ${reference.resourceId}.${reference.attributeId}.` };
    }
    if (!catalogAttribute.readable) {
      return { valid: false, code: "attribute_not_readable", message: `${reference.resourceId}.${reference.attributeId} is niet leesbaar.` };
    }
    if (reference.operation && !catalogAttribute.requestableOperations.includes(reference.operation)) {
      return { valid: false, code: "operation_not_requestable", message: `${reference.operation} kan niet worden aangevraagd voor ${reference.resourceId}.${reference.attributeId}.` };
    }
    return { valid: true, resource: catalogResource, attribute: catalogAttribute };
  }
}

/** Removes validators, request operations and internal schemas before client hydration. */
export function toPublicDataCatalog(
  catalogResources: readonly DataCatalogResource[],
): readonly PublicDataCatalogResource[] {
  return deepFreeze(catalogResources.map((catalogResource) => ({
    id: catalogResource.id,
    label: catalogResource.label,
    description: catalogResource.description,
    authorizationScope: catalogResource.authorizationScope,
    identityAttributeId: catalogResource.identityAttributeId,
    attributes: catalogResource.attributes.filter((item) => item.readable).map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      valueType: item.valueType,
      authorizationScope: item.authorizationScope,
      ...(item.relationship ? { relationship: { ...item.relationship } } : {}),
    })),
  })));
}

/** Exposes only requestable resources and the operation allow-list needed by the change editor. */
export function toPublicChangeRequestCatalog(
  catalogResources: readonly DataCatalogResource[],
): readonly PublicChangeRequestCatalogResource[] {
  return deepFreeze(catalogResources.flatMap((catalogResource) => {
    const attributes = catalogResource.attributes.flatMap((item) => (
      item.requestableOperations.length === 0 ? [] : [{
        id: item.id,
        label: item.label,
        description: item.description,
        valueType: item.valueType,
        authorizationScope: item.authorizationScope,
        requestableOperations: [...item.requestableOperations],
        ...(item.relationship ? { relationship: { ...item.relationship } } : {}),
      }]
    ));
    return attributes.length === 0 ? [] : [{
      id: catalogResource.id,
      label: catalogResource.label,
      description: catalogResource.description,
      authorizationScope: catalogResource.authorizationScope,
      identityAttributeId: catalogResource.identityAttributeId,
      attributes,
    }];
  }));
}

export const clientConfigDataCatalog = new DataCatalog(resources);
