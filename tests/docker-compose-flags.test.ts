import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for #577: the production Coolify deployment ran with
 * /docker-compose.yaml, which did not declare the Workflow Studio feature flags,
 * so BCM_FEATURE_WORKFLOW_STUDIO_BUILDER/_PUBLISH were absent from the container
 * environment and lib/feature-flags.ts failed closed — the Studio was hidden and
 * every /workflow-studio* route redirected to /.
 *
 * Both compose files must declare the same flags with the same defaults so every
 * deployment path (local `docker compose up`, docker-compose.coolify.yaml, and
 * the Coolify-managed /docker-compose.yaml) gets the Studio unless explicitly
 * disabled.
 */

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.coolify.yaml"] as const;

/** Extracts { flagName: default } pairs from a compose file's app environment. */
function extractFeatureFlagDefaults(composeFile: string): Record<string, string> {
  const source = readFileSync(composeFile, "utf8");
  const pattern = /^\s*(BCM_FEATURE_[A-Z0-9_]+):\s*\$\{BCM_FEATURE_[A-Z0-9_]+:-(true|false)\}\s*$/gm;
  const defaults: Record<string, string> = {};
  for (const match of source.matchAll(pattern)) {
    defaults[match[1]] = match[2];
  }
  return defaults;
}

describe("Workflow Studio feature flags in docker-compose files", () => {
  const perFile = Object.fromEntries(
    COMPOSE_FILES.map((file) => [file, extractFeatureFlagDefaults(file)]),
  );

  it("declares the flags in docker-compose.yml (the file Coolify deploys)", () => {
    expect(perFile["docker-compose.yml"]).not.toEqual({});
    expect(Object.keys(perFile["docker-compose.yml"]).sort()).toEqual(
      [
        "BCM_FEATURE_WORKFLOW_RUNTIME_SHADOW_COMPARE",
        "BCM_FEATURE_WORKFLOW_RUNTIME_START",
        "BCM_FEATURE_WORKFLOW_STUDIO_BUILDER",
        "BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH",
      ].sort(),
    );
  });

  it("keeps docker-compose.yml in parity with docker-compose.coolify.yaml", () => {
    expect(perFile["docker-compose.yml"]).toEqual(perFile["docker-compose.coolify.yaml"]);
  });

  it("defaults the Workflow Studio builder and publish flags to true", () => {
    for (const file of COMPOSE_FILES) {
      expect(perFile[file]["BCM_FEATURE_WORKFLOW_STUDIO_BUILDER"], file).toBe("true");
      expect(perFile[file]["BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH"], file).toBe("true");
    }
  });

  it("keeps the runtime rollout flags opted out by default", () => {
    for (const file of COMPOSE_FILES) {
      expect(perFile[file]["BCM_FEATURE_WORKFLOW_RUNTIME_START"], file).toBe("false");
      expect(perFile[file]["BCM_FEATURE_WORKFLOW_RUNTIME_SHADOW_COMPARE"], file).toBe("false");
    }
  });
});
