/**
 * Fallback-mode tests for the client_onboarding_staging CRUD helpers.
 *
 * When no DATABASE_URL is configured, lib/db.ts exports `sql = null` and the
 * helpers must behave predictably:
 *  - read helpers fall back (null / []) so the UI can still render,
 *  - write helpers throw Error("Database not available").
 *
 * These tests run against the real (unmocked) @/lib/db module and are skipped
 * automatically when DATABASE_URL is set (e.g. in a local dev environment).
 */
import { describe, it, expect } from "vitest";

import {
  saveClientOnboardingStaging,
  getClientOnboardingStagingByStagingId,
  getClientOnboardingStagingByClientCode,
  updateClientOnboardingStaging,
  deleteClientOnboardingStaging,
} from "@/lib/onboarding-staging-db";

const dbUrl = process.env.DATABASE_URL;

const VALID_INPUT = {
  changeRequestId: "11111111-2222-4333-8444-555555555555",
  clientCode: "ADP",
  clientName: "ADP Pensioenfonds",
  portfolioCode: "ADP",
  parentAccountCode: null,
  assetClassCode: "FI",
  subAssetClassCode: "HYG",
  managerCode: "ROB",
  benchmarkCode: "MSCI-WORLD",
  npcClassificationId: 3,
  longName: "ADP Pensioenfonds Hybride",
  shortName: "ADP",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
};

describe.skipIf(!!dbUrl)("onboarding-staging-db — no database (fallback mode)", () => {
  it("getClientOnboardingStagingByStagingId returns null when no DATABASE_URL", async () => {
    await expect(getClientOnboardingStagingByStagingId(42)).resolves.toBeNull();
  });

  it("getClientOnboardingStagingByClientCode returns [] when no DATABASE_URL", async () => {
    await expect(
      getClientOnboardingStagingByClientCode("ADP"),
    ).resolves.toEqual([]);
    await expect(
      getClientOnboardingStagingByClientCode("ADP", { status: "pending" }),
    ).resolves.toEqual([]);
  });

  it("saveClientOnboardingStaging throws when no DATABASE_URL", async () => {
    await expect(saveClientOnboardingStaging(VALID_INPUT)).rejects.toThrow(
      "Database not available",
    );
  });

  it("updateClientOnboardingStaging throws when no DATABASE_URL", async () => {
    await expect(
      updateClientOnboardingStaging(42, { status: "applied" }),
    ).rejects.toThrow("Database not available");
  });

  it("deleteClientOnboardingStaging throws when no DATABASE_URL", async () => {
    await expect(deleteClientOnboardingStaging(42)).rejects.toThrow(
      "Database not available",
    );
  });
});
