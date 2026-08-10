import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BlockContractResolver,
  InvalidBlockDefinitionError,
  defineBlockDefinition,
  validateBlockConnection,
  type BlockConnectionRule,
  type BlockDefinition,
  type BlockPortDefinition,
} from "@/lib/workflow-studio/block-contract";

const flowInput: BlockPortDefinition = {
  id: "in",
  label: "In",
  valueType: "flow",
  required: true,
  maxConnections: 1,
};

const flowOutput: BlockPortDefinition = {
  id: "out",
  label: "Uit",
  valueType: "flow",
  required: true,
  maxConnections: 1,
};

const allowFlow: readonly BlockConnectionRule[] = [
  { direction: "incoming", portId: "in", allowedBlockTypes: "*", allowedPortTypes: ["flow"] },
  { direction: "outgoing", portId: "out", allowedBlockTypes: "*", allowedPortTypes: ["flow"] },
];

function formContract(
  contractVersion: number,
  configuration: z.ZodType = z.object({ label: z.string().min(1).default("Formulier") }).strict(),
): BlockDefinition {
  return defineBlockDefinition({
    blockType: "form",
    contractVersion,
    configuration,
    configurationUiSchema: {
      fieldOrder: ["label"],
      widgets: { label: "text" },
    },
    inputs: [flowInput],
    outputs: [flowOutput],
    allowedConnections: allowFlow,
    capabilities: ["user_input"],
    ui: {
      label: "Formulier",
      description: "Vraagt gegevens uit.",
      category: "interaction",
      icon: "form",
      order: 10,
    },
    runtimeHandlerId: `workflow.form.v${contractVersion}`,
  });
}

describe("BlockDefinition contract", () => {
  it("exposes versioned schema, ports, capabilities, UI metadata and runtime handler", () => {
    const definition = formContract(1);

    expect(definition.blockType).toBe("form");
    expect(definition.contractVersion).toBe(1);
    expect(definition.configurationSchema).toMatchObject({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
    });
    expect(definition.configurationUiSchema.fieldOrder).toEqual(["label"]);
    expect(definition.inputs).toEqual([flowInput]);
    expect(definition.outputs).toEqual([flowOutput]);
    expect(definition.allowedConnections).toHaveLength(2);
    expect(definition.capabilities).toEqual(["user_input"]);
    expect(definition.ui.category).toBe("interaction");
    expect(definition.runtimeHandlerId).toBe("workflow.form.v1");
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.inputs)).toBe(true);
    expect(Object.isFrozen(definition.configurationSchema.properties)).toBe(true);
    expect(Object.isFrozen(definition.configurationUiSchema.widgets)).toBe(true);
  });

  it("validates, normalizes and rejects block configuration server-side", () => {
    const definition = formContract(1);

    expect(definition.validateConfiguration({})).toEqual({
      valid: true,
      value: { label: "Formulier" },
    });
    const invalid = definition.validateConfiguration({ label: "", injected: true });
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) {
      expect(invalid.issues.every((issue) => issue.code === "invalid_block_configuration")).toBe(true);
      expect(invalid.issues.some((issue) => issue.path.join(".") === "label")).toBe(true);
    }
  });

  it("rejects malformed contracts before they can be resolved", () => {
    expect(() => defineBlockDefinition({
      blockType: "Invalid Type",
      contractVersion: 1,
      configuration: z.object({}).strict(),
      inputs: [],
      outputs: [],
      allowedConnections: [],
      capabilities: [],
      ui: { label: "Test", description: "Test", category: "control", icon: "test", order: 0 },
      runtimeHandlerId: "workflow.test.v1",
    })).toThrow(InvalidBlockDefinitionError);

    expect(() => defineBlockDefinition({
      blockType: "overlap",
      contractVersion: 1,
      configuration: z.object({}).strict(),
      inputs: [{ ...flowInput, id: "same" }],
      outputs: [{ ...flowOutput, id: "same" }],
      allowedConnections: [
        { direction: "incoming", portId: "same", allowedBlockTypes: "*", allowedPortTypes: ["flow"] },
        { direction: "outgoing", portId: "same", allowedBlockTypes: "*", allowedPortTypes: ["flow"] },
      ],
      capabilities: [],
      ui: { label: "Test", description: "Test", category: "control", icon: "test", order: 0 },
      runtimeHandlerId: "workflow.test.v1",
    })).toThrow(/input en output/i);

    expect(() => defineBlockDefinition({
      blockType: "missing_rule",
      contractVersion: 1,
      configuration: z.object({}).strict(),
      inputs: [flowInput],
      outputs: [],
      allowedConnections: [],
      capabilities: [],
      ui: { label: "Test", description: "Test", category: "control", icon: "test", order: 0 },
      runtimeHandlerId: "workflow.test.v1",
    })).toThrow(/verbindingsregel/i);
  });

  it("rejects UI metadata that references fields outside the configuration schema", () => {
    expect(() => defineBlockDefinition({
      blockType: "invalid_ui",
      contractVersion: 1,
      configuration: z.object({ label: z.string() }).strict(),
      configurationUiSchema: { fieldOrder: ["missing"], widgets: { missing: "text" } },
      inputs: [],
      outputs: [],
      allowedConnections: [],
      capabilities: [],
      ui: { label: "Invalid UI", description: "Test", category: "control", icon: "test", order: 0 },
      runtimeHandlerId: "workflow.invalid-ui.v1",
    })).toThrow(/onbekend configuratieveld missing/i);
  });
});

