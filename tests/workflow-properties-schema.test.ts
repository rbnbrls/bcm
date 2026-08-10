import { describe, expect, it } from "vitest";
import {
  collectWorkflowVariableOptions,
  orderedContractProperties,
  validateContractConfiguration,
} from "@/lib/workflow-studio/properties-schema";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";

const entry = {
  configurationSchema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 3 },
      enabled: { type: "boolean" },
      sourceVariable: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
    },
    required: ["name", "sourceVariable"],
    additionalProperties: false,
  },
  configurationUiSchema: { fieldOrder: ["sourceVariable", "name"], widgets: { sourceVariable: "variable" } },
} as Pick<BlockCatalogEntry, "configurationSchema" | "configurationUiSchema">;

describe("contract-driven workflow properties", () => {
  it("orders declared fields first and appends new contract fields automatically", () => {
    expect(orderedContractProperties(entry).map(([field]) => field)).toEqual(["sourceVariable", "name", "enabled"]);
  });

  it("centralizes recursive JSON Schema errors with stable field paths", () => {
    expect(validateContractConfiguration(entry.configurationSchema, { sourceVariable: "Bad value", injected: true })).toEqual([
      { path: ["name"], message: "Dit veld is verplicht." },
      { path: ["injected"], message: "Onbekend configuratieveld." },
      { path: ["sourceVariable"], message: "Waarde heeft niet het vereiste formaat." },
    ]);
    expect(validateContractConfiguration(entry.configurationSchema, { name: "Geldig", sourceVariable: "formulier_waarde", enabled: true })).toEqual([]);
  });

  it("collects typed form, task and lookup outputs for the shared data picker", () => {
    const nodes: WorkflowEditorNode[] = [
      { id: "form", nodeKey: "form_1", blockType: "form", contractVersion: 1, label: "Form", description: "", configuration: { fields: [{ id: "bedrag", type: "currency" }] }, position: { x: 0, y: 0 } },
      { id: "task", nodeKey: "task_1", blockType: "role_task", contractVersion: 1, label: "Task", description: "", configuration: { outputVariables: ["controle_resultaat"] }, position: { x: 0, y: 0 } },
      { id: "lookup", nodeKey: "lookup_1", blockType: "client_config_lookup", contractVersion: 1, label: "Lookup", description: "", configuration: { outputVariable: "portfolios", selection: "many" }, position: { x: 0, y: 0 } },
    ];
    expect(collectWorkflowVariableOptions(nodes)).toEqual([
      { id: "bedrag", valueType: "currency", sourceNodeKey: "form_1", label: "bedrag · form_1" },
      { id: "controle_resultaat", valueType: "any", sourceNodeKey: "task_1", label: "controle_resultaat · task_1" },
      { id: "portfolios", valueType: "array<object>", sourceNodeKey: "lookup_1", label: "portfolios · lookup_1" },
    ]);
    expect(collectWorkflowVariableOptions(nodes, "task").map((option) => option.id)).toEqual(["bedrag", "portfolios"]);
  });
});
