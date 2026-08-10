import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_ENV, getFeatureFlagSnapshot, isFeatureEnabled } from "@/lib/feature-flags";

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
    });

    expect(flags).toEqual({
      "workflow_studio.builder": true,
      "workflow_studio.publish": false,
      "workflow_runtime.start": true,
    });
    expect(Object.isFrozen(flags)).toBe(true);
  });
});
