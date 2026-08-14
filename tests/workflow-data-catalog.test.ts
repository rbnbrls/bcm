import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import {
  clientConfigDataCatalog,
  toPublicChangeRequestCatalog,
  toPublicDataCatalog,
  type DataCatalogResource,
} from "@/lib/workflow-studio/data-catalog";

function identity(role: string, overrides: Partial<IdentityContext> = {}): IdentityContext {
  return {
    userId: `${role}-1`,
    displayName: role,
    groups: [`bcm:role:${role}`],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "session-1",
    ...overrides,
  };
}

const scope = { tenant: "tenant-a", businessUnit: "investments", clientIds: ["HOR"] };

function getResource(id: string): DataCatalogResource {
  const result = clientConfigDataCatalog.resolve({ resourceId: id });
  if (!result.valid) throw new Error(result.message);
  return result.resource;
}

describe("Workflow Studio client-config data catalog", () => {
  it("registers core resources and governed lookup dimensions under stable IDs", () => {
    expect(clientConfigDataCatalog.list().map((resource) => resource.id)).toEqual([
      "client",
      "parent_account",
      "portfolio",
      "portfolio_configuration",
      "asset_class",
      "sub_asset_class",
      "manager",
      "benchmark",
      "npc_classification",
    ]);
  });

  it("describes every attribute with labels, readability, validation, operations and scope", () => {
    for (const resource of clientConfigDataCatalog.list()) {
      expect(resource.label).not.toBe("");
      expect(resource.authorizationScope).toMatch(/^(business_unit|client)$/);
      expect(resource.attributes.some((attribute) => attribute.id === resource.identityAttributeId)).toBe(true);
      for (const attribute of resource.attributes) {
        expect(attribute.label).not.toBe("");
        expect(attribute.description).not.toBe("");
        expect(typeof attribute.readable).toBe("boolean");
        expect(Array.isArray(attribute.requestableOperations)).toBe(true);
        expect(attribute.validationSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
        expect(attribute.authorizationScope).toMatch(/^(business_unit|client)$/);
      }
    }
  });

  it("models relationships only through stable catalog references", () => {
    const configuration = getResource("portfolio_configuration");
    const relationships = Object.fromEntries(configuration.attributes
      .filter((attribute) => attribute.relationship)
      .map((attribute) => [attribute.id, attribute.relationship]));

    expect(relationships).toMatchObject({
      client_code: { resourceId: "client", attributeId: "code", cardinality: "many_to_one" },
      portfolio_code: { resourceId: "portfolio", attributeId: "code", cardinality: "many_to_one" },
      asset_class_code: { resourceId: "asset_class", attributeId: "code" },
      manager_code: { resourceId: "manager", attributeId: "code" },
    });
    expect(JSON.stringify(clientConfigDataCatalog.list())).not.toMatch(/tableName|columnName|SELECT|client_config\./);
  });

  it("matches existing request governance for resources and lookup dimensions", () => {
    expect(clientConfigDataCatalog.resolve({ resourceId: "portfolio", attributeId: "code", operation: "CREATE" }).valid).toBe(true);
    expect(clientConfigDataCatalog.resolve({ resourceId: "client", attributeId: "portfolio_code", operation: "CREATE" }).valid).toBe(true);
    expect(clientConfigDataCatalog.resolve({ resourceId: "client", attributeId: "effective_from", operation: "CREATE" }).valid).toBe(true);
    expect(clientConfigDataCatalog.resolve({ resourceId: "portfolio", attributeId: "code", operation: "RETIRE" }).valid).toBe(true);
    expect(clientConfigDataCatalog.resolve({ resourceId: "portfolio_configuration", attributeId: "long_name", operation: "UPDATE" }).valid).toBe(true);
    expect(clientConfigDataCatalog.resolve({ resourceId: "asset_class", attributeId: "code", operation: "CREATE" }).valid).toBe(true);
    expect(clientConfigDataCatalog.resolve({ resourceId: "benchmark", attributeId: "code", operation: "CREATE" }).valid).toBe(true);

    expect(clientConfigDataCatalog.resolve({ resourceId: "manager", attributeId: "code", operation: "CREATE" }))
      .toMatchObject({ valid: false, code: "operation_not_requestable" });
    expect(clientConfigDataCatalog.resolve({ resourceId: "npc_classification", operation: "CREATE" }))
      .toMatchObject({ valid: false, code: "operation_not_requestable" });
  });

  it("gates pure reads on readability while request resolution only needs requestability", () => {
    expect(clientConfigDataCatalog.resolve({ resourceId: "client", attributeId: "portfolio_code" }))
      .toMatchObject({ valid: false, code: "attribute_not_readable" });
    expect(clientConfigDataCatalog.resolve({ resourceId: "client", attributeId: "portfolio_code", operation: "CREATE" }).valid).toBe(true);
    expect(clientConfigDataCatalog.resolve({ resourceId: "client", attributeId: "code" }).valid).toBe(true);
  });

  it("rejects free SQL identifiers and unknown attributes with stable errors", () => {
    expect(clientConfigDataCatalog.resolve({ resourceId: "client_config.client" }))
      .toMatchObject({ valid: false, code: "unknown_catalog_resource" });
    expect(clientConfigDataCatalog.resolve({ resourceId: "portfolio", attributeId: "parent_account_id" }))
      .toMatchObject({ valid: false, code: "unknown_catalog_attribute" });
  });

  it("validates values using the same catalog contract", () => {
    const codeReference = clientConfigDataCatalog.resolve({
      resourceId: "portfolio_configuration",
      attributeId: "primary_account_id",
    });
    expect(codeReference.valid).toBe(true);
    if (!codeReference.valid || !codeReference.attribute) return;

    expect(codeReference.attribute.validateValue("HOR*EQACX*ROB").valid).toBe(true);
    expect(codeReference.attribute.validateValue("hor; drop table")).toMatchObject({ valid: false });
  });

  it("returns the catalog only inside the identity's design and data scope", () => {
    expect(clientConfigDataCatalog.listForIdentity(identity("change_manager"), scope)).toHaveLength(9);
    expect(clientConfigDataCatalog.listForIdentity(identity("account_manager"), scope)).toEqual([]);
    expect(clientConfigDataCatalog.listForIdentity(identity("change_manager"), {
      ...scope,
      tenant: "tenant-b",
    })).toEqual([]);
    expect(clientConfigDataCatalog.listForIdentity(identity("change_manager", {
      groups: ["bcm:role:change_manager", "bcm:client:ZEK"],
    }), scope)).toEqual([]);
  });

  it("keeps catalog resources, attributes and schemas immutable", () => {
    const resource = getResource("client");
    expect(Object.isFrozen(clientConfigDataCatalog.list())).toBe(true);
    expect(Object.isFrozen(resource)).toBe(true);
    expect(Object.isFrozen(resource.attributes)).toBe(true);
    expect(Object.isFrozen(resource.attributes[0].validationSchema)).toBe(true);
  });

  it("creates a serializable client catalog without validators or mutation metadata", () => {
    const publicCatalog = toPublicDataCatalog(clientConfigDataCatalog.list());
    const serialized = JSON.stringify(publicCatalog);
    expect(publicCatalog).toHaveLength(9);
    expect(Object.isFrozen(publicCatalog)).toBe(true);
    expect(serialized).not.toMatch(/validateValue|validationSchema|requestableOperations/);
    expect(publicCatalog[0]?.attributes[0]).toMatchObject({ id: "code", valueType: "string" });
  });

  it("creates a minimal request catalog containing only selectable operations and attributes", () => {
    const requestCatalog = toPublicChangeRequestCatalog(clientConfigDataCatalog.list());
    expect(requestCatalog.some((resource) => resource.id === "manager")).toBe(false);
    expect(requestCatalog.some((resource) => resource.id === "npc_classification")).toBe(false);
    const portfolioConfiguration = requestCatalog.find((resource) => resource.id === "portfolio_configuration");
    expect(portfolioConfiguration?.attributes.find((attribute) => attribute.id === "active")).toBeUndefined();
    expect(portfolioConfiguration?.attributes.find((attribute) => attribute.id === "benchmark_code")?.requestableOperations).toEqual(["CREATE", "UPDATE"]);
    expect(JSON.stringify(requestCatalog)).not.toMatch(/validateValue|validationSchema|readable/);
    expect(Object.isFrozen(requestCatalog)).toBe(true);
  });
});
