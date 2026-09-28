const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

type IdentitySwitcherEnvironment = Readonly<Record<string, string | undefined>>;

function enabled(value: string | undefined): boolean {
  return value !== undefined && ENABLED_VALUES.has(value.trim().toLowerCase());
}

export function isIdentitySwitcherEnabled(environment: IdentitySwitcherEnvironment = process.env): boolean {
  if (enabled(environment.BCM_DISABLE_IDENTITY_SWITCHER)) return false;
  return environment.NODE_ENV !== "production" || enabled(environment.BCM_ENABLE_IDENTITY_SWITCHER);
}
