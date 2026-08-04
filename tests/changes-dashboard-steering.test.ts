import { describe, expect, it, vi } from "vitest";
import { computeSlaStatus, normalizeWorkflowStatus } from "@/lib/types";

describe("changes dashboard steering helpers", () => {
  it("groups approved changes into the accepted workflow phase", () => {
    expect(normalizeWorkflowStatus("approved")).toBe("accepted");
    expect(normalizeWorkflowStatus("accepted")).toBe("accepted");
  });

  it("computes live elapsed days for open changes instead of using cached zeroes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00Z"));

    const result = computeSlaStatus(
      "2026-08-01T12:00:00Z",
      1,
      "approved",
    );

    expect(result.daysOpen).toBe(3);
    expect(result.slaDays).toBe(7);
    expect(result.slaStatus).toBe("ok");

    vi.useRealTimers();
  });
});
