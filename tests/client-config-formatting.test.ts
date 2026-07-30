/**
 * Tests for client-config-table conditional formatting.
 *
 * These tests verify the asset class color coding, status indicators,
 * and other conditional formatting applied to the admin client-config table.
 *
 * @module tests/client-config-formatting
 */
import { describe, it, expect } from "vitest";
import {
  getAssetClassColor,
  getAssetClassLabel,
  getNpcClassificationColor,
  getNpcClassificationLabel,
  getActiveBadgeClass,
  getActiveLabel,
} from "@/lib/client-config-formatting";

// ═════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════

describe("getAssetClassColor", () => {
  it("returns green for CS (Cash)", () => {
    expect(getAssetClassColor("CS")).toBe("var(--ac-cash, #22c55e)");
  });

  it("returns blue for EQ (Equities)", () => {
    expect(getAssetClassColor("EQ")).toBe("var(--ac-equities, #3b82f6)");
  });

  it("returns amber for FI (Fixed Income)", () => {
    expect(getAssetClassColor("FI")).toBe("var(--ac-fixed-income, #f59e0b)");
  });

  it("returns purple for RA (Real Assets)", () => {
    expect(getAssetClassColor("RA")).toBe("var(--ac-real-assets, #8b5cf6)");
  });

  it("returns pink for AL (Alternatives)", () => {
    expect(getAssetClassColor("AL")).toBe("var(--ac-alternatives, #ec4899)");
  });

  it("returns cyan for MA (Multi Assets)", () => {
    expect(getAssetClassColor("MA")).toBe("var(--ac-multi-assets, #06b6d4)");
  });

  it("returns orange for OV (Overlay)", () => {
    expect(getAssetClassColor("OV")).toBe("var(--ac-overlay, #f97316)");
  });

  it("returns emerald for IM (Impact)", () => {
    expect(getAssetClassColor("IM")).toBe("var(--ac-impact, #10b981)");
  });

  it("returns fallback gray for unknown code", () => {
    expect(getAssetClassColor("XX")).toBe("var(--ac-default, #6b7280)");
  });

  it("returns fallback gray for empty string", () => {
    expect(getAssetClassColor("")).toBe("var(--ac-default, #6b7280)");
  });
});

describe("getAssetClassLabel", () => {
  it("returns 'Cash' for CS", () => {
    expect(getAssetClassLabel("CS")).toBe("Cash");
  });

  it("returns 'Equities' for EQ", () => {
    expect(getAssetClassLabel("EQ")).toBe("Equities");
  });

  it("returns 'Fixed Income' for FI", () => {
    expect(getAssetClassLabel("FI")).toBe("Fixed Income");
  });

  it("returns the code itself for unknown codes", () => {
    expect(getAssetClassLabel("XX")).toBe("XX");
  });
});

describe("getNpcClassificationColor", () => {
  it("returns blue for Match (ID 1)", () => {
    expect(getNpcClassificationColor(1)).toBe("var(--npc-match, #3b82f6)");
  });

  it("returns green for Return (ID 2)", () => {
    expect(getNpcClassificationColor(2)).toBe("var(--npc-return, #22c55e)");
  });

  it("returns amber for Opbouw (ID 3)", () => {
    expect(getNpcClassificationColor(3)).toBe("var(--npc-opbouw, #f59e0b)");
  });

  it("returns gray for unknown NPC ID", () => {
    expect(getNpcClassificationColor(99)).toBe("var(--npc-default, #6b7280)");
  });
});

describe("getNpcClassificationLabel", () => {
  it("returns 'Match' for ID 1", () => {
    expect(getNpcClassificationLabel(1)).toBe("Match");
  });

  it("returns 'Return' for ID 2", () => {
    expect(getNpcClassificationLabel(2)).toBe("Return");
  });

  it("returns 'Opbouw' for ID 3", () => {
    expect(getNpcClassificationLabel(3)).toBe("Opbouw");
  });

  it("returns fallback for unknown ID", () => {
    expect(getNpcClassificationLabel(99)).toBe("NPC #99");
  });
});

describe("getActiveBadgeClass", () => {
  it("returns 'status-badge active' for true", () => {
    expect(getActiveBadgeClass(true)).toBe("status-badge active");
  });

  it("returns 'status-badge inactive' for false", () => {
    expect(getActiveBadgeClass(false)).toBe("status-badge inactive");
  });
});

describe("getActiveLabel", () => {
  it("returns 'Actief' for true", () => {
    expect(getActiveLabel(true)).toBe("Actief");
  });

  it("returns 'Inactief' for false", () => {
    expect(getActiveLabel(false)).toBe("Inactief");
  });
});