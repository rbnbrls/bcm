import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAG_ENV,
  getFeatureFlagSnapshot,
  isFeatureEnabled,
  misconfiguredFeatureFlags,
} from "@/lib/feature-flags";

describe("Workflow Studio feature flags", () => {
  it("fails closed when flags are missing or malformed", () => {
    expect(isFeatureEnabled("workflow_studio.builder", {})).toBe(false);
    expect(isFeatureEnabled("workflow_studio.builder", {
      [FEATURE_FLAG_ENV["workflow_studio.builder"]]: "enabled",
    })).toBe(false);
  });

  it.each(["true", "TRUE", "1", "yes", "on"])("accepts %s as enabled", (value) => {
    expect(isFeatureEnabled("workflow_studio.builder", {
      [FEATURE_FLAG_ENV["workflow_studio.builder"]]: value,
    })).toBe(true);
  });

  it("switches builder, publishing and runtime independently", () => {
    const flags = getFeatureFlagSnapshot({
      BCM_FEATURE_WORKFLOW_STUDIO_BUILDER: "true",
      BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH: "false",
      BCM_FEATURE_WORKFLOW_RUNTIME_START: "true",
      BCM_FEATURE_WORKFLOW_RUNTIME_SHADOW_COMPARE: "yes",
    });

    expect(flags).toEqual({
      "workflow_studio.builder": true,
      "workflow_studio.publish": false,
      "workflow_runtime.start": true,
      "workflow_runtime.shadow_compare": true,
    });
    expect(Object.isFrozen(flags)).toBe(true);
  });
});

describe("misconfiguredFeatureFlags", () => {
  it("reports every flag whose env var is missing entirely", () => {
    expect(misconfiguredFeatureFlags({})).toEqual([
      "workflow_studio.builder",
      "workflow_studio.publish",
      "workflow_runtime.start",
      "workflow_runtime.shadow_compare",
    ]);
  });

  it("reports only the flags that are unset or malformed", () => {
    const flags = misconfiguredFeatureFlags({
      BCM_FEATURE_WORKFLOW_STUDIO_BUILDER: "true",
      BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH: "enabled", // typo: fails closed, should be flagged
      BCM_FEATURE_WORKFLOW_RUNTIME_START: "false", // explicit opt-out: not flagged
      BCM_FEATURE_WORKFLOW_RUNTIME_SHADOW_COMPARE: undefined,
    });
    expect(flags).toEqual(["workflow_studio.publish", "workflow_runtime.shadow_compare"]);
  });

  it("reports nothing when every flag is explicitly enabled or disabled", () => {
    expect(
      misconfiguredFeatureFlags({
        BCM_FEATURE_WORKFLOW_STUDIO_BUILDER: "true",
        BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH: "FALSE",
        BCM_FEATURE_WORKFLOW_RUNTIME_START: "off",
        BCM_FEATURE_WORKFLOW_RUNTIME_SHADOW_COMPARE: "0",
      }),
    ).toEqual([]);
  });
});
