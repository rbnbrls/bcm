import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";

export type JsonSchema = Readonly<Record<string, unknown>>;
export type ContractPropertyIssue = { readonly path: readonly (string | number)[]; readonly message: string };
export type WorkflowVariableOption = {
  readonly id: string;
  readonly valueType: string;
  readonly sourceNodeKey: string;
  readonly label: string;
};

function schemaRecord(value: unknown): JsonSchema {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonSchema : {};
}

function resolveSchema(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const reference = typeof schema.$ref === "string" ? schema.$ref : null;
  if (!reference?.startsWith("#/")) return schema;
  return reference.slice(2).split("/").reduce<JsonSchema>((current, part) => schemaRecord(current[part.replaceAll("~1", "/").replaceAll("~0", "~")]), root);
}

function validate(schemaInput: JsonSchema, value: unknown, root: JsonSchema, path: readonly (string | number)[]): ContractPropertyIssue[] {
  const schema = resolveSchema(schemaInput, root);
  const variants = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : null;
  if (variants) {
    if (variants.some((variant) => validate(schemaRecord(variant), value, root, path).length === 0)) return [];
    return [{ path, message: "Waarde voldoet niet aan een toegestaan contracttype." }];
  }
  if (schema.const !== undefined && value !== schema.const) return [{ path, message: `Waarde moet ${String(schema.const)} zijn.` }];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [{ path, message: "Kies een toegestane waarde." }];

  const type = schema.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [{ path, message: "Waarde moet een object zijn." }];
    const objectValue = value as Record<string, unknown>;
    const properties = schemaRecord(schema.properties);
    const issues: ContractPropertyIssue[] = [];
    for (const required of Array.isArray(schema.required) ? schema.required : []) {
      if (typeof required === "string" && objectValue[required] === undefined) issues.push({ path: [...path, required], message: "Dit veld is verplicht." });
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) if (!(key in properties)) issues.push({ path: [...path, key], message: "Onbekend configuratieveld." });
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (objectValue[key] !== undefined) issues.push(...validate(schemaRecord(propertySchema), objectValue[key], root, [...path, key]));
    }
    return issues;
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [{ path, message: "Waarde moet een lijst zijn." }];
    const issues: ContractPropertyIssue[] = [];
    if (typeof schema.minItems === "number" && value.length < schema.minItems) issues.push({ path, message: `Kies minimaal ${schema.minItems} item(s).` });
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) issues.push({ path, message: `Kies maximaal ${schema.maxItems} item(s).` });
    const itemSchema = schemaRecord(schema.items);
    value.forEach((item, index) => issues.push(...validate(itemSchema, item, root, [...path, index])));
    return issues;
  }
  if (type === "string") {
    if (typeof value !== "string") return [{ path, message: "Waarde moet tekst zijn." }];
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return [{ path, message: `Gebruik minimaal ${schema.minLength} teken(s).` }];
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return [{ path, message: `Gebruik maximaal ${schema.maxLength} teken(s).` }];
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) return [{ path, message: "Waarde heeft niet het vereiste formaat." }];
  }
  if (type === "number" || type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) return [{ path, message: type === "integer" ? "Waarde moet een geheel getal zijn." : "Waarde moet een getal zijn." }];
    if (typeof schema.minimum === "number" && value < schema.minimum) return [{ path, message: `Waarde moet minimaal ${schema.minimum} zijn.` }];
    if (typeof schema.maximum === "number" && value > schema.maximum) return [{ path, message: `Waarde mag maximaal ${schema.maximum} zijn.` }];
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) return [{ path, message: `Waarde moet groter zijn dan ${schema.exclusiveMinimum}.` }];
  }
  if (type === "boolean" && typeof value !== "boolean") return [{ path, message: "Waarde moet waar of onwaar zijn." }];
  if (type === "null" && value !== null) return [{ path, message: "Waarde moet leeg zijn." }];
  return [];
}

export function validateContractConfiguration(schema: JsonSchema, value: unknown): readonly ContractPropertyIssue[] {
  return Object.freeze(validate(schema, value, schema, []));
}

export function orderedContractProperties(entry: Pick<BlockCatalogEntry, "configurationSchema" | "configurationUiSchema">): readonly [string, JsonSchema][] {
  const properties = schemaRecord(entry.configurationSchema.properties);
  const order = entry.configurationUiSchema.fieldOrder ?? [];
  const keys = [...order.filter((field) => field in properties), ...Object.keys(properties).filter((field) => !order.includes(field))];
  return Object.freeze(keys.map((field): [string, JsonSchema] => [field, schemaRecord(properties[field])]));
}

export function collectWorkflowVariableOptions(nodes: readonly WorkflowEditorNode[], excludedNodeId?: string): readonly WorkflowVariableOption[] {
  const options: WorkflowVariableOption[] = [];
  for (const node of nodes) {
    if (node.id === excludedNodeId) continue;
    const configuration = node.configuration && typeof node.configuration === "object" && !Array.isArray(node.configuration) ? node.configuration as Record<string, unknown> : {};
    if (node.blockType === "form" && Array.isArray(configuration.fields)) {
      for (const field of configuration.fields) if (field && typeof field === "object") {
        const item = field as Record<string, unknown>;
        if (typeof item.id === "string") options.push({ id: item.id, valueType: typeof item.type === "string" ? item.type : "any", sourceNodeKey: node.nodeKey, label: `${item.id} · ${node.nodeKey}` });
      }
    }
    if (node.blockType === "role_task" && Array.isArray(configuration.outputVariables)) {
      for (const variable of configuration.outputVariables) if (typeof variable === "string") options.push({ id: variable, valueType: "any", sourceNodeKey: node.nodeKey, label: `${variable} · ${node.nodeKey}` });
    }
    if (node.blockType === "client_config_lookup" && typeof configuration.outputVariable === "string") {
      const valueType = configuration.selection === "many" ? "array<object>" : "object";
      options.push({ id: configuration.outputVariable, valueType, sourceNodeKey: node.nodeKey, label: `${configuration.outputVariable} · ${node.nodeKey}` });
    }
  }
  return Object.freeze(options.sort((left, right) => left.id.localeCompare(right.id) || left.sourceNodeKey.localeCompare(right.sourceNodeKey)));
}
