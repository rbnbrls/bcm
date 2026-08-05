import { describe, expect, it } from "vitest";
import { applyStrategies } from "@/lib/apply-strategies";
import {
  getChangeTypePermission,
  getStatusFlowForChangeType,
  resolveChangeTypeRegistration,
} from "@/lib/change-type-registry";
import { CHANGE_STATUS_NEXT } from "@/lib/types";

describe("change type registry", () => {
  it("centralizes form, submit, detail, permissions, status flow and apply strategy", () => {
    const benchmark = resolveChangeTypeRegistration("benchmark_switch");

    expect(benchmark.formKind).toBe("generic");
    expect(benchmark.submitAction).toBe("benchmark_switch");
    expect(benchmark.detailRenderer).toBe("benchmark_switch");
    expect(benchmark.applyStrategy).toBe("ist_sync");
    expect(benchmark.permissions.create).toBe("changes:create");
    expect(benchmark.statusFlow.submitted).toBe("accepted");
  });

  it("keeps customer onboarding on the dedicated onboarding apply strategy", () => {
    const registration = resolveChangeTypeRegistration("customer_onboarding");

    expect(registration.applyStrategy).toBe("staged_client_onboarding");
    expect(applyStrategies[registration.applyStrategy]).toBeTypeOf("function");
  });

  it("exposes permission and status helpers for UI, actions and route guards", () => {
    expect(getChangeTypePermission("new_asset_class", "create")).toBe("changes:create");
    expect(getChangeTypePermission("portfolio_configuration_retire", "approve")).toBe("changes:approve");
    expect(getStatusFlowForChangeType("new_sub_asset_class")).toEqual(CHANGE_STATUS_NEXT);
  });
});

