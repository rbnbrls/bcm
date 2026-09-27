import type { ChangeTypeConfig, StakeholderAssignment } from "@/lib/types";
import { computeEstimatedCost } from "@/lib/change-form-utils";

export function buildMandatoryStakeholderAssignments(
  config: ChangeTypeConfig,
): StakeholderAssignment[] {
  return config.stakeholders
    .filter((stakeholder) => stakeholder.mandatory)
    .map((stakeholder) => ({
      stakeholderId: stakeholder.id,
      contact: `${stakeholder.id}@bcm.example.com`,
      notifiedAt: null,
    }));
}

export function buildChangeTypeEstimate(config: ChangeTypeConfig, itemCount = 1) {
  const cost = computeEstimatedCost(config, itemCount);
  return {
    estimatedCost: cost.cost,
    estimatedCostCurrency: cost.currency,
    estimatedLeadDays: config.defaultLeadDays,
  };
}
