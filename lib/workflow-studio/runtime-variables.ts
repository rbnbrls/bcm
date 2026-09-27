import { z } from "zod";

import {
  evaluateWorkflowDecision,
  workflowDecisionRuleSchema,
  type WorkflowDecisionRule,
} from "@/lib/workflow-studio/decision-schema";

export const WORKFLOW_VARIABLE_DATA_TYPES = [
  "string", "number", "boolean", "date", "datetime", "object", "array", "reference",
] as const;

export type WorkflowVariableDataType = (typeof WORKFLOW_VARIABLE_DATA_TYPES)[number];

export const WORKFLOW_VARIABLE_CLASSIFICATIONS = [
  "public", "internal", "confidential", "restricted",
] as const;

export type WorkflowVariableClassification = (typeof WORKFLOW_VARIABLE_CLASSIFICATIONS)[number];
export type WorkflowVariableScope = "instance" | "node_output";

export type WorkflowVariableAssignment = Readonly<{
  name: string;
  dataType: WorkflowVariableDataType;
  value: unknown;
  classification?: WorkflowVariableClassification;
}>;

export type WorkflowVariableRecord = Readonly<{
  id: string;
  instanceId: string;
  sourceNodeInstanceId?: string;
  scope: WorkflowVariableScope;
  name: string;
  dataType: WorkflowVariableDataType;
  value: unknown;
  classification: WorkflowVariableClassification;
  revision: number;
  idempotencyKey: string;
  correlationId: string;
}>;

export type WorkflowVariableWrite = Readonly<{
  id: string;
  instanceId: string;
  sourceNodeInstanceId?: string;
  assignment: WorkflowVariableAssignment;
  idempotencyKey: string;
  correlationId: string;
}>;

export type WorkflowVariableWriteResult = Readonly<{
  variable: WorkflowVariableRecord;
  created: boolean;
}>;

export type WorkflowVariableIssueCode =
  | "duplicate_output"
  | "invalid_name"
  | "invalid_value"
  | "missing_variable"
  | "type_mismatch"
  | "variable_conflict";

export type WorkflowVariableIssue = Readonly<{
  code: WorkflowVariableIssueCode;
  message: string;
  variableName?: string;
  expectedType?: WorkflowVariableDataType;
  actualType?: string;
  nodeInstanceId?: string;
  edgeId?: string;
}>;

export class WorkflowVariableRuntimeError extends Error {
  constructor(readonly issues: readonly WorkflowVariableIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "WorkflowVariableRuntimeError";
  }
}

const variableNameSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, "Gebruik een stabiele snake_case variabele-ID.");
const dateSchema = z.iso.date();
const datetimeSchema = z.iso.datetime({ offset: true });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

export function workflowVariableActualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function workflowVariableValueMatches(dataType: WorkflowVariableDataType, value: unknown): boolean {
  // Null is an explicit, persisted absence value. It is distinct from a
  // missing variable and is accepted for every declared type.
  if (value === null) return true;
  switch (dataType) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "date": return typeof value === "string" && dateSchema.safeParse(value).success;
    case "datetime": return typeof value === "string" && datetimeSchema.safeParse(value).success;
    case "object": return isPlainObject(value) && isJsonValue(value);
    case "array": return Array.isArray(value) && isJsonValue(value);
    case "reference": return isPlainObject(value)
      && typeof value.resourceId === "string" && value.resourceId.length > 0
      && typeof value.recordId === "string" && value.recordId.length > 0
      && Object.keys(value).every((key) => ["resourceId", "recordId", "label"].includes(key))
      && (value.label === undefined || typeof value.label === "string");
  }
}

export function validateWorkflowVariableAssignments(
  assignments: readonly WorkflowVariableAssignment[],
  nodeInstanceId?: string,
): readonly WorkflowVariableAssignment[] {
  const issues: WorkflowVariableIssue[] = [];
  const names = new Set<string>();
  for (const assignment of assignments) {
    if (!variableNameSchema.safeParse(assignment.name).success) {
      issues.push({ code: "invalid_name", variableName: assignment.name, nodeInstanceId, message: `Variabele ${assignment.name} heeft geen geldige snake_case naam.` });
    }
    if (names.has(assignment.name)) {
      issues.push({ code: "duplicate_output", variableName: assignment.name, nodeInstanceId, message: `Node-output bevat variabele ${assignment.name} meer dan één keer.` });
    }
    names.add(assignment.name);
    if (assignment.classification && !WORKFLOW_VARIABLE_CLASSIFICATIONS.includes(assignment.classification)) {
      issues.push({
        code: "invalid_value",
        variableName: assignment.name,
        nodeInstanceId,
        message: `Variabele ${assignment.name} heeft een onbekende classificatie.`,
      });
    }
    if (!workflowVariableValueMatches(assignment.dataType, assignment.value)) {
      issues.push({
        code: "invalid_value",
        variableName: assignment.name,
        expectedType: assignment.dataType,
        actualType: workflowVariableActualType(assignment.value),
        nodeInstanceId,
        message: `Variabele ${assignment.name} verwacht ${assignment.dataType}, maar ontving ${workflowVariableActualType(assignment.value)}.`,
      });
    }
  }
  if (issues.length > 0) throw new WorkflowVariableRuntimeError(Object.freeze(issues));
  return Object.freeze(assignments.map((assignment) => Object.freeze({
    ...assignment,
    classification: assignment.classification ?? "internal",
    value: structuredClone(assignment.value),
  })));
}

