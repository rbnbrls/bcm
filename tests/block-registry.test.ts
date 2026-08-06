import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import {
  INITIAL_BLOCK_TYPES,
  blockRegistry,
} from "@/lib/workflow-studio/block-registry";

function identity(role: string): IdentityContext {
  return {
    userId: `${role}-1`,
    displayName: role,
    groups: [`bcm:role:${role}`],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "session-1",
  };
}

describe("initial Workflow Studio block registry", () => {
  it("registers the nine initial versioned block contracts", () => {
    const blocks = blockRegistry.listForIdentity(identity("change_manager"));

    expect(blocks.map((block) => block.blockType)).toEqual(INITIAL_BLOCK_TYPES);
    expect(blocks.every((block) => block.contractVersion === 1)).toBe(true);
    for (const blockType of INITIAL_BLOCK_TYPES) {
      expect(blockRegistry.contracts.resolve({ blockType, contractVersion: 1 }).valid).toBe(true);
    }
  });

  it("returns JSON Schema, UI schema, ports and capabilities without runtime internals", () => {
    const form = blockRegistry.getForIdentity(identity("change_manager"), {
      blockType: "form",
      contractVersion: 1,
    });

    expect(form).toMatchObject({
      blockType: "form",
      contractVersion: 1,
      configurationSchema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
      },
      configurationUiSchema: { widgets: { fields: "form-fields" } },
      capabilities: ["user_input"],
      ui: { category: "interaction" },
    });
    expect(form?.inputs).toHaveLength(1);
    expect(form?.outputs).toHaveLength(1);
    expect(form).not.toHaveProperty("runtimeHandlerId");
    expect(form).not.toHaveProperty("validateConfiguration");
    expect(form).not.toHaveProperty("allowedConnections");
  });

  it("filters blocks server-side using signed identity permissions", () => {
    expect(blockRegistry.listForIdentity(identity("account_manager"))).toEqual([]);
    expect(blockRegistry.listForIdentity(identity("admin"))).toEqual([]);
    expect(blockRegistry.listForIdentity(identity("forged_change_manager"))).toEqual([]);
    expect(blockRegistry.getForIdentity(identity("account_manager"), {
      blockType: "approval",
      contractVersion: 1,
    })).toBeNull();
  });

  it("does not disclose unknown or unauthorized block references", () => {
    const actor = identity("change_manager");
    expect(blockRegistry.getForIdentity(actor, { blockType: "script", contractVersion: 1 })).toBeNull();
    expect(blockRegistry.getForIdentity(actor, { blockType: "form", contractVersion: 99 })).toBeNull();
  });

  it("keeps catalog results immutable and deterministically ordered", () => {
    const blocks = blockRegistry.listForIdentity(identity("change_manager"));
    expect(Object.isFrozen(blocks)).toBe(true);
    expect(Object.isFrozen(blocks[0])).toBe(true);
    expect(blocks.map((block) => block.ui.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("validates representative configurations through the shared contracts", () => {
    expect(blockRegistry.contracts.validateNode({
      blockType: "change_request",
      contractVersion: 1,
      configuration: {
        resourceId: "portfolio_configuration",
        operation: "UPDATE",
        effectiveDateVariable: "effective_date",
        rationaleVariable: "rationale",
      },
    }).valid).toBe(true);

    const invalid = blockRegistry.contracts.validateNode({
      blockType: "change_request",
      contractVersion: 1,
      configuration: {
        resourceId: "portfolio configuration; DROP TABLE clients",
        operation: "DELETE",
        effectiveDateVariable: "Effective Date",
        rationaleVariable: "rationale",
      },
    });
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) {
      expect(invalid.issues.every((issue) => issue.code === "invalid_block_configuration")).toBe(true);
      expect(invalid.issues.map((issue) => issue.path.join("."))).toEqual([
        "resourceId",
        "operation",
        "effectiveDateVariable",
      ]);
    }
  });
});
