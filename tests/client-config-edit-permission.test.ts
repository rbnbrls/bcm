/**
 * Unit tests for the /admin/client-config edit-permission rule.
 *
 * The edit trigger in the client-config table renders only for rows the
 * operator is allowed to edit. Without a user/role layer the permission is
 * data-driven: only ACTIVE rows (the operative configuration line) are
 * editable; inactive rows are closed-out history and must not be edited.
 */
import { describe, it, expect } from "vitest";
import { canEditClientConfigRow } from "@/lib/client-config-edit-permission";

describe("canEditClientConfigRow", () => {
  it("returns true for an active row", () => {
    expect(canEditClientConfigRow({ activeInd: true })).toBe(true);
  });

  it("returns false for an inactive (closed-out) row", () => {
    expect(canEditClientConfigRow({ activeInd: false })).toBe(false);
  });

  it("only depends on activeInd — other row fields are ignored", () => {
    expect(
      canEditClientConfigRow({
        activeInd: true,
        // The helper accepts any object with activeInd; extra fields are
        // irrelevant to the permission decision.
        primaryAccountId: "HOR*EQACX*ROB",
      } as { activeInd: boolean }),
    ).toBe(true);
  });
});
