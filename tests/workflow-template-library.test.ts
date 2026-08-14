import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import { blockRegistry } from "@/lib/workflow-studio/block-registry";
import { clientConfigDataCatalog } from "@/lib/workflow-studio/data-catalog";
import {
  findWorkflowTemplateUpgradeCandidates,
  instantiateWorkflowTemplateLibraryEntry,
  listWorkflowTemplateLibraryEntries,
} from "@/lib/workflow-studio/template-library";
import { WorkflowValidator } from "@/lib/workflow-studio/workflow-validator";

const identity: IdentityContext = {
  userId: "library-test",
  displayName: "Library Test",
  groups: ["bcm:role:change_manager"],
  tenant: "tenant-a",
  businessUnit: "investments",
  sessionId: "library-session",
};

function validator() {
  const catalog = new Map();
  for (const entry of blockRegistry.listForIdentity(identity)) {
    const resolved = blockRegistry.contracts.resolve({ blockType: entry.blockType, contractVersion: entry.contractVersion });
    if (resolved.valid) catalog.set(entry.blockType, resolved.value);
  }
  return new WorkflowValidator(catalog, clientConfigDataCatalog);
}

describe("workflow template library", () => {
  it("lists curated templates and fragments with owner, tags, sample data and ratings", () => {
    const entries = listWorkflowTemplateLibraryEntries();

    expect(entries.map((entry) => entry.id)).toEqual([
      "risk_gate_fragment.v1",
      "risk_gate_fragment.v2",
      "benchmark_switch.v1",
      "generic_field_change.v1",
      "manager_switch.v1",
      "portfolio_configuration_create.v1",
      "sub_asset_class_switch.v1",
    ]);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "benchmark_switch.v1",
        kind: "template",
        ownerUserId: "workflow-library",
        tags: expect.arrayContaining(["benchmark"]),
        sampleData: expect.objectContaining({ currentBenchmark: "MSCI World" }),
        rating: { score: 4.8, count: 12 },
      }),
      expect.objectContaining({
        id: "risk_gate_fragment.v2",
        kind: "fragment",
        tags: expect.arrayContaining(["multi-approval-ready"]),
      }),
    ]));
  });

  it("filters library entries by kind and tags", () => {
    expect(listWorkflowTemplateLibraryEntries({ kind: "fragment", tags: ["risk"] }).map((entry) => entry.id)).toEqual([
      "risk_gate_fragment.v1",
      "risk_gate_fragment.v2",
    ]);
  });

  it("instantiates built-in templates without losing library source metadata", () => {
    const result = instantiateWorkflowTemplateLibraryEntry("benchmark_switch.v1", identity, {
      tenant: "tenant-a",
      businessUnit: "investments",
    }, {
      name: "Benchmarkwissel klant A",
      slug: "benchmarkwissel_klant_a",
    });

    expect(result).toMatchObject({
      source: {
        libraryEntryId: "benchmark_switch.v1",
        libraryEntryVersion: 1,
        source: { kind: "builtin", id: "benchmark_switch" },
      },
      draft: {
        name: "Benchmarkwissel klant A",
        slug: "benchmarkwissel_klant_a",
        tags: expect.arrayContaining(["template", "benchmark", "library:benchmark_switch.v1", "library-version:1"]),
        catalogDescription: expect.stringContaining("Bibliotheekbron: benchmark_switch.v1@1."),
      },
    });
    expect(result?.draft.nodes.some((node) => node.block.blockType === "change_request")).toBe(true);
  });

  it("instantiates a publishable fragment workflow", () => {
    const result = instantiateWorkflowTemplateLibraryEntry("risk_gate_fragment.v2", identity, {
      tenant: "tenant-a",
      businessUnit: "investments",
    });
    if (!result) throw new Error("Fragment ontbreekt.");

    const validation = validator().validate({
      identity,
      nodes: result.draft.nodes,
      edges: result.draft.edges,
      roleBindings: result.draft.roleBindings,
    });

    expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.draft.tags).toEqual(expect.arrayContaining(["fragment", "risk", "library:risk_gate_fragment.v2"]));
    expect(result.draft.nodes.find((node) => node.nodeKey === "risk_approval")?.configuration).toMatchObject({
      inputVariables: ["request_name", "risk_level"],
    });
  });

  it("offers upgrade candidates for older fragment versions", () => {
    expect(findWorkflowTemplateUpgradeCandidates("risk_gate_fragment.v1")).toEqual([
      {
        currentEntryId: "risk_gate_fragment.v1",
        currentVersion: 1,
        nextEntryId: "risk_gate_fragment.v2",
        nextVersion: 2,
        title: "Risico-goedkeuringsfragment",
        tags: ["fragment", "approval", "risk", "multi-approval-ready"],
      },
    ]);
    expect(findWorkflowTemplateUpgradeCandidates("risk_gate_fragment.v2")).toEqual([]);
  });
});
