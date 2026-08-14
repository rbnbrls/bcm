import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import {
  ClientConfigReadService,
  type ClientConfigReadSource,
} from "@/lib/workflow-studio/read-adapters";
import {
  ClientConfigMutationContractService,
  clientConfigMutationAdapterRegistry,
  type WorkflowChangeIntent,
} from "@/lib/workflow-studio/mutation-adapters";
import {
  clientConfigDataCatalog,
  DATA_CATALOG_OPERATIONS,
} from "@/lib/workflow-studio/data-catalog";

const scope = { tenant: "tenant-a", businessUnit: "investments", clientIds: ["HOR"] } as const;
const identity = (groups = ["bcm:role:change_manager", "bcm:client:HOR"]): IdentityContext => ({
  userId: "user-1",
  displayName: "Workflow Maker",
  groups,
  tenant: "tenant-a",
  businessUnit: "investments",
  sessionId: "session-1",
});

const source: ClientConfigReadSource = {
  async read(resourceId) {
    if (resourceId !== "portfolio_configuration") return [];
    return [{
      sourceRecordId: "HOR*EQDEV*ROB",
      scopeClientIds: ["HOR"],
      values: {
        primary_account_id: "HOR*EQDEV*ROB",
        client_code: "HOR",
        portfolio_code: "HORDEV",
        asset_class_code: "EQ",
        sub_asset_class_code: "DEV",
        manager_code: "ROB",
        benchmark_code: "MSCI WORLD",
        npc_classification_id: 1,
        long_name: "Horizon Developed Equity Robeco",
        short_name: "HOR Dev Eq",
        active: true,
        effective_from: "2026-01-01",
        effective_until: null,
      },
    }];
  },
};

const reads = new ClientConfigReadService(source);
const service = new ClientConfigMutationContractService(reads);

function createIntent(overrides: Partial<WorkflowChangeIntent> = {}): WorkflowChangeIntent {
  return {
    intentVersion: 1,
    resourceId: "asset_class",
    operation: "CREATE",
    values: { code: "PR", name: "Private markets" },
    preconditions: {},
    idempotencyKey: "instance-1:node-4:attempt-1",
    effectiveAt: "2026-09-01T00:00:00.000Z",
    rationale: "Nieuwe beheerste classificatie",
    ...overrides,
  };
}

