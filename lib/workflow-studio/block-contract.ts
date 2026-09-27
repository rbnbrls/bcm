import { z } from "zod";

export const BLOCK_CAPABILITIES = [
  "start",
  "end",
  "user_input",
  "human_task",
  "approval",
  "data_read",
  "change_intent",
  "routing",
  "notification",
  "integration",
] as const;

export type BlockCapability = (typeof BLOCK_CAPABILITIES)[number];

export const BLOCK_PORT_TYPES = [
  "flow",
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "object",
  "array",
  "reference",
  "any",
] as const;

export type BlockPortType = (typeof BLOCK_PORT_TYPES)[number];
export type BlockPortDirection = "incoming" | "outgoing";

export type BlockPortDefinition = {
  id: string;
  label: string;
  valueType: BlockPortType;
  required: boolean;
  maxConnections: number | null;
};

export type BlockConnectionRule = {
  direction: BlockPortDirection;
  portId: string;
  allowedBlockTypes: "*" | readonly string[];
  allowedPortTypes: readonly BlockPortType[];
};

export type BlockUiCategory =
  | "control"
  | "interaction"
  | "data"
  | "change"
  | "communication";

export type BlockUiMetadata = {
  label: string;
  description: string;
  category: BlockUiCategory;
  icon: string;
  order: number;
  experimental?: boolean;
};

export type BlockConfigurationUiSchema = {
  fieldOrder?: readonly string[];
  widgets?: Readonly<Record<string, string>>;
  helpText?: Readonly<Record<string, string>>;
  labels?: Readonly<Record<string, string>>;
  enumLabels?: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

export type BlockValidationIssueCode =
  | "unknown_block_type"
  | "unknown_block_version"
  | "invalid_block_configuration"
  | "unknown_source_port"
  | "unknown_target_port"
  | "incompatible_port_type"
  | "connection_not_allowed";

export type BlockValidationIssue = {
  code: BlockValidationIssueCode;
  path: readonly (string | number)[];
  message: string;
};

export type BlockValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; issues: readonly BlockValidationIssue[] };

export type BlockDefinition<TConfiguration = unknown> = {
  blockType: string;
  contractVersion: number;
  configurationSchema: Readonly<Record<string, unknown>>;
  configurationUiSchema: BlockConfigurationUiSchema;
  inputs: readonly BlockPortDefinition[];
  outputs: readonly BlockPortDefinition[];
  allowedConnections: readonly BlockConnectionRule[];
  capabilities: readonly BlockCapability[];
  ui: BlockUiMetadata;
  runtimeHandlerId: string;
  validateConfiguration(value: unknown): BlockValidationResult<TConfiguration>;
};

export type BlockDefinitionInput<TSchema extends z.ZodType> = {
  blockType: string;
  contractVersion: number;
  configuration: TSchema;
  configurationUiSchema?: BlockConfigurationUiSchema;
  inputs: readonly BlockPortDefinition[];
  outputs: readonly BlockPortDefinition[];
  allowedConnections: readonly BlockConnectionRule[];
  capabilities: readonly BlockCapability[];
  ui: BlockUiMetadata;
  runtimeHandlerId: string;
};

export type BlockReference = {
  blockType: string;
  contractVersion: number;
};

export const blockReferenceSchema = z.object({
  blockType: z.string().regex(/^[a-z][a-z0-9_]*$/, "Block type moet een stabiele snake_case-ID zijn."),
  contractVersion: z.number().int().positive(),
});

export type BlockNodeContractInput = BlockReference & {
  configuration: unknown;
};

export class InvalidBlockDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBlockDefinitionError";
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new InvalidBlockDefinitionError(`${field} mag niet leeg zijn.`);
}

