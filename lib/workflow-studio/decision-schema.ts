import { z } from "zod";

const variableId = z.string().regex(/^[a-z][a-z0-9_]*$/, "Gebruik een stabiele snake_case variabele-ID.");

export const workflowDecisionValueTypeSchema = z.enum(["string", "number", "boolean", "date", "string_list", "number_list"]);
export const workflowDecisionOperatorSchema = z.enum([
  "equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal",
  "exists", "not_exists", "in", "not_in", "contains", "not_contains",
]);

export type WorkflowDecisionValueType = z.infer<typeof workflowDecisionValueTypeSchema>;
export type WorkflowDecisionOperator = z.infer<typeof workflowDecisionOperatorSchema>;
export type WorkflowDecisionOperand = string | number | boolean | readonly (string | number | boolean)[];
export type WorkflowDecisionCondition = {
  kind: "condition";
  variableId: string;
  valueType: WorkflowDecisionValueType;
  operator: WorkflowDecisionOperator;
  value?: WorkflowDecisionOperand;
};
export type WorkflowDecisionGroup = {
  kind: "group";
  combinator: "AND" | "OR";
  rules: WorkflowDecisionRule[];
};
export type WorkflowDecisionRule = WorkflowDecisionCondition | WorkflowDecisionGroup;

const operandSchema = z.union([
  z.string().max(1_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.union([z.string().max(1_000), z.number().finite(), z.boolean()])).min(1).max(100),
]);
const isoDateSchema = z.iso.date();

function isIsoDate(value: unknown): value is string {
  return isoDateSchema.safeParse(value).success;
}

function scalarMatches(valueType: WorkflowDecisionValueType, value: unknown): boolean {
  if (valueType === "number" || valueType === "number_list") return typeof value === "number" && Number.isFinite(value);
  if (valueType === "boolean") return typeof value === "boolean";
  if (valueType === "date") return isIsoDate(value);
  return typeof value === "string";
}

const conditionSchema = z.object({
  kind: z.literal("condition"),
  variableId,
  valueType: workflowDecisionValueTypeSchema,
  operator: workflowDecisionOperatorSchema,
  value: operandSchema.optional(),
}).strict().superRefine((condition, context) => {
  const presence = condition.operator === "exists" || condition.operator === "not_exists";
  const comparison = ["greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"].includes(condition.operator);
  const membership = condition.operator === "in" || condition.operator === "not_in";
  const contains = condition.operator === "contains" || condition.operator === "not_contains";
  const listType = condition.valueType === "string_list" || condition.valueType === "number_list";

  if (presence && condition.value !== undefined) context.addIssue({ code: "custom", path: ["value"], message: "Aanwezigheidsregels hebben geen vergelijkingswaarde." });
  if (!presence && condition.value === undefined) context.addIssue({ code: "custom", path: ["value"], message: "Deze operator vereist een getypeerde vergelijkingswaarde." });
  if (comparison && condition.valueType !== "number" && condition.valueType !== "date") context.addIssue({ code: "custom", path: ["operator"], message: "Groter/kleiner is alleen toegestaan voor getallen en datums." });
  if (contains && !listType) context.addIssue({ code: "custom", path: ["operator"], message: "Bevat-regels vereisen een lijstvariabele." });
  if ((condition.operator === "equals" || condition.operator === "not_equals" || membership) && listType) context.addIssue({ code: "custom", path: ["operator"], message: "Gebruik bevat/niet-bevat voor lijstvariabelen." });
  if (membership && !Array.isArray(condition.value)) context.addIssue({ code: "custom", path: ["value"], message: "In-lijstregels vereisen een lijst met toegestane waarden." });
  if (!presence && !membership && condition.value !== undefined && (Array.isArray(condition.value) || !scalarMatches(condition.valueType, condition.value))) {
    context.addIssue({ code: "custom", path: ["value"], message: `De vergelijkingswaarde past niet bij type ${condition.valueType}.` });
  }
  if (membership && Array.isArray(condition.value) && condition.value.some((value) => !scalarMatches(condition.valueType, value))) {
    context.addIssue({ code: "custom", path: ["value"], message: `Iedere lijstwaarde moet type ${condition.valueType} hebben.` });
  }
});

