import { isWorkflowRuntimeCutoverEnabled } from "@/lib/feature-flags";

export type WorkflowRuntimeCutoverMode = "runtime" | "classic";

export type WorkflowRuntimeCutoverDecision = Readonly<{
  mode: WorkflowRuntimeCutoverMode;
  definitionId: string;
  versionId: string;
  reason: "enabled" | "global_disabled" | "workflow_disabled";
  rollbackAvailable: boolean;
}>;

export type WorkflowRuntimeCutoverHealthInput = Readonly<{
  started: number;
  failed: number;
  needsIntervention: number;
  failureRateThreshold?: number;
}>;

export type WorkflowRuntimeCutoverHealth = Readonly<{
  status: "healthy" | "rollback_recommended";
  failureRate: number;
  failed: number;
  needsIntervention: number;
  started: number;
  threshold: number;
}>;

export function decideWorkflowRuntimeCutover(
  target: Readonly<{ definitionId: string; versionId: string }>,
  options: Readonly<{ globalRuntimeStartEnabled: boolean; environment?: Readonly<Record<string, string | undefined>> }>,
): WorkflowRuntimeCutoverDecision {
  if (!options.globalRuntimeStartEnabled) {
    return { ...target, mode: "classic", reason: "global_disabled", rollbackAvailable: false };
  }
  if (!isWorkflowRuntimeCutoverEnabled(target, options.environment)) {
    return { ...target, mode: "classic", reason: "workflow_disabled", rollbackAvailable: false };
  }
  return { ...target, mode: "runtime", reason: "enabled", rollbackAvailable: true };
}

export function evaluateWorkflowRuntimeCutoverHealth(input: WorkflowRuntimeCutoverHealthInput): WorkflowRuntimeCutoverHealth {
  const threshold = input.failureRateThreshold ?? 0.05;
  const failedTotal = input.failed + input.needsIntervention;
  const failureRate = input.started > 0 ? failedTotal / input.started : 0;
  return {
    status: failureRate > threshold ? "rollback_recommended" : "healthy",
    failureRate,
    failed: input.failed,
    needsIntervention: input.needsIntervention,
    started: input.started,
    threshold,
  };
}
