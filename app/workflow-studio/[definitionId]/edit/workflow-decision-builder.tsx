"use client";

import { useState } from "react";
import {
  evaluateWorkflowDecision,
  workflowDecisionConfigurationSchema,
  type WorkflowDecisionCondition,
  type WorkflowDecisionGroup,
  type WorkflowDecisionOperator,
  type WorkflowDecisionRule,
  type WorkflowDecisionValueType,
} from "@/lib/workflow-studio/decision-schema";
import type { WorkflowVariableOption } from "@/lib/workflow-studio/properties-schema";
import { WorkflowVariablePicker } from "./workflow-variable-picker";

const valueTypes: readonly WorkflowDecisionValueType[] = ["string", "number", "boolean", "date", "string_list", "number_list"];
const operatorLabels: Readonly<Record<WorkflowDecisionOperator, string>> = {
  equals: "is gelijk aan", not_equals: "is niet gelijk aan", greater_than: "is groter dan", greater_than_or_equal: "is groter dan of gelijk aan",
  less_than: "is kleiner dan", less_than_or_equal: "is kleiner dan of gelijk aan", exists: "is aanwezig", not_exists: "is niet aanwezig",
  in: "staat in lijst", not_in: "staat niet in lijst", contains: "bevat", not_contains: "bevat niet",
};

function operatorsFor(valueType: WorkflowDecisionValueType): readonly WorkflowDecisionOperator[] {
  if (valueType === "string_list" || valueType === "number_list") return ["contains", "not_contains", "exists", "not_exists"];
  if (valueType === "number" || valueType === "date") return ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "in", "not_in", "exists", "not_exists"];
  return ["equals", "not_equals", "in", "not_in", "exists", "not_exists"];
}

