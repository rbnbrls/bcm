import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  WorkflowVariableRuntimeError,
  evaluateWorkflowRuntimeExpression,
  resolveWorkflowVariable,
  validateWorkflowVariableAssignments,
  workflowVariableValueMatches,
  workflowVariableValues,
  type WorkflowVariableRecord,
} from "@/lib/workflow-studio/runtime-variables";

function variable(
  name: string,
  dataType: WorkflowVariableRecord["dataType"],
  value: unknown,
): WorkflowVariableRecord {
  return {
    id: `variable-${name}`,
    instanceId: "instance-1",
    sourceNodeInstanceId: "node-1",
    scope: "node_output",
    name,
    dataType,
    value,
    classification: "internal",
    revision: 1,
    idempotencyKey: `write-${name}`,
    correlationId: "correlation-1",
  };
}

describe("workflow runtime variables", () => {
  it("validates every persisted data type as JSON-safe data", () => {
    expect(workflowVariableValueMatches("string", "waarde")).toBe(true);
    expect(workflowVariableValueMatches("number", 42.5)).toBe(true);
    expect(workflowVariableValueMatches("boolean", false)).toBe(true);
    expect(workflowVariableValueMatches("date", "2026-08-11")).toBe(true);
    expect(workflowVariableValueMatches("datetime", "2026-08-11T08:00:00+02:00")).toBe(true);
    expect(workflowVariableValueMatches("object", { nested: { valid: true } })).toBe(true);
    expect(workflowVariableValueMatches("array", ["a", 1, null])).toBe(true);
    expect(workflowVariableValueMatches("reference", { resourceId: "client", recordId: "client-1", label: "Client" })).toBe(true);
  });

  it("rejects wrong scalar types, invalid dates, non-finite values and executable objects", () => {
    expect(workflowVariableValueMatches("number", "42")).toBe(false);
    expect(workflowVariableValueMatches("number", Number.NaN)).toBe(false);
    expect(workflowVariableValueMatches("date", "11-08-2026")).toBe(false);
    expect(workflowVariableValueMatches("datetime", "2026-08-11 08:00")).toBe(false);
    expect(workflowVariableValueMatches("object", { run: () => true })).toBe(false);
    expect(workflowVariableValueMatches("array", [BigInt(1)])).toBe(false);
    expect(workflowVariableValueMatches("reference", { resourceId: "client" })).toBe(false);
  });

  it("treats explicit null as a typed persisted value and distinguishes it from missing", () => {
    for (const dataType of ["string", "number", "boolean", "date", "datetime", "object", "array", "reference"] as const) {
      expect(workflowVariableValueMatches(dataType, null)).toBe(true);
    }
    const records = [variable("optional_date", "date", null)];
    expect(resolveWorkflowVariable(records, "optional_date")).toMatchObject({ status: "null" });
    expect(resolveWorkflowVariable(records, "unknown")).toEqual({ status: "missing", name: "unknown" });
    expect(workflowVariableValues(records)).toEqual({ optional_date: null });
  });

  it("normalizes classification and rejects duplicate or malformed node outputs", () => {
    expect(validateWorkflowVariableAssignments([
      { name: "approved_amount", dataType: "number", value: 100 },
    ], "node-1")).toEqual([
      { name: "approved_amount", dataType: "number", value: 100, classification: "internal" },
    ]);

    expect(() => validateWorkflowVariableAssignments([
      { name: "Bad Name", dataType: "string", value: "x" },
      { name: "Bad Name", dataType: "number", value: "geen nummer" },
    ], "node-1")).toThrowError(expect.objectContaining({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "invalid_name", nodeInstanceId: "node-1" }),
        expect.objectContaining({ code: "duplicate_output" }),
        expect.objectContaining({ code: "invalid_value", expectedType: "number" }),
      ]),
    }));
  });

  it("evaluates nested AND/OR rules deterministically over typed records", () => {
    const evaluation = evaluateWorkflowRuntimeExpression({
      kind: "group",
      combinator: "AND",
      rules: [
        { kind: "condition", variableId: "amount", valueType: "number", operator: "greater_than_or_equal", value: 100 },
        {
          kind: "group",
          combinator: "OR",
          rules: [
            { kind: "condition", variableId: "urgent", valueType: "boolean", operator: "equals", value: true },
            { kind: "condition", variableId: "labels", valueType: "string_list", operator: "contains", value: "priority" },
          ],
        },
      ],
    }, [
      variable("amount", "number", 125),
      variable("urgent", "boolean", false),
      variable("labels", "array", ["priority", "change"]),
    ]);

    expect(evaluation).toMatchObject({ valid: true, matched: true });
    expect(evaluation.valid && evaluation.explanation).toContain("amount (number)");
    expect(evaluation.inputs).toEqual({ amount: 125, urgent: false, labels: ["priority", "change"] });
  });

  it("handles null and missing values without implicit coercion", () => {
    const records = [variable("comment", "string", null)];
    expect(evaluateWorkflowRuntimeExpression(
      { kind: "condition", variableId: "comment", valueType: "string", operator: "exists" },
      records,
    )).toMatchObject({ valid: true, matched: false });
    expect(evaluateWorkflowRuntimeExpression(
      { kind: "condition", variableId: "unknown", valueType: "string", operator: "not_exists" },
      records,
    )).toMatchObject({ valid: true, matched: true });
    expect(evaluateWorkflowRuntimeExpression(
      { kind: "condition", variableId: "unknown", valueType: "string", operator: "equals", value: "" },
      records,
      { nodeInstanceId: "node-1", edgeId: "edge-1" },
    )).toMatchObject({
      valid: false,
      issues: [{ code: "missing_variable", variableName: "unknown", nodeInstanceId: "node-1", edgeId: "edge-1" }],
    });
  });

  it("returns node-level diagnostics for declared/runtime type mismatches", () => {
    const evaluation = evaluateWorkflowRuntimeExpression(
      { kind: "condition", variableId: "amount", valueType: "number", operator: "greater_than", value: 10 },
      [variable("amount", "string", "veel")],
      { nodeInstanceId: "node-7", edgeId: "edge-9" },
    );
    expect(evaluation).toEqual(expect.objectContaining({
      valid: false,
      issues: [expect.objectContaining({
        code: "type_mismatch",
        variableName: "amount",
        expectedType: "number",
        actualType: "string",
        nodeInstanceId: "node-7",
        edgeId: "edge-9",
      })],
    }));
  });

  it("does not use eval, Function construction, SQL or network access", async () => {
    const source = await fs.readFile(path.resolve(__dirname, "..", "lib", "workflow-studio", "runtime-variables.ts"), "utf8");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/new\s+Function\b/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
  });

  it("uses a typed runtime error for invalid assignments", () => {
    expect(() => validateWorkflowVariableAssignments([
      { name: "amount", dataType: "number", value: "wrong" },
    ])).toThrow(WorkflowVariableRuntimeError);
  });
});
