import { describe, expect, it } from "vitest";

import {
  isWorkflowRuntimeCutoverEnabled,
  workflowRuntimeVersionFlagName,
  workflowRuntimeWorkflowFlagName,
} from "@/lib/feature-flags";
import {
  decideWorkflowRuntimeCutover,
  evaluateWorkflowRuntimeCutoverHealth,
} from "@/lib/workflow-studio/runtime-cutover";

describe("workflow runtime cutover", () => {
  it("enables runtime per workflow definition or pinned version", () => {
    const target = { definitionId: "definition-1", versionId: "version-2" };

    expect(isWorkflowRuntimeCutoverEnabled(target, {})).toBe(false);
    expect(isWorkflowRuntimeCutoverEnabled(target, {
      [workflowRuntimeWorkflowFlagName("definition-1")]: "true",
    })).toBe(true);
    expect(isWorkflowRuntimeCutoverEnabled(target, {
      [workflowRuntimeVersionFlagName("version-2")]: "1",
    })).toBe(true);
  });

  it("keeps rollback fast by falling back to classic when either flag boundary is closed", () => {
    const target = { definitionId: "definition-1", versionId: "version-2" };

    expect(decideWorkflowRuntimeCutover(target, {
      globalRuntimeStartEnabled: false,
      environment: { [workflowRuntimeWorkflowFlagName("definition-1")]: "true" },
    })).toMatchObject({ mode: "classic", reason: "global_disabled", rollbackAvailable: false });

    expect(decideWorkflowRuntimeCutover(target, {
      globalRuntimeStartEnabled: true,
      environment: {},
    })).toMatchObject({ mode: "classic", reason: "workflow_disabled", rollbackAvailable: false });

    expect(decideWorkflowRuntimeCutover(target, {
      globalRuntimeStartEnabled: true,
      environment: { [workflowRuntimeWorkflowFlagName("definition-1")]: "true" },
    })).toMatchObject({ mode: "runtime", reason: "enabled", rollbackAvailable: true });
  });

  it("recommends rollback when runtime failure percentage crosses the threshold", () => {
    expect(evaluateWorkflowRuntimeCutoverHealth({
      started: 100,
      failed: 2,
      needsIntervention: 2,
      failureRateThreshold: 0.05,
    })).toMatchObject({ status: "healthy", failureRate: 0.04 });

    expect(evaluateWorkflowRuntimeCutoverHealth({
      started: 100,
      failed: 3,
      needsIntervention: 4,
      failureRateThreshold: 0.05,
    })).toMatchObject({ status: "rollback_recommended", failureRate: 0.07 });
  });
});