function defaultCondition(): WorkflowDecisionCondition {
  return { kind: "condition", variableId: "waarde", valueType: "string", operator: "exists" };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function replaceRule(root: WorkflowDecisionRule, path: readonly number[], replacement: WorkflowDecisionRule): WorkflowDecisionRule {
  if (path.length === 0) return replacement;
  if (root.kind !== "group") return root;
  const [index, ...rest] = path;
  return { ...root, rules: root.rules.map((rule, ruleIndex) => ruleIndex === index ? replaceRule(rule, rest, replacement) : rule) };
}

function removeRule(root: WorkflowDecisionRule, path: readonly number[]): WorkflowDecisionRule {
  if (path.length === 0 || root.kind !== "group") return root;
  if (path.length === 1) return { ...root, rules: root.rules.filter((_, index) => index !== path[0]) };
  const [index, ...rest] = path;
  return { ...root, rules: root.rules.map((rule, ruleIndex) => ruleIndex === index ? removeRule(rule, rest) : rule) };
}

function parseOperand(raw: string, condition: WorkflowDecisionCondition): WorkflowDecisionCondition["value"] {
  const membership = condition.operator === "in" || condition.operator === "not_in";
  const numberValue = condition.valueType === "number" || condition.valueType === "number_list";
  if (membership) return raw.split(",").map((item) => item.trim()).filter(Boolean).map((item) => numberValue ? Number(item) : item);
  if (condition.valueType === "number" || condition.valueType === "number_list") return Number(raw);
  if (condition.valueType === "boolean") return raw === "true";
  return raw;
}

function defaultOperand(valueType: WorkflowDecisionValueType, operator: WorkflowDecisionOperator): WorkflowDecisionCondition["value"] {
  if (operator === "exists" || operator === "not_exists") return undefined;
  if (operator === "in" || operator === "not_in") return valueType === "number" ? [1] : ["voorbeeld"];
  if (valueType === "number" || valueType === "number_list") return 1;
  if (valueType === "boolean") return true;
  if (valueType === "date") return "2026-01-15";
  return "voorbeeld";
}

function sampleFor(condition: WorkflowDecisionCondition): unknown {
  if (condition.operator === "not_exists") return undefined;
  if (condition.operator === "in" || condition.operator === "not_in") return Array.isArray(condition.value) ? condition.value[0] : undefined;
  if (condition.operator === "contains" || condition.operator === "not_contains") return [condition.value];
  if (condition.value !== undefined) return condition.value;
  if (condition.valueType === "number") return 10;
  if (condition.valueType === "boolean") return true;
  if (condition.valueType === "date") return "2026-01-15";
  if (condition.valueType === "string_list") return ["voorbeeld"];
  if (condition.valueType === "number_list") return [1];
  return "voorbeeld";
}

function collectConditions(rule: WorkflowDecisionRule): WorkflowDecisionCondition[] {
  return rule.kind === "condition" ? [rule] : rule.rules.flatMap(collectConditions);
}

function ConditionEditor({ condition, path, variableOptions, onReplace, onRemove }: {
  condition: WorkflowDecisionCondition;
  path: readonly number[];
  variableOptions: readonly WorkflowVariableOption[];
  onReplace: (path: readonly number[], rule: WorkflowDecisionRule) => void;
  onRemove: (path: readonly number[]) => void;
}) {
  const presence = condition.operator === "exists" || condition.operator === "not_exists";
  const membership = condition.operator === "in" || condition.operator === "not_in";
  const value = Array.isArray(condition.value) ? condition.value.join(", ") : condition.value === undefined ? "" : String(condition.value);
  function patch(next: Partial<WorkflowDecisionCondition>) { onReplace(path, { ...condition, ...next }); }
  return <fieldset className="workflow-decision-condition">
    <legend>Conditie</legend>
    <WorkflowVariablePicker label="Variabele" value={condition.variableId} options={variableOptions} onChange={(value) => patch({ variableId: String(value) })} />
    <label>Type<select value={condition.valueType} onChange={(event) => {
      const valueType = event.target.value as WorkflowDecisionValueType;
      const operator = operatorsFor(valueType)[0]!;
      patch({ valueType, operator, value: defaultOperand(valueType, operator) });
    }}>{valueTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
    <label>Operator<select value={condition.operator} onChange={(event) => {
      const operator = event.target.value as WorkflowDecisionOperator;
      patch({ operator, value: defaultOperand(condition.valueType, operator) });
    }}>{operatorsFor(condition.valueType).map((item) => <option value={item} key={item}>{operatorLabels[item]}</option>)}</select></label>
    {!presence && (condition.valueType === "boolean" && !membership
      ? <label>Waarde<select value={String(condition.value)} onChange={(event) => patch({ value: event.target.value === "true" })}><option value="true">waar</option><option value="false">onwaar</option></select></label>
      : <label>{membership ? "Waarden (komma-gescheiden)" : "Waarde"}<input type={condition.valueType === "date" ? "date" : condition.valueType === "number" || condition.valueType === "number_list" ? "number" : "text"} value={value} onChange={(event) => patch({ value: parseOperand(event.target.value, condition) })} /></label>)}
    <button type="button" aria-label={`Verwijder conditie ${condition.variableId}`} onClick={() => onRemove(path)}>×</button>
  </fieldset>;
}

function GroupEditor({ group, path, variableOptions, onReplace, onRemove }: {
  group: WorkflowDecisionGroup;
  path: readonly number[];
  variableOptions: readonly WorkflowVariableOption[];
  onReplace: (path: readonly number[], rule: WorkflowDecisionRule) => void;
  onRemove: (path: readonly number[]) => void;
}) {
  function replaceNested(nestedPath: readonly number[], rule: WorkflowDecisionRule) { onReplace([...path, ...nestedPath], rule); }
  function removeNested(nestedPath: readonly number[]) { onRemove([...path, ...nestedPath]); }
  return <fieldset className="workflow-decision-group">
    <legend>Regelgroep</legend>
    <label>Combinatie<select value={group.combinator} onChange={(event) => onReplace(path, { ...group, combinator: event.target.value as "AND" | "OR" })}><option value="AND">Alle regels (AND)</option><option value="OR">Minstens één regel (OR)</option></select></label>
    {group.rules.map((rule, index) => rule.kind === "condition"
      ? <ConditionEditor key={index} condition={rule} path={[index]} variableOptions={variableOptions} onReplace={replaceNested} onRemove={removeNested} />
      : <GroupEditor key={index} group={rule} path={[index]} variableOptions={variableOptions} onReplace={replaceNested} onRemove={removeNested} />)}
    <div className="workflow-decision-add">
      <button type="button" className="button" onClick={() => onReplace(path, { ...group, rules: [...group.rules, defaultCondition()] })}>Conditie toevoegen</button>
      <button type="button" className="button" onClick={() => onReplace(path, { ...group, rules: [...group.rules, { kind: "group", combinator: "AND", rules: [defaultCondition()] }] })}>Groep toevoegen</button>
      {path.length > 0 && <button type="button" className="button" onClick={() => onRemove(path)}>Groep verwijderen</button>}
    </div>
  </fieldset>;
}

export function WorkflowDecisionBuilder({ configuration, variableOptions, onChange }: {
  configuration: unknown;
  variableOptions: readonly WorkflowVariableOption[];
  onChange: (configuration: Readonly<Record<string, unknown>>, message: string) => void;
}) {
  const config = record(configuration);
  const label = typeof config.label === "string" ? config.label : "Nieuwe beslissing";
  const parsedRule = config.rule && typeof config.rule === "object" ? config.rule as WorkflowDecisionRule : { kind: "group", combinator: "AND", rules: [defaultCondition()] } as WorkflowDecisionGroup;
  const rule = parsedRule.kind === "group" ? parsedRule : { kind: "group", combinator: "AND", rules: [parsedRule] } as WorkflowDecisionGroup;
  const [samples, setSamples] = useState<Record<string, unknown>>({});
  const exampleValues = Object.fromEntries(collectConditions(rule).map((condition) => [condition.variableId, Object.hasOwn(samples, condition.variableId) ? samples[condition.variableId] : sampleFor(condition)]));
  const contract = workflowDecisionConfigurationSchema.safeParse({ label, rule });
  const evaluation = evaluateWorkflowDecision({ label, rule }, exampleValues);

  function emit(nextRule: WorkflowDecisionRule, message: string) { onChange({ label, rule: nextRule }, message); }
  function replace(path: readonly number[], replacement: WorkflowDecisionRule) { emit(replaceRule(rule, path, replacement), "Beslisregel gewijzigd."); }
  function remove(path: readonly number[]) { emit(removeRule(rule, path), "Beslisregel verwijderd."); }

  return <fieldset className="workflow-decision-properties">
    <legend>Beslissing configureren</legend>
    <label>Label<input value={label} onChange={(event) => onChange({ label: event.target.value, rule }, "Beslislabel gewijzigd.")} /></label>
    <GroupEditor group={rule} path={[]} variableOptions={variableOptions} onReplace={replace} onRemove={remove} />
    <div className="workflow-decision-contract" data-valid={contract.success}>{contract.success ? "Besliscontract geldig" : contract.error.issues[0]?.message}</div>
    <section className="workflow-decision-preview" aria-labelledby="decision-preview-title">
      <h3 id="decision-preview-title">Test met voorbeeldwaarden</h3>
      {collectConditions(rule).map((condition, index) => {
        const sample = exampleValues[condition.variableId];
        const listType = condition.valueType === "string_list" || condition.valueType === "number_list";
        return <label key={`${condition.variableId}:${index}`}>{condition.variableId} <small>{condition.valueType}</small>
          {condition.valueType === "boolean"
            ? <select value={String(sample)} onChange={(event) => setSamples({ ...samples, [condition.variableId]: event.target.value === "true" })}><option value="true">waar</option><option value="false">onwaar</option></select>
            : <input type={condition.valueType === "date" ? "date" : condition.valueType === "number" ? "number" : "text"} value={listType && Array.isArray(sample) ? sample.join(", ") : sample === undefined ? "" : String(sample)} onChange={(event) => setSamples({ ...samples, [condition.variableId]: listType ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => condition.valueType === "number_list" ? Number(item) : item) : condition.valueType === "number" ? Number(event.target.value) : event.target.value })} />}
        </label>;
      })}
      {evaluation.valid
        ? <><output className={evaluation.matched ? "is-match" : "is-no-match"}>{evaluation.matched ? "Uitkomst: waar" : "Uitkomst: onwaar"}</output><p>{evaluation.explanation}</p></>
        : <output className="is-no-match">{evaluation.issues[0]?.message}</output>}
      <p>Uitgang: <code>{evaluation.valid && evaluation.matched ? "matched" : "otherwise"}</code></p>
    </section>
  </fieldset>;
}