describe("BlockContractResolver", () => {
  const version1 = formContract(1);
  const version2 = formContract(
    2,
    z.object({ label: z.string().min(1), layout: z.enum(["single", "sections"]) }).strict(),
  );
  const resolver = new BlockContractResolver([version2, version1]);

  it("keeps multiple contract versions side by side and resolves exact versions", () => {
    expect(resolver.listVersions("form")).toEqual([1, 2]);
    const first = resolver.resolve({ blockType: "form", contractVersion: 1 });
    const second = resolver.resolve({ blockType: "form", contractVersion: 2 });
    expect(first.valid && first.value.runtimeHandlerId).toBe("workflow.form.v1");
    expect(second.valid && second.value.runtimeHandlerId).toBe("workflow.form.v2");
  });

  it("rejects unknown block types and versions with stable error codes", () => {
    const unknownType = resolver.validateNode({
      blockType: "script",
      contractVersion: 1,
      configuration: {},
    });
    const unknownVersion = resolver.validateNode({
      blockType: "form",
      contractVersion: 99,
      configuration: {},
    });

    expect(unknownType).toMatchObject({
      valid: false,
      issues: [{ code: "unknown_block_type", path: [] }],
    });
    expect(unknownVersion).toMatchObject({
      valid: false,
      issues: [{ code: "unknown_block_version", path: [] }],
    });
  });

  it("validates configuration against the selected version only", () => {
    expect(resolver.validateNode({ blockType: "form", contractVersion: 1, configuration: {} }).valid).toBe(true);
    const version2Result = resolver.validateNode({
      blockType: "form",
      contractVersion: 2,
      configuration: { label: "Aanvraag" },
    });
    expect(version2Result).toMatchObject({
      valid: false,
      issues: [{ code: "invalid_block_configuration", path: ["layout"] }],
    });
  });

  it("rejects duplicate type/version registrations", () => {
    expect(() => new BlockContractResolver([version1, version1])).toThrow(/dubbel block contract/i);
  });
});

describe("block connection contracts", () => {
  function targetContract(valueType: "flow" | "string", allowedSource: "*" | readonly string[]) {
    return defineBlockDefinition({
      blockType: "target",
      contractVersion: 1,
      configuration: z.object({}).strict(),
      inputs: [{ ...flowInput, valueType }],
      outputs: [],
      allowedConnections: [{
        direction: "incoming",
        portId: "in",
        allowedBlockTypes: allowedSource,
        allowedPortTypes: [valueType],
      }],
      capabilities: ["end"],
      ui: { label: "Doel", description: "Doelblok", category: "control", icon: "end", order: 1 },
      runtimeHandlerId: "workflow.target.v1",
    });
  }

  it("accepts compatible ports allowed by both contracts", () => {
    expect(validateBlockConnection(formContract(1), "out", targetContract("flow", ["form"]), "in"))
      .toEqual({ valid: true, value: true });
  });

  it("rejects unknown, incompatible and disallowed connections", () => {
    expect(validateBlockConnection(formContract(1), "missing", targetContract("flow", "*"), "in"))
      .toMatchObject({ valid: false, issues: [{ code: "unknown_source_port" }] });
    expect(validateBlockConnection(formContract(1), "out", targetContract("string", "*"), "in"))
      .toMatchObject({ valid: false, issues: [{ code: "incompatible_port_type" }] });
    expect(validateBlockConnection(formContract(1), "out", targetContract("flow", ["approval"]), "in"))
      .toMatchObject({ valid: false, issues: [{ code: "connection_not_allowed" }] });
  });
});