export const workflowDecisionRuleSchema: z.ZodType<WorkflowDecisionRule> = z.lazy(() => z.union([
  conditionSchema,
  z.object({
    kind: z.literal("group"),
    combinator: z.enum(["AND", "OR"]),
    rules: z.array(workflowDecisionRuleSchema).min(1).max(20),
  }).strict(),
]));

export const workflowDecisionConfigurationSchema = z.object({
  label: z.string().trim().min(1).max(120),
  rule: workflowDecisionRuleSchema,
}).strict().superRefine((configuration, context) => {
  let conditions = 0;
  function visit(rule: WorkflowDecisionRule, depth: number): void {
    if (depth > 5) context.addIssue({ code: "custom", path: ["rule"], message: "Regelgroepen mogen maximaal vijf niveaus diep zijn." });
    if (rule.kind === "condition") conditions += 1;
    else rule.rules.forEach((nested) => visit(nested, depth + 1));
  }
  visit(configuration.rule, 1);
  if (conditions > 100) context.addIssue({ code: "custom", path: ["rule"], message: "Een beslissing ondersteunt maximaal honderd condities." });
});

export type WorkflowDecisionConfiguration = z.infer<typeof workflowDecisionConfigurationSchema>;

export type WorkflowDecisionEvaluation =
  | { valid: true; matched: boolean; explanation: string }
  | { valid: false; issues: readonly { variableId?: string; message: string }[] };

function variableMatches(valueType: WorkflowDecisionValueType, value: unknown): boolean {
  if (valueType === "string_list") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (valueType === "number_list") return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
  return scalarMatches(valueType, value);
}

function evaluateCondition(condition: WorkflowDecisionCondition, variables: Readonly<Record<string, unknown>>): boolean {
  const actual = variables[condition.variableId];
  if (condition.operator === "exists") return actual !== undefined && actual !== null;
  if (condition.operator === "not_exists") return actual === undefined || actual === null;
  if (actual === undefined || actual === null) return false;
  const expected = condition.value;
  switch (condition.operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "greater_than": return actual > expected!;
    case "greater_than_or_equal": return actual >= expected!;
    case "less_than": return actual < expected!;
    case "less_than_or_equal": return actual <= expected!;
    case "in": return Array.isArray(expected) && expected.includes(actual as never);
    case "not_in": return Array.isArray(expected) && !expected.includes(actual as never);
    case "contains": return Array.isArray(actual) && actual.includes(expected as never);
    case "not_contains": return Array.isArray(actual) && !actual.includes(expected as never);
    default: return false;
  }
}

function describeValue(value: unknown): string {
  return Array.isArray(value) ? `[${value.map(describeValue).join(", ")}]` : JSON.stringify(value);
}

function evaluateRule(rule: WorkflowDecisionRule, variables: Readonly<Record<string, unknown>>): { matched: boolean; explanation: string } {
  if (rule.kind === "condition") {
    const matched = evaluateCondition(rule, variables);
    return { matched, explanation: `${rule.variableId} (${rule.valueType}) ${rule.operator}${rule.value === undefined ? "" : ` ${describeValue(rule.value)}`} → ${matched ? "waar" : "onwaar"}` };
  }
  const children = rule.rules.map((nested) => evaluateRule(nested, variables));
  const matched = rule.combinator === "AND" ? children.every((child) => child.matched) : children.some((child) => child.matched);
  return { matched, explanation: `(${children.map((child) => child.explanation).join(rule.combinator === "AND" ? " EN " : " OF ")}) → ${matched ? "waar" : "onwaar"}` };
}

export function evaluateWorkflowDecision(configuration: unknown, variables: Readonly<Record<string, unknown>>): WorkflowDecisionEvaluation {
  const parsed = workflowDecisionConfigurationSchema.safeParse(configuration);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map((item) => ({ message: item.message })) };
  const issues: { variableId?: string; message: string }[] = [];
  function validateVariables(rule: WorkflowDecisionRule): void {
    if (rule.kind === "group") return rule.rules.forEach(validateVariables);
    const value = variables[rule.variableId];
    if (value !== undefined && value !== null && !variableMatches(rule.valueType, value)) issues.push({ variableId: rule.variableId, message: `Voorbeeldwaarde voor ${rule.variableId} is niet van type ${rule.valueType}.` });
  }
  validateVariables(parsed.data.rule);
  if (issues.length > 0) return { valid: false, issues: Object.freeze(issues) };
  return { valid: true, ...evaluateRule(parsed.data.rule, variables) };
}
