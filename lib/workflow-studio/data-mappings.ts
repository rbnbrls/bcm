import { workflowIntegrationConfigurationSchema } from "@/lib/workflow-studio/integration-schema";
import { workflowSubworkflowConfigurationSchema } from "@/lib/workflow-studio/subworkflow-schema";

/**
 * Shared data-mapping analysis for workflow drafts.
 *
 * Extracted from workflow-validator.ts so both the server-side validator
 * (publish gate) and the client-side editor validation (Workflow Studio UI
 * panel) compute the exact same mappings and therefore the exact same
 * `duplicate_data_mapping` warnings. Without this parity the editor cannot
 * display (and the user cannot acknowledge) warnings the server enforces,
 * which made every workflow with an approval block that reviews the same
 * variables a change_request consumes impossible to publish.
 */

export const VARIABLE_REGEX = /^[a-z][a-z0-9_]*$/;

export type DataMapping = {
  readonly nodeKey: string;
  readonly field: string;
  readonly variable: string;
  readonly port: "out" | "in";
};

export function collectDataMappings(
  nodeKey: string,
  blockType: string,
  configuration: unknown,
): readonly DataMapping[] {
  const config = (configuration ?? {}) as Record<string, unknown>;
  const mappings: DataMapping[] = [];
  switch (blockType) {
    case "form": {
      const fields = Array.isArray(config.fields) ? config.fields as Array<Record<string, unknown>> : [];
      for (const field of fields) {
        if (typeof field.id === "string" && VARIABLE_REGEX.test(field.id)) {
          mappings.push({ nodeKey, field: `fields.${field.id}`, variable: field.id, port: "out" });
        }
      }
      break;
    }
    case "client_config_lookup": {
      if (typeof config.outputVariable === "string" && VARIABLE_REGEX.test(config.outputVariable)) {
        mappings.push({ nodeKey, field: "outputVariable", variable: config.outputVariable, port: "out" });
      }
      const filters = Array.isArray(config.filters) ? config.filters as Array<Record<string, unknown>> : [];
      filters.forEach((filter, index) => {
        if (filter.source === "variable" && typeof filter.variableId === "string" && VARIABLE_REGEX.test(filter.variableId)) {
          mappings.push({ nodeKey, field: `filters.${index}.variableId`, variable: filter.variableId, port: "in" });
        }
      });
      const parentBinding = config.parentBinding && typeof config.parentBinding === "object"
        ? config.parentBinding as Record<string, unknown>
        : null;
      if (parentBinding && typeof parentBinding.sourceVariable === "string" && VARIABLE_REGEX.test(parentBinding.sourceVariable)) {
        mappings.push({ nodeKey, field: "parentBinding.sourceVariable", variable: parentBinding.sourceVariable, port: "in" });
      }
      break;
    }
    case "change_request": {
      if (typeof config.effectiveDateVariable === "string" && VARIABLE_REGEX.test(config.effectiveDateVariable)) {
        mappings.push({ nodeKey, field: "effectiveDateVariable", variable: config.effectiveDateVariable, port: "in" });
      }
      if (typeof config.rationaleVariable === "string" && VARIABLE_REGEX.test(config.rationaleVariable)) {
        mappings.push({ nodeKey, field: "rationaleVariable", variable: config.rationaleVariable, port: "in" });
      }
      const attributeMappings = Array.isArray(config.attributeMappings)
        ? config.attributeMappings as Array<Record<string, unknown>>
        : [];
      attributeMappings.forEach((attributeMapping, index) => {
        const ist = attributeMapping.ist && typeof attributeMapping.ist === "object" ? attributeMapping.ist as Record<string, unknown> : null;
        const soll = attributeMapping.soll && typeof attributeMapping.soll === "object" ? attributeMapping.soll as Record<string, unknown> : null;
        if (ist && typeof ist.snapshotVariableId === "string" && VARIABLE_REGEX.test(ist.snapshotVariableId)) {
          mappings.push({ nodeKey, field: `attributeMappings.${index}.ist.snapshotVariableId`, variable: ist.snapshotVariableId, port: "in" });
        }
        if (soll && typeof soll.variableId === "string" && VARIABLE_REGEX.test(soll.variableId)) {
          mappings.push({ nodeKey, field: `attributeMappings.${index}.soll.variableId`, variable: soll.variableId, port: "in" });
        }
      });
      break;
    }
    case "decision": {
      const rootRule = config.rule && typeof config.rule === "object" ? config.rule as Record<string, unknown> : null;
      function collectRuleVariables(rule: Record<string, unknown>, path: string): void {
        if (rule.kind === "condition" && typeof rule.variableId === "string" && VARIABLE_REGEX.test(rule.variableId)) {
          mappings.push({ nodeKey, field: `${path}.variableId`, variable: rule.variableId, port: "in" });
        }
        if (rule.kind === "group" && Array.isArray(rule.rules)) {
          rule.rules.forEach((nested, index) => {
            if (nested && typeof nested === "object") collectRuleVariables(nested as Record<string, unknown>, `${path}.rules.${index}`);
          });
        }
      }
      if (rootRule) collectRuleVariables(rootRule, "rule");
      break;
    }
    case "notification": {
      const templateVariables = Array.isArray(config.templateVariables) ? config.templateVariables : [];
      templateVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey, field: `templateVariables.${index}`, variable, port: "in" });
      });
      break;
    }
    case "integration": {
      const parsed = workflowIntegrationConfigurationSchema.safeParse(configuration);
      if (!parsed.success) break;
      parsed.data.inputVariables.forEach((variable, index) => {
        mappings.push({ nodeKey, field: `inputVariables.${index}`, variable, port: "in" });
      });
      if (parsed.data.outputVariable) {
        mappings.push({ nodeKey, field: "outputVariable", variable: parsed.data.outputVariable, port: "out" });
      }
      break;
    }
    case "role_task": {
      const inputVariables = Array.isArray(config.inputVariables) ? config.inputVariables : [];
      const outputVariables = Array.isArray(config.outputVariables) ? config.outputVariables : [];
      inputVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey, field: `inputVariables.${index}`, variable, port: "in" });
      });
      outputVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey, field: `outputVariables.${index}`, variable, port: "out" });
      });
      break;
    }
    case "approval": {
      const inputVariables = Array.isArray(config.inputVariables) ? config.inputVariables : [];
      inputVariables.forEach((variable, index) => {
        if (typeof variable === "string" && VARIABLE_REGEX.test(variable)) mappings.push({ nodeKey, field: `inputVariables.${index}`, variable, port: "in" });
      });
      break;
    }
    case "subworkflow": {
      const parsed = workflowSubworkflowConfigurationSchema.safeParse(configuration);
      if (!parsed.success) break;
      parsed.data.inputMappings.forEach((mapping, index) => {
        mappings.push({ nodeKey, field: `inputMappings.${index}.parentVariable`, variable: mapping.parentVariable, port: "in" });
      });
      parsed.data.outputMappings.forEach((mapping, index) => {
        mappings.push({ nodeKey, field: `outputMappings.${index}.parentVariable`, variable: mapping.parentVariable, port: "out" });
      });
      break;
    }
    default:
      break;
  }
  return Object.freeze([...mappings]);
}
