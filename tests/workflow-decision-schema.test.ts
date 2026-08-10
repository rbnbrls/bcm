import { describe, expect, it } from "vitest";
import {
  evaluateWorkflowDecision,
  workflowDecisionConfigurationSchema,
} from "@/lib/workflow-studio/decision-schema";

const configuration = {
  label: "Materiële urgente wijziging",
  rule: {
    kind: "group" as const,
    combinator: "AND" as const,
    rules: [
      { kind: "condition" as const, variableId: "bedrag", valueType: "number" as const, operator: "greater_than" as const, value: 100 },
      { kind: "condition" as const, variableId: "labels", valueType: "string_list" as const, operator: "contains" as const, value: "urgent" },
      {
        kind: "group" as const,
        combinator: "OR" as const,
        rules: [
          { kind: "condition" as const, variableId: "client_code", valueType: "string" as const, operator: "exists" as const },
          { kind: "condition" as const, variableId: "status", valueType: "string" as const, operator: "in" as const, value: ["open", "review"] },
        ],
      },
    ],
  },
};

describe("workflow decision rules", () => {
  it("accepts typed comparisons, presence, lists and nested AND/OR groups", () => {
    expect(workflowDecisionConfigurationSchema.safeParse(configuration).success).toBe(true);
  });

  it("evaluates without code execution and returns an explanation", () => {
    const result = evaluateWorkflowDecision(configuration, {
      bedrag: 150,
      labels: ["urgent", "client"],
      client_code: "HOR",
      status: "closed",
    });
    expect(result).toMatchObject({ valid: true, matched: true });
    if (result.valid) expect(result.explanation).toMatch(/bedrag \(number\).*EN.*labels \(string_list\).*OF/);
  });

  it("reports example values that do not match the declared variable type", () => {
    expect(evaluateWorkflowDecision(configuration, { bedrag: "150", labels: ["urgent"], client_code: "HOR", status: "open" }))
      .toMatchObject({ valid: false, issues: [{ variableId: "bedrag" }] });
  });

  it("rejects invalid operator/type/value combinations and free-code properties", () => {
    expect(workflowDecisionConfigurationSchema.safeParse({
      label: "Onveilig",
      rule: { kind: "condition", variableId: "naam", valueType: "string", operator: "greater_than", value: "A", code: "process.exit()" },
    }).success).toBe(false);
    expect(workflowDecisionConfigurationSchema.safeParse({
      label: "Verkeerde lijst",
      rule: { kind: "condition", variableId: "bedrag", valueType: "number", operator: "in", value: [1, "twee"] },
    }).success).toBe(false);
  });
});
