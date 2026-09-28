import { describe, expect, it } from "vitest";
import { workflowLookupConfigurationSchema } from "@/lib/workflow-studio/lookup-schema";

describe("workflow lookup configuration schema", () => {
  it("supports literal filters and client → portfolio scope dependencies", () => {
    expect(workflowLookupConfigurationSchema.safeParse({
      resourceId: "portfolio",
      filters: [{ attributeId: "active", source: "literal", value: true }],
      parentBinding: { mode: "scope_client", sourceVariable: "geselecteerde_client" },
      displayFields: ["code", "active"],
      selection: "many",
      outputVariable: "geselecteerde_portfolios",
    }).success).toBe(true);
  });

  it("supports portfolio → configuration attribute dependencies", () => {
    expect(workflowLookupConfigurationSchema.safeParse({
      resourceId: "portfolio_configuration",
      parentBinding: { mode: "attribute", sourceVariable: "geselecteerde_portfolio", targetAttributeId: "portfolio_code" },
      displayFields: ["primary_account_id", "portfolio_code"],
      outputVariable: "configuratieregel",
    }).success).toBe(true);
  });

  it("rejects duplicate fields, duplicate filters and output/input self-reference", () => {
    expect(workflowLookupConfigurationSchema.safeParse({
      resourceId: "client",
      filters: [
        { attributeId: "code", source: "variable", variableId: "client_output" },
        { attributeId: "code", source: "literal", value: "HOR" },
      ],
      displayFields: ["code", "code"],
      outputVariable: "client_output",
    }).success).toBe(false);
  });
});
