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
    const start = blockRegistry.contracts.validateNode({
      blockType: "manual_start",
      contractVersion: 1,
      configuration: {
        label: "Start aanvraag",
        starterRoleIds: ["aanvrager", "change_manager"],
        dataScope: "requester_scope",
      },
    });
    expect(start.valid).toBe(true);

    const invalidStart = blockRegistry.contracts.validateNode({
      blockType: "manual_start",
      contractVersion: 1,
      configuration: { label: "Start", starterRoleIds: [], dataScope: "alle_data" },
    });
    expect(invalidStart.valid).toBe(false);

    for (const outcome of ["completed", "rejected", "cancelled"] as const) {
      expect(blockRegistry.contracts.validateNode({
        blockType: "end",
        contractVersion: 1,
        configuration: { label: "Einde", outcome },
      }).valid).toBe(true);
    }

    expect(blockRegistry.contracts.validateNode({
      blockType: "role_task",
      contractVersion: 1,
      configuration: {
        roleId: "uitvoerder",
        title: "Controleer aanvraag",
        instructions: "Controleer de invoer en leg het resultaat vast.",
        inputVariables: ["aanvraag"],
        outputVariables: ["controle_resultaat"],
        deadlineHours: 24,
      },
    }).valid).toBe(true);
    expect(blockRegistry.contracts.validateNode({
      blockType: "role_task",
      contractVersion: 1,
      configuration: {
        roleId: "uitvoerder",
        title: "Ongeldig",
        instructions: "Dezelfde variabele is invoer en uitvoer.",
        inputVariables: ["resultaat"],
        outputVariables: ["resultaat"],
      },
    }).valid).toBe(false);
    expect(blockRegistry.contracts.validateNode({
      blockType: "approval",
      contractVersion: 1,
      configuration: {
        roleId: "checker",
        title: "Besluit",
        inputVariables: ["aanvraag"],
        decisionLabels: { approved: "Akkoord", rejected: "Niet akkoord", returned: "Aanvullen" },
        requireCommentOnApprove: false,
        requireCommentOnReject: true,
        requireCommentOnReturn: true,
      },
    }).valid).toBe(true);

    expect(blockRegistry.contracts.validateNode({
      blockType: "change_request",
      contractVersion: 1,
      configuration: {
        resourceId: "portfolio_configuration",
        operation: "UPDATE",
        attributeMappings: [{ attributeId: "benchmark_code", ist: { snapshotVariableId: "snapshot", snapshotAttributeId: "benchmark_code" }, soll: { variableId: "nieuwe_benchmark" } }],
        effectiveDateVariable: "effective_date",
        rationaleVariable: "rationale",
      },
    }).valid).toBe(true);

    expect(blockRegistry.contracts.validateNode({
      blockType: "notification",
      contractVersion: 1,
      configuration: {
        recipientRoleIds: ["aanvrager", "operations"],
        channel: "email",
        trigger: "on_workflow_completed",
        subjectTemplate: "Aanvraag {{ aanvraagnummer }}",
        messageTemplate: "De aanvraag {{ aanvraagnummer }} is verwerkt.",
        templateVariables: ["aanvraagnummer"],
      },
    }).valid).toBe(true);
    expect(blockRegistry.contracts.validateNode({
      blockType: "notification",
      contractVersion: 1,
      configuration: {
        recipientRoleIds: ["aanvrager"],
        channel: "webhook",
        trigger: "on_reached",
        subjectTemplate: "Update",
        messageTemplate: "Update",
        templateVariables: [],
        webhookUrl: "https://example.test/hook",
      },
    }).valid).toBe(false);

    const invalid = blockRegistry.contracts.validateNode({
      blockType: "change_request",
      contractVersion: 1,
      configuration: {
        resourceId: "portfolio configuration; DROP TABLE clients",
        operation: "DELETE",
        attributeMappings: [],
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
        "attributeMappings",
        "effectiveDateVariable",
      ]);
    }
  });
});
