/**
 * Tests for backward-compatible change type slug resolution
 * (lib/change-type-resolution.ts).
 *
 * Covers:
 *  - isPortfolioCreateWizardSlug: which slugs render the create wizard
 *  - resolveChangeTypeSlugWithFallback: explicit lifecycle slug preferred,
 *    legacy portfolio_addition fallback when the slug isn't in the catalog
 */
import { describe, it, expect } from "vitest";
import {
  isPortfolioCreateWizardSlug,
  resolveChangeTypeSlugWithFallback,
  PORTFOLIO_CREATE_WIZARD_SLUGS,
  LEGACY_PORTFOLIO_SLUG,
} from "@/lib/change-type-resolution";

describe("isPortfolioCreateWizardSlug", () => {
  it("accepts the legacy portfolio_addition slug", () => {
    expect(isPortfolioCreateWizardSlug("portfolio_addition")).toBe(true);
  });

  it("accepts the explicit portfolio_configuration_create slug", () => {
    expect(isPortfolioCreateWizardSlug("portfolio_configuration_create")).toBe(true);
  });

  it("rejects update/retire and unrelated slugs", () => {
    expect(isPortfolioCreateWizardSlug("portfolio_configuration_update")).toBe(false);
    expect(isPortfolioCreateWizardSlug("portfolio_configuration_retire")).toBe(false);
    expect(isPortfolioCreateWizardSlug("benchmark_switch")).toBe(false);
  });

  it("rejects undefined and empty strings", () => {
    expect(isPortfolioCreateWizardSlug(undefined)).toBe(false);
    expect(isPortfolioCreateWizardSlug("")).toBe(false);
  });

  it("lists exactly the two create-wizard slugs", () => {
    expect([...PORTFOLIO_CREATE_WIZARD_SLUGS]).toEqual([
      "portfolio_addition",
      "portfolio_configuration_create",
    ]);
  });

  it("keeps the legacy slug constant stable", () => {
    expect(LEGACY_PORTFOLIO_SLUG).toBe("portfolio_addition");
  });
});

describe("resolveChangeTypeSlugWithFallback", () => {
  it("returns the legacy slug unchanged when it is the preferred slug", async () => {
    await expect(resolveChangeTypeSlugWithFallback("portfolio_addition")).resolves.toBe(
      "portfolio_addition",
    );
  });

  it("returns the explicit lifecycle slug when it exists in the catalog", async () => {
    // benchmark_switch is part of the default catalog; the helper is generic
    // and should keep any slug that resolves to a real config.
    await expect(resolveChangeTypeSlugWithFallback("benchmark_switch")).resolves.toBe(
      "benchmark_switch",
    );
  });

  it("falls back to portfolio_addition when the explicit slug is not in the catalog", async () => {
    // portfolio_configuration_update is NOT part of the default catalog yet
    // (seeded by the catalog migration), so resolution must fall back to the
    // legacy slug — the backward-compatibility path.
    await expect(resolveChangeTypeSlugWithFallback("portfolio_configuration_update")).resolves.toBe(
      "portfolio_addition",
    );
    await expect(resolveChangeTypeSlugWithFallback("portfolio_configuration_retire")).resolves.toBe(
      "portfolio_addition",
    );
  });

  it("honors a custom fallback slug", async () => {
    await expect(
      resolveChangeTypeSlugWithFallback("portfolio_configuration_update", "benchmark_switch"),
    ).resolves.toBe("benchmark_switch");
  });
});
