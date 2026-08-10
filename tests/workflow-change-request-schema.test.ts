import { describe, expect, it } from "vitest";
import { workflowChangeRequestConfigurationSchema } from "@/lib/workflow-studio/change-request-schema";

const common = {
  resourceId: "portfolio_configuration",
  effectiveDateVariable: "ingangsdatum",
  rationaleVariable: "toelichting",
};

describe("workflow change-request configuration schema", () => {
  it("accepts CREATE mappings from workflow outputs to SOLL", () => {
    expect(workflowChangeRequestConfigurationSchema.safeParse({
      ...common,
      operation: "CREATE",
      attributeMappings: [{ attributeId: "portfolio_code", soll: { variableId: "nieuw_portfolio" } }],
    }).success).toBe(true);
  });

  it("accepts UPDATE mappings from snapshot IST to workflow-output SOLL", () => {
    expect(workflowChangeRequestConfigurationSchema.safeParse({
      ...common,
      operation: "UPDATE",
      attributeMappings: [{
        attributeId: "benchmark_code",
        ist: { snapshotVariableId: "geselecteerde_configuratie", snapshotAttributeId: "benchmark_code" },
        soll: { variableId: "nieuwe_benchmark" },
      }],
    }).success).toBe(true);
  });

  it("accepts RETIRE with IST but without a separate SOLL value", () => {
    expect(workflowChangeRequestConfigurationSchema.safeParse({
      ...common,
      operation: "RETIRE",
      attributeMappings: [{ attributeId: "primary_account_id", ist: { snapshotVariableId: "geselecteerde_configuratie", snapshotAttributeId: "primary_account_id" } }],
    }).success).toBe(true);
  });

  it("rejects duplicate targets and operation-incompatible mappings", () => {
    const result = workflowChangeRequestConfigurationSchema.safeParse({
      ...common,
      operation: "CREATE",
      attributeMappings: [
        { attributeId: "portfolio_code", ist: { snapshotVariableId: "snapshot", snapshotAttributeId: "portfolio_code" } },
        { attributeId: "portfolio_code", soll: { variableId: "nieuw_portfolio" } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "Map ieder doelattribuut maximaal één keer.",
      "CREATE heeft geen IST-snapshot.",
      "CREATE vereist een SOLL-variabele.",
    ]));
  });
});
