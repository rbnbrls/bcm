export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Warn at startup when a Workflow Studio flag is missing or malformed in
    // production, so a misconfigured deployment can never fail closed silently
    // (see #577: flags absent from the Coolify env hid the whole feature).
    if (process.env.NODE_ENV === "production") {
      const [{ FEATURE_FLAG_ENV, misconfiguredFeatureFlags }] = await Promise.all([
        import("./lib/feature-flags"),
      ]);
      const misconfigured = misconfiguredFeatureFlags();
      if (misconfigured.length > 0) {
        const names = misconfigured.map((flag) => FEATURE_FLAG_ENV[flag]).join(", ");
        console.warn(
          `[feature-flags] Workflow Studio flags unset or malformed (fail closed): ${names}. ` +
            "Set the flags explicitly (e.g. BCM_FEATURE_WORKFLOW_STUDIO_BUILDER=true) to enable the feature.",
        );
      }
    }
  }
}
