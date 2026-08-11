export const FEATURE_FLAG_ENV = Object.freeze({
  "workflow_studio.builder": "BCM_FEATURE_WORKFLOW_STUDIO_BUILDER",
  "workflow_studio.publish": "BCM_FEATURE_WORKFLOW_STUDIO_PUBLISH",
  "workflow_runtime.start": "BCM_FEATURE_WORKFLOW_RUNTIME_START",
  "workflow_runtime.shadow_compare": "BCM_FEATURE_WORKFLOW_RUNTIME_SHADOW_COMPARE",
} as const);

export type FeatureFlag = keyof typeof FEATURE_FLAG_ENV;
export type FeatureFlagSnapshot = Readonly<Record<FeatureFlag, boolean>>;

type FeatureFlagEnvironment = Readonly<Record<string, string | undefined>>;

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

/** Reads one server-owned feature flag. Missing and malformed values fail closed. */
export function isFeatureEnabled(
  flag: FeatureFlag,
  environment: FeatureFlagEnvironment = process.env,
): boolean {
  const value = environment[FEATURE_FLAG_ENV[flag]];
  return value !== undefined && ENABLED_VALUES.has(value.trim().toLowerCase());
}

/**
 * Flags whose environment variable is unset or holds a value that is neither an
 * explicit enable nor an explicit disable (e.g. a typo like "enabled").
 * Deliberate opt-outs (`false`, `0`, `off`, `no`) are NOT reported.
 * Used for a startup warning so a missing flag can never fail closed silently.
 */
export function misconfiguredFeatureFlags(
  environment: FeatureFlagEnvironment = process.env,
): FeatureFlag[] {
  return (Object.keys(FEATURE_FLAG_ENV) as FeatureFlag[]).filter((flag) => {
    const value = environment[FEATURE_FLAG_ENV[flag]];
    if (value === undefined) return true;
    const normalized = value.trim().toLowerCase();
    return !ENABLED_VALUES.has(normalized) && !DISABLED_VALUES.has(normalized);
  });
}

function flagFragment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function workflowRuntimeWorkflowFlagName(definitionId: string): string {
  return `BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_${flagFragment(definitionId)}`;
}

export function workflowRuntimeVersionFlagName(versionId: string): string {
  return `BCM_FEATURE_WORKFLOW_RUNTIME_VERSION_${flagFragment(versionId)}`;
}

export function isWorkflowRuntimeCutoverEnabled(
  target: Readonly<{ definitionId: string; versionId: string }>,
  environment: FeatureFlagEnvironment = process.env,
): boolean {
  return (
    ENABLED_VALUES.has((environment[workflowRuntimeWorkflowFlagName(target.definitionId)] ?? "").trim().toLowerCase())
    || ENABLED_VALUES.has((environment[workflowRuntimeVersionFlagName(target.versionId)] ?? "").trim().toLowerCase())
  );
}

export function getFeatureFlagSnapshot(
  environment: FeatureFlagEnvironment = process.env,
): FeatureFlagSnapshot {
  return Object.freeze({
    "workflow_studio.builder": isFeatureEnabled("workflow_studio.builder", environment),
    "workflow_studio.publish": isFeatureEnabled("workflow_studio.publish", environment),
    "workflow_runtime.start": isFeatureEnabled("workflow_runtime.start", environment),
    "workflow_runtime.shadow_compare": isFeatureEnabled("workflow_runtime.shadow_compare", environment),
  });
}