export type WorkflowVariableResolution =
  | Readonly<{ status: "missing"; name: string }>
  | Readonly<{ status: "null"; name: string; variable: WorkflowVariableRecord }>
  | Readonly<{ status: "value"; name: string; variable: WorkflowVariableRecord; value: unknown }>;

export function resolveWorkflowVariable(variables: readonly WorkflowVariableRecord[], name: string): WorkflowVariableResolution {
  const variable = variables.find((item) => item.name === name);
  if (!variable) return { status: "missing", name };
  if (variable.value === null) return { status: "null", name, variable };
  return { status: "value", name, variable, value: structuredClone(variable.value) };
}

export function workflowVariableValues(variables: readonly WorkflowVariableRecord[]): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(variables.map((variable) => [variable.name, structuredClone(variable.value)])));
}

export type WorkflowExpressionEvaluation =
  | Readonly<{
      valid: true;
      matched: boolean;
      explanation: string;
      inputs: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{
      valid: false;
      issues: readonly WorkflowVariableIssue[];
      inputs: Readonly<Record<string, unknown>>;
    }>;

function referencedVariables(rule: WorkflowDecisionRule): readonly { name: string; valueType: string; presenceOnly: boolean }[] {
  if (rule.kind === "group") return rule.rules.flatMap(referencedVariables);
  return [{
    name: rule.variableId,
    valueType: rule.valueType,
    presenceOnly: rule.operator === "exists" || rule.operator === "not_exists",
  }];
}

function decisionTypeMatches(valueType: string, variable: WorkflowVariableRecord): boolean {
  if (variable.value === null) return true;
  if (valueType === "string_list") return variable.dataType === "array"
    && Array.isArray(variable.value) && variable.value.every((item) => typeof item === "string");
  if (valueType === "number_list") return variable.dataType === "array"
    && Array.isArray(variable.value) && variable.value.every((item) => typeof item === "number" && Number.isFinite(item));
  return variable.dataType === valueType;
}

export function evaluateWorkflowRuntimeExpression(
  expression: unknown,
  variables: readonly WorkflowVariableRecord[],
  context: Readonly<{ nodeInstanceId?: string; edgeId?: string }> = {},
): WorkflowExpressionEvaluation {
  const parsed = workflowDecisionRuleSchema.safeParse(expression);
  if (!parsed.success) {
    return {
      valid: false,
      inputs: {},
      issues: Object.freeze(parsed.error.issues.map((issue) => ({
        code: "type_mismatch" as const,
        ...context,
        message: `Ongeldige runtime-expressie: ${issue.message}`,
      }))),
    };
  }
  const inputs: Record<string, unknown> = {};
  const issues: WorkflowVariableIssue[] = [];
  for (const reference of referencedVariables(parsed.data)) {
    const resolution = resolveWorkflowVariable(variables, reference.name);
    if (resolution.status === "missing") {
      if (!reference.presenceOnly) issues.push({
        code: "missing_variable",
        variableName: reference.name,
        ...context,
        message: `Expressie vereist variabele ${reference.name}, maar die ontbreekt.`,
      });
      continue;
    }
    inputs[reference.name] = resolution.variable.value;
    if (!reference.presenceOnly && !decisionTypeMatches(reference.valueType, resolution.variable)) {
      issues.push({
        code: "type_mismatch",
        variableName: reference.name,
        expectedType: reference.valueType === "string_list" || reference.valueType === "number_list" ? "array" : reference.valueType as WorkflowVariableDataType,
        actualType: resolution.variable.dataType,
        ...context,
        message: `Expressie verwacht ${reference.valueType} voor ${reference.name}, maar de runtimevariabele is ${resolution.variable.dataType}.`,
      });
    }
  }
  if (issues.length > 0) return { valid: false, inputs: Object.freeze(inputs), issues: Object.freeze(issues) };
  const evaluated = evaluateWorkflowDecision({ label: "Runtimeconditie", rule: parsed.data }, inputs);
  if (!evaluated.valid) {
    return {
      valid: false,
      inputs: Object.freeze(inputs),
      issues: Object.freeze(evaluated.issues.map((issue) => ({
        code: "type_mismatch" as const,
        variableName: issue.variableId,
        ...context,
        message: issue.message,
      }))),
    };
  }
  return {
    valid: true,
    matched: evaluated.matched,
    explanation: evaluated.explanation,
    inputs: Object.freeze(inputs),
  };
}
