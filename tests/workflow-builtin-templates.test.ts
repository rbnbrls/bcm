import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import { blockRegistry } from "@/lib/workflow-studio/block-registry";
import { clientConfigDataCatalog } from "@/lib/workflow-studio/data-catalog";
import {
  BUILTIN_WORKFLOW_TEMPLATE_IDS,
  buildBuiltinWorkflowTemplateDraft,
} from "@/lib/workflow-studio/builtin-workflow-templates";
import { WorkflowValidator } from "@/lib/workflow-studio/workflow-validator";

const identity: IdentityContext = {
  userId: "template-test",
  displayName: "Template Test",
  groups: ["bcm:role:change_manager"],
  tenant: "tenant-a",
  businessUnit: "investments",
  sessionId: "template-session",
};

function validator() {
  const catalog = new Map();
  for (const entry of blockRegistry.listForIdentity(identity)) {
    const resolved = blockRegistry.contracts.resolve({ blockType: entry.blockType, contractVersion: entry.contractVersion });
    if (resolved.valid) catalog.set(entry.blockType, resolved.value);
  }
  return new WorkflowValidator(catalog, clientConfigDataCatalog);
}

describe("ingebouwde Workflow Studio-templates", () => {
  for (const templateId of BUILTIN_WORKFLOW_TEMPLATE_IDS) {
    it(`${templateId} levert een publiceerbare, onafhankelijke graph`, () => {
      const first = buildBuiltinWorkflowTemplateDraft(templateId, identity, {
        tenant: "tenant-a", businessUnit: "investments",
      });
      const second = buildBuiltinWorkflowTemplateDraft(templateId, identity, {
        tenant: "tenant-a", businessUnit: "investments",
      });
      expect(first.nodes.map((node) => node.nodeKey)).toEqual(second.nodes.map((node) => node.nodeKey));
      expect(first.nodes.map((node) => node.id)).not.toEqual(second.nodes.map((node) => node.id));
      expect(first.nodes.some((node) => node.block.blockType === "form")).toBe(true);
      expect(first.nodes.some((node) => node.block.blockType === "approval")).toBe(true);
      const validation = validator().validate({
        identity,
        nodes: first.nodes,
        edges: first.edges,
        roleBindings: first.roleBindings,
      });
      expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });
  }

  it("benchmarkwissel bevat lookup, IST/SOLL-mutatie en kostenmetadata", () => {
    const draft = buildBuiltinWorkflowTemplateDraft("benchmark_switch", identity, {
      tenant: "tenant-a", businessUnit: "investments",
    });
    expect(draft.nodes.some((node) => node.block.blockType === "client_config_lookup")).toBe(true);
    expect(draft.nodes.some((node) => node.block.blockType === "change_request")).toBe(true);
    expect(draft.costModel).toMatchObject({ perItemCost: 500, currency: "EUR" });
  });

  it("generieke veldwijziging gebruikt configureerbare IST- en SOLL-velden", () => {
    const draft = buildBuiltinWorkflowTemplateDraft("generic_field_change", identity, {
      tenant: "tenant-a", businessUnit: "investments",
    });
    const form = draft.nodes.find((node) => node.block.blockType === "form");
    expect(form?.configuration).toMatchObject({
      title: "Generieke veldwijziging",
      fields: expect.arrayContaining([
        expect.objectContaining({ id: "requested_value", label: "Nieuwe waarde (SOLL)" }),
        expect.objectContaining({ id: "resource_reference", label: "Objectreferentie" }),
      ]),
    });
  });
});
