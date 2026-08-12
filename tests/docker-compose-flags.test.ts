import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for #577: the production Coolify deployment ran with
 * /docker-compose.yaml, which did not declare the Workflow Studio feature flags,
 * so BCM_FEATURE_WORKFLOW_STUDIO_BUILDER/_PUBLISH were absent from the container
 * environment and lib/feature-flags.ts failed closed — the Studio was hidden and
 * every /workflow-studio* route redirected to /.
 *
 * Regression guard for #579: even with the flags on, production had no identity
 * issuance (BCM_ENABLE_IDENTITY_SWITCHER unset), so every user was anonymous,
 * workflow:view was never granted and the proxy still 307'd the Studio. Both
 * compose files must therefore also default the identity switcher on and
 * declare BCM_SESSION_SECRET.
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

/** Extracts { identityEnv: default } pairs (BCM_ENABLE/BCM_IDENTITY_*) from the app environment. */
function extractIdentityDefaults(composeFile: string): Record<string, string> {
  const source = readFileSync(composeFile, "utf8");
  const pattern = /^\s*(BCM_(?:ENABLE|DISABLE)_IDENTITY_SWITCHER|BCM_IDENTITY_[A-Z_]+):\s*\$\{[A-Z0-9_]+:-(.+?)\}\s*$/gm;
  const defaults: Record<string, string> = {};
  for (const match of source.matchAll(pattern)) {
    defaults[match[1]] = match[2];
  }
  return defaults;
}

/** Whether the compose file declares BCM_SESSION_SECRET in the app environment. */
function declaresSessionSecret(composeFile: string): boolean {
  const source = readFileSync(composeFile, "utf8");
  return /^\s*BCM_SESSION_SECRET:\s*\$\{BCM_SESSION_SECRET\}\s*$/m.test(source);
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

  it("defaults the identity switcher on in both compose files (#579)", () => {
    for (const file of COMPOSE_FILES) {
      const identity = extractIdentityDefaults(file);
      expect(identity["BCM_ENABLE_IDENTITY_SWITCHER"], file).toBe("true");
      expect(identity["BCM_DISABLE_IDENTITY_SWITCHER"], file).toBe("false");
      // Default identity must hold workflow:view (lib/rbac-config.ts change_manager)
      expect(identity["BCM_IDENTITY_GROUPS"], file).toContain("bcm:role:change_manager");
    }
  });

  it("keeps the identity defaults in parity across both compose files", () => {
    expect(extractIdentityDefaults("docker-compose.yml")).toEqual(
      extractIdentityDefaults("docker-compose.coolify.yaml"),
    );
  });

  it("declares BCM_SESSION_SECRET in both compose files (required in production-mode containers)", () => {
    for (const file of COMPOSE_FILES) {
      expect(declaresSessionSecret(file), file).toBe(true);
    }
  });
});