function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new InvalidBlockDefinitionError(`${field} bevat dubbele waarden.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function freezePort(port: BlockPortDefinition): BlockPortDefinition {
  assertNonEmpty(port.id, "Poort-ID");
  assertNonEmpty(port.label, `Label van poort ${port.id}`);
  if (!BLOCK_PORT_TYPES.includes(port.valueType)) {
    throw new InvalidBlockDefinitionError(`Poort ${port.id} heeft een onbekend datatype.`);
  }
  if (port.maxConnections !== null && (!Number.isInteger(port.maxConnections) || port.maxConnections < 1)) {
    throw new InvalidBlockDefinitionError(`Poort ${port.id} heeft een ongeldig maximum aantal verbindingen.`);
  }
  return Object.freeze({ ...port });
}

function freezeRule(rule: BlockConnectionRule): BlockConnectionRule {
  if (rule.allowedBlockTypes !== "*") {
    if (rule.allowedBlockTypes.length === 0) {
      throw new InvalidBlockDefinitionError(`Verbindingsregel voor ${rule.portId} moet bloktypes toestaan.`);
    }
    assertUnique(rule.allowedBlockTypes, `Toegestane bloktypes voor ${rule.portId}`);
  }
  if (rule.allowedPortTypes.length === 0) {
    throw new InvalidBlockDefinitionError(`Verbindingsregel voor ${rule.portId} moet poorttypes toestaan.`);
  }
  assertUnique(rule.allowedPortTypes, `Toegestane poorttypes voor ${rule.portId}`);
  for (const portType of rule.allowedPortTypes) {
    if (!BLOCK_PORT_TYPES.includes(portType)) {
      throw new InvalidBlockDefinitionError(`Verbindingsregel voor ${rule.portId} bevat een onbekend poorttype.`);
    }
  }
  return Object.freeze({
    ...rule,
    allowedBlockTypes: rule.allowedBlockTypes === "*"
      ? "*"
      : Object.freeze([...rule.allowedBlockTypes]),
    allowedPortTypes: Object.freeze([...rule.allowedPortTypes]),
  });
}

function validateContractShape(input: BlockDefinitionInput<z.ZodType>): {
  inputs: readonly BlockPortDefinition[];
  outputs: readonly BlockPortDefinition[];
  rules: readonly BlockConnectionRule[];
} {
  if (!/^[a-z][a-z0-9_]*$/.test(input.blockType)) {
    throw new InvalidBlockDefinitionError("Block type moet een stabiele snake_case-ID zijn.");
  }
  if (!Number.isInteger(input.contractVersion) || input.contractVersion < 1) {
    throw new InvalidBlockDefinitionError("Contractversie moet een positief geheel getal zijn.");
  }
  if (!/^[a-z][a-z0-9_.-]*$/.test(input.runtimeHandlerId)) {
    throw new InvalidBlockDefinitionError("Runtime-handler-ID heeft een ongeldig formaat.");
  }
  assertNonEmpty(input.ui.label, "Bloklabel");
  assertNonEmpty(input.ui.description, "Blokbeschrijving");
  assertNonEmpty(input.ui.icon, "Blokicoon");
  if (!Number.isInteger(input.ui.order) || input.ui.order < 0) {
    throw new InvalidBlockDefinitionError("UI-volgorde moet een niet-negatief geheel getal zijn.");
  }
  assertUnique(input.capabilities, "Capabilities");
  for (const capability of input.capabilities) {
    if (!BLOCK_CAPABILITIES.includes(capability)) {
      throw new InvalidBlockDefinitionError(`Onbekende capability: ${capability}.`);
    }
  }

  const inputs = Object.freeze(input.inputs.map(freezePort));
  const outputs = Object.freeze(input.outputs.map(freezePort));
  const inputIds = inputs.map((port) => port.id);
  const outputIds = outputs.map((port) => port.id);
  assertUnique(inputIds, "Inputpoorten");
  assertUnique(outputIds, "Outputpoorten");
  const overlappingPort = inputIds.find((portId) => outputIds.includes(portId));
  if (overlappingPort) {
    throw new InvalidBlockDefinitionError(`Poort-ID ${overlappingPort} wordt als input en output gebruikt.`);
  }

  const rules = Object.freeze(input.allowedConnections.map(freezeRule));
  const ruleKeys = rules.map((rule) => `${rule.direction}:${rule.portId}`);
  assertUnique(ruleKeys, "Verbindingsregels");
  const expectedRules = [
    ...inputIds.map((portId) => `incoming:${portId}`),
    ...outputIds.map((portId) => `outgoing:${portId}`),
  ];
  if (
    rules.length !== expectedRules.length
    || expectedRules.some((ruleKey) => !ruleKeys.includes(ruleKey))
  ) {
    throw new InvalidBlockDefinitionError("Iedere poort moet precies één passende verbindingsregel hebben.");
  }
  return { inputs, outputs, rules };
}

function zodIssues(error: z.ZodError): readonly BlockValidationIssue[] {
  return Object.freeze(error.issues.map((issue) => Object.freeze({
    code: "invalid_block_configuration" as const,
    path: Object.freeze(issue.path.map((part) => typeof part === "symbol" ? String(part) : part)),
    message: issue.message,
  })));
}

function validateConfigurationUiSchema(
  configurationSchema: Readonly<Record<string, unknown>>,
  uiSchema: BlockConfigurationUiSchema | undefined,
): void {
  if (!uiSchema) return;
  const properties = configurationSchema.properties && typeof configurationSchema.properties === "object"
    ? configurationSchema.properties as Record<string, unknown>
    : {};
  const configuredFields = [
    ...(uiSchema.fieldOrder ?? []),
    ...Object.keys(uiSchema.widgets ?? {}),
    ...Object.keys(uiSchema.helpText ?? {}),
    ...Object.keys(uiSchema.labels ?? {}),
    ...Object.keys(uiSchema.enumLabels ?? {}),
  ];
  assertUnique(uiSchema.fieldOrder ?? [], "UI-veldvolgorde");
  const unknown = configuredFields.find((field) => !(field in properties));
  if (unknown) throw new InvalidBlockDefinitionError(`UI-schema verwijst naar onbekend configuratieveld ${unknown}.`);
}

export function defineBlockDefinition<TSchema extends z.ZodType>(
  input: BlockDefinitionInput<TSchema>,
): BlockDefinition<z.output<TSchema>> {
  const { inputs, outputs, rules } = validateContractShape(input);
  const configurationSchema = z.toJSONSchema(input.configuration, {
    target: "draft-07",
    io: "input",
    unrepresentable: "throw",
  }) as Record<string, unknown>;
  if (configurationSchema.type !== "object") {
    throw new InvalidBlockDefinitionError("Blokconfiguratie moet een JSON-object zijn.");
  }
  validateConfigurationUiSchema(configurationSchema, input.configurationUiSchema);

  const validateConfiguration = (value: unknown): BlockValidationResult<z.output<TSchema>> => {
    const parsed = input.configuration.safeParse(value);
    return parsed.success
      ? { valid: true, value: parsed.data }
      : { valid: false, issues: zodIssues(parsed.error) };
  };

  return Object.freeze({
    blockType: input.blockType,
    contractVersion: input.contractVersion,
    configurationSchema: deepFreeze(configurationSchema),
    configurationUiSchema: deepFreeze({ ...input.configurationUiSchema }),
    inputs,
    outputs,
    allowedConnections: rules,
    capabilities: Object.freeze([...input.capabilities]),
    ui: Object.freeze({ ...input.ui }),
    runtimeHandlerId: input.runtimeHandlerId,
    validateConfiguration,
  });
}

function issue(
  code: BlockValidationIssueCode,
  message: string,
  path: readonly (string | number)[] = [],
): BlockValidationResult<never> {
  return { valid: false, issues: [Object.freeze({ code, message, path: Object.freeze([...path]) })] };
}

export class BlockContractResolver {
  readonly #contracts: ReadonlyMap<string, ReadonlyMap<number, BlockDefinition>>;

  constructor(definitions: readonly BlockDefinition[]) {
    const contracts = new Map<string, Map<number, BlockDefinition>>();
    for (const definition of definitions) {
      const versions = contracts.get(definition.blockType) ?? new Map<number, BlockDefinition>();
      if (versions.has(definition.contractVersion)) {
        throw new InvalidBlockDefinitionError(
          `Dubbel block contract: ${definition.blockType}@${definition.contractVersion}.`,
        );
      }
      versions.set(definition.contractVersion, definition);
      contracts.set(definition.blockType, versions);
    }
    this.#contracts = new Map(
      [...contracts].map(([blockType, versions]) => [blockType, new Map(versions)]),
    );
  }

  resolve(reference: BlockReference): BlockValidationResult<BlockDefinition> {
    const versions = this.#contracts.get(reference.blockType);
    if (!versions) {
      return issue("unknown_block_type", `Onbekend block type: ${reference.blockType}.`);
    }
    const definition = versions.get(reference.contractVersion);
    if (!definition) {
      return issue(
        "unknown_block_version",
        `Onbekende contractversie ${reference.contractVersion} voor ${reference.blockType}.`,
      );
    }
    return { valid: true, value: definition };
  }

  validateNode(input: BlockNodeContractInput): BlockValidationResult<unknown> {
    const resolved = this.resolve(input);
    if (!resolved.valid) return resolved;
    return resolved.value.validateConfiguration(input.configuration);
  }

  listVersions(blockType: string): readonly number[] {
    return Object.freeze(
      [...(this.#contracts.get(blockType)?.keys() ?? [])].sort((left, right) => left - right),
    );
  }
}

function allowsBlock(rule: BlockConnectionRule, blockType: string): boolean {
  return rule.allowedBlockTypes === "*" || rule.allowedBlockTypes.includes(blockType);
}

function allowsPortType(rule: BlockConnectionRule, portType: BlockPortType): boolean {
  return rule.allowedPortTypes.includes("any") || rule.allowedPortTypes.includes(portType);
}

export function validateBlockConnection(
  source: BlockDefinition,
  sourcePortId: string,
  target: BlockDefinition,
  targetPortId: string,
): BlockValidationResult<true> {
  const sourcePort = source.outputs.find((port) => port.id === sourcePortId);
  if (!sourcePort) return issue("unknown_source_port", `Onbekende outputpoort: ${sourcePortId}.`);
  const targetPort = target.inputs.find((port) => port.id === targetPortId);
  if (!targetPort) return issue("unknown_target_port", `Onbekende inputpoort: ${targetPortId}.`);

  if (
    sourcePort.valueType !== "any"
    && targetPort.valueType !== "any"
    && sourcePort.valueType !== targetPort.valueType
  ) {
    return issue(
      "incompatible_port_type",
      `Poorttypes ${sourcePort.valueType} en ${targetPort.valueType} zijn niet compatibel.`,
    );
  }

  const sourceRule = source.allowedConnections.find(
    (rule) => rule.direction === "outgoing" && rule.portId === sourcePortId,
  )!;
  const targetRule = target.allowedConnections.find(
    (rule) => rule.direction === "incoming" && rule.portId === targetPortId,
  )!;
  if (
    !allowsBlock(sourceRule, target.blockType)
    || !allowsPortType(sourceRule, targetPort.valueType)
    || !allowsBlock(targetRule, source.blockType)
    || !allowsPortType(targetRule, sourcePort.valueType)
  ) {
    return issue("connection_not_allowed", "Deze blokken en poorten mogen niet worden verbonden.");
  }
  return { valid: true, value: true };
}
