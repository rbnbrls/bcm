import {
  validateWorkflowFormSubmission,
  workflowFormBlockConfigurationSchema,
  type WorkflowFormBlockConfiguration,
  type WorkflowFormField,
} from "@/lib/workflow-studio/form-schema";
import type { WorkflowVariableAssignment } from "@/lib/workflow-studio/runtime-variables";

export type WorkflowRuntimeFormDefinition = Readonly<{
  nodeId: string;
  nodeKey: string;
  configuration: WorkflowFormBlockConfiguration;
}>;

export type WorkflowRuntimeFormParseResult =
  | Readonly<{
      success: true;
      values: Readonly<Record<string, unknown>>;
      variables: readonly WorkflowVariableAssignment[];
    }>
  | Readonly<{
      success: false;
      message: string;
      fieldErrors: Readonly<Record<string, readonly string[]>>;
    }>;

function fieldName(nodeKey: string, fieldId: string): string {
  return `${nodeKey}.${fieldId}`;
}

export function workflowRuntimeFormFieldName(nodeKey: string, fieldId: string): string {
  return fieldName(nodeKey, fieldId);
}

function rawFieldValue(formData: FormData, nodeKey: string, field: WorkflowFormField): unknown {
  const name = fieldName(nodeKey, field.id);
  if (field.type === "multiselect") return formData.getAll(name).map(String);
  if (field.type === "boolean") return formData.has(name);
  const entry = formData.get(name);
  if (entry === null) return undefined;
  if (typeof entry !== "string") return undefined;
  if ((field.type === "number" || field.type === "currency") && entry !== "") return Number(entry);
  if (["date", "select", "number", "currency"].includes(field.type) && entry === "") return undefined;
  return entry;
}

function variableType(field: WorkflowFormField): WorkflowVariableAssignment["dataType"] {
  if (field.type === "number" || field.type === "currency") return "number";
  if (field.type === "boolean") return "boolean";
  if (field.type === "date") return "date";
  if (field.type === "multiselect") return "array";
  return "string";
}

export function parseWorkflowRuntimeFormData(
  forms: readonly WorkflowRuntimeFormDefinition[],
  formData: FormData,
): WorkflowRuntimeFormParseResult {
  const values: Record<string, unknown> = {};
  const variables: WorkflowVariableAssignment[] = [];
  const fieldErrors: Record<string, string[]> = {};
  const declaredVariables = new Set<string>();

  for (const form of forms) {
    const parsedConfiguration = workflowFormBlockConfigurationSchema.safeParse(form.configuration);
    if (!parsedConfiguration.success) {
      return {
        success: false,
        message: "De gepubliceerde formulierdefinitie is ongeldig.",
        fieldErrors: { _form: parsedConfiguration.error.issues.map((issue) => issue.message) },
      };
    }
    const submitted = Object.fromEntries(parsedConfiguration.data.fields.map((field) => [
      field.id,
      rawFieldValue(formData, form.nodeKey, field),
    ]).filter(([, value]) => value !== undefined));
    const validated = validateWorkflowFormSubmission(parsedConfiguration.data, submitted);
    if (!validated.success) {
      for (const issue of validated.error.issues) {
        const id = typeof issue.path[0] === "string" ? issue.path[0] : "_form";
        const name = id === "_form" ? "_form" : fieldName(form.nodeKey, id);
        fieldErrors[name] = [...(fieldErrors[name] ?? []), issue.message];
      }
      continue;
    }
    for (const field of parsedConfiguration.data.fields) {
      const value = validated.data[field.id];
      if (value === undefined) continue;
      if (declaredVariables.has(field.id)) {
        fieldErrors[fieldName(form.nodeKey, field.id)] = [`Variabele ${field.id} wordt door meerdere startformulieren geschreven.`];
        continue;
      }
      declaredVariables.add(field.id);
      values[field.id] = structuredClone(value);
      variables.push({
        name: field.id,
        dataType: variableType(field),
        value: structuredClone(value),
        classification: "confidential",
      });
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      message: "Controleer de gemarkeerde formuliervelden.",
      fieldErrors: Object.freeze(fieldErrors),
    };
  }
  return {
    success: true,
    values: Object.freeze(values),
    variables: Object.freeze(variables),
  };
}