describe("Workflow Studio mutation adapter contracts", () => {
  it("maps CREATE, UPDATE and RETIRE exclusively to existing governed stage/apply paths", () => {
    expect(clientConfigMutationAdapterRegistry.resolve("client", "CREATE")).toMatchObject({
      stageHandlerId: "stage_client_onboarding",
      applyStrategy: "staged_client_onboarding",
    });
    for (const resourceId of ["parent_account", "portfolio"]) {
      for (const operation of ["CREATE", "RETIRE"] as const) {
        expect(clientConfigMutationAdapterRegistry.resolve(resourceId, operation)).toMatchObject({
          stageHandlerId: "stage_change_portfolio_metadata",
          applyStrategy: "staged_metadata",
        });
      }
    }
    expect(clientConfigMutationAdapterRegistry.resolve("asset_class", "CREATE")).toMatchObject({
      stageHandlerId: "stage_change_lookup_request",
      applyStrategy: "staged_lookup",
    });
    for (const operation of ["CREATE", "UPDATE", "RETIRE"] as const) {
      expect(clientConfigMutationAdapterRegistry.resolve("portfolio_configuration", operation)).toMatchObject({
        stageHandlerId: "stage_change_portfolio_configuration",
        applyStrategy: "staged_portfolio_configuration",
      });
    }
    expect(clientConfigMutationAdapterRegistry.resolve("manager", "CREATE")).toBeUndefined();
    expect(clientConfigMutationAdapterRegistry.list().every((adapter) => (
      !adapter.stageHandlerId.includes("sql") && !adapter.id.includes("table")
    ))).toBe(true);
  });

  it("registers a runtime adapter for every requestable catalog resource operation", () => {
    for (const resource of clientConfigDataCatalog.list()) {
      for (const operation of DATA_CATALOG_OPERATIONS) {
        const requestable = resource.attributes.some((attribute) => (
          attribute.requestableOperations.includes(operation)
        ));
        if (requestable) {
          expect(clientConfigMutationAdapterRegistry.resolve(resource.id, operation), `${resource.id}:${operation}`)
            .toBeDefined();
        }
      }
    }
  });

  it("dry-runs previously metadata-only resources through governed runtime adapters", async () => {
    await expect(service.dryRun({
      identity: identity(),
      scope,
      intent: createIntent({
        resourceId: "client",
        operation: "CREATE",
        values: {
          code: "NEW",
          name: "Nieuwe client",
          portfolio_code: "NEWPORT",
          parent_account_code: null,
          asset_class_code: "EQ",
          sub_asset_class_code: "DEV",
          manager_code: "ROB",
          benchmark_code: "MSCI WORLD",
          npc_classification_id: 1,
          long_name: "Nieuwe client developed equity",
          short_name: "NEW DEV EQ",
          effective_from: "2026-09-01",
          effective_until: null,
        },
      }),
    })).resolves.toMatchObject({
      status: "ready",
      stageHandlerId: "stage_client_onboarding",
      applyStrategy: "staged_client_onboarding",
    });

    await expect(service.dryRun({
      identity: identity(),
      scope,
      intent: createIntent({
        resourceId: "parent_account",
        operation: "CREATE",
        values: { code: "NEW_MAIN", msa_code: null },
      }),
    })).resolves.toMatchObject({
      status: "ready",
      stageHandlerId: "stage_change_portfolio_metadata",
      applyStrategy: "staged_metadata",
    });

    await expect(service.dryRun({
      identity: identity(),
      scope,
      intent: createIntent({
        resourceId: "portfolio",
        operation: "CREATE",
        values: { code: "NEWPORT", parent_account_code: "NEW_MAIN" },
      }),
    })).resolves.toMatchObject({
      status: "ready",
      stageHandlerId: "stage_change_portfolio_metadata",
      applyStrategy: "staged_metadata",
    });
  });

  it("returns a typed side-effect-free dry-run for a valid CREATE", async () => {
    await expect(service.dryRun({ identity: identity(), scope, intent: createIntent() })).resolves.toEqual({
      status: "ready",
      adapterId: "client-config.asset-class.create.v1",
      stageHandlerId: "stage_change_lookup_request",
      applyStrategy: "staged_lookup",
      issues: [],
    });
  });

  it("rejects free identifiers and non-requestable attributes", async () => {
    const result = await service.dryRun({
      identity: identity(),
      scope,
      intent: createIntent({ values: { code: "PR", table_name: "client_config.asset_class" } }),
    });
    expect(result.status).toBe("invalid");
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown_mutation_attribute", path: ["values", "table_name"] }),
    ]));
  });

  it("fails closed when identity permissions or scope are invalid", async () => {
    await expect(service.dryRun({ identity: identity([]), scope, intent: createIntent() }))
      .resolves.toMatchObject({ status: "invalid", issues: [{ code: "mutation_not_authorized" }] });
    await expect(service.dryRun({
      identity: identity(),
      scope: { ...scope, tenant: "tenant-b" },
      intent: createIntent(),
    })).resolves.toMatchObject({ status: "invalid", issues: [{ code: "mutation_not_authorized" }] });
  });

  it("requires a matching snapshot for UPDATE and RETIRE", async () => {
    const update = createIntent({
      resourceId: "portfolio_configuration",
      operation: "UPDATE",
      values: { benchmark_code: "NEW INDEX" },
    });
    await expect(service.dryRun({ identity: identity(), scope, intent: update }))
      .resolves.toMatchObject({ status: "invalid", issues: expect.arrayContaining([
        expect.objectContaining({ code: "snapshot_required" }),
      ]) });

    const wrongSnapshot = await reads.snapshot({
      identity: identity(), scope, resourceId: "portfolio_configuration", sourceRecordId: "HOR*EQDEV*ROB",
    });
    await expect(service.dryRun({
      identity: identity(), scope, intent: createIntent({ preconditions: { snapshot: wrongSnapshot } }),
    })).resolves.toMatchObject({ status: "invalid", issues: expect.arrayContaining([
      expect.objectContaining({ code: "snapshot_not_allowed" }),
      expect.objectContaining({ code: "snapshot_resource_mismatch" }),
    ]) });
  });

  it("detects concurrency and explicit IST conflicts before staging", async () => {
    const snapshot = await reads.snapshot({
      identity: identity(), scope, resourceId: "portfolio_configuration", sourceRecordId: "HOR*EQDEV*ROB",
    });
    const base = createIntent({
      resourceId: "portfolio_configuration",
      operation: "UPDATE",
      values: { benchmark_code: "NEW INDEX" },
      preconditions: { snapshot, expectedValues: { benchmark_code: "MSCI WORLD" } },
    });
    await expect(service.dryRun({ identity: identity(), scope, intent: base }))
      .resolves.toMatchObject({ status: "ready" });

    await expect(service.dryRun({
      identity: identity(),
      scope,
      intent: { ...base, preconditions: { snapshot: { ...snapshot, concurrencyToken: "sha256:stale" } } },
    })).resolves.toMatchObject({ status: "conflicted", issues: [expect.objectContaining({ code: "concurrency_conflict" })] });

    await expect(service.dryRun({
      identity: identity(),
      scope,
      intent: { ...base, preconditions: { snapshot, expectedValues: { benchmark_code: "OLD INDEX" } } },
    })).resolves.toMatchObject({ status: "conflicted", issues: [expect.objectContaining({ code: "precondition_failed" })] });
  });

  it("keeps non-requestable catalog operations closed", async () => {
    const result = await service.dryRun({
      identity: identity(),
      scope,
      intent: createIntent({
        resourceId: "manager",
        values: { code: "ABC", name: "Nieuwe manager" },
      }),
    });
    expect(result).toMatchObject({
      status: "invalid",
      issues: [expect.objectContaining({ code: "adapter_not_registered" })],
    });
  });
});
