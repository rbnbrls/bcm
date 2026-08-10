export const FEATURE_FLAG_ENV = Object.freeze({
  "workflow_studio.builder": "BCM_FEATURE_WORKFLOW_STUDIO_BUILDER",
  "workflow_studio.publish": "BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH",
  "workflow_runtime.start": "BCM_FEATURE_WORKFLOW_RUNTIME_START",
} as const);

export type FeatureFlag = keyof typeof FEATURE_FLAG_ENV;
export type FeatureFlagSnapshot = Readonly<Record<FeatureFlag, boolean>>;

type FeatureFlagEnvironment = Readonly<Record<string, string | undefined>>;

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/** Reads one server-owned feature flag. Missing and malformed values fail closed. */
export function isFeatureEnabled(
  flag: FeatureFlag,
  environment: FeatureFlagEnvironment = process.env,
): boolean {
  const value = environment[FEATURE_FLAG_ENV[flag]];
  return value !== undefined && ENABLED_VALUES.has(value.trim().toLowerCase());
}

export function getFeatureFlagSnapshot(
  environment: FeatureFlagEnvironment = process.env,
): FeatureFlagSnapshot {
  return Object.freeze({
    "workflow_studio.builder": isFeatureEnabled("workflow_studio.builder", environment),
    "workflow_studio.publish": isFeatureEnabled("workflow_studio.publish", environment),
    "workflow_runtime.start": isFeatureEnabled("workflow_runtime.start", environment),
  });
}
