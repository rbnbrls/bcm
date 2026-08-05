// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApprovalPanel } from "@/components/approval-panel";
import { ACTIVE_ROLE_COOKIE, type RoleId } from "@/lib/rbac";

vi.mock("@/app/actions/approval-actions", () => ({
  approveChange: vi.fn().mockResolvedValue({ success: true, message: "Change request goedgekeurd." }),
  rejectChange: vi.fn().mockResolvedValue({ success: true, message: "Change request afgewezen." }),
}));

function setActiveRole(role: RoleId) {
  document.cookie = `${ACTIVE_ROLE_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = `${ACTIVE_ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/`;
}

describe("ApprovalPanel", () => {
  beforeEach(() => {
    document.cookie = `${ACTIVE_ROLE_COOKIE}=; Path=/; Max-Age=0`;
  });

  it.each([
    ["change_manager", "Chris Change"],
    ["account_manager", "Arjan Accountmanager"],
    ["admin", "Bert Beheerder"],
  ] as const)("prefills the approver field for the %s profile", (role, fullName) => {
    setActiveRole(role);

    render(<ApprovalPanel changeRequestId="11111111-1111-1111-1111-111111111111" />);
    fireEvent.click(screen.getByRole("button", { name: /change accorderen/i }));

    expect((screen.getByLabelText("Naam accordeur") as HTMLInputElement).value).toBe(fullName);
  });

  it("prefills the rejecter field from the active profile", () => {
    setActiveRole("account_manager");

    render(<ApprovalPanel changeRequestId="11111111-1111-1111-1111-111111111111" />);
    fireEvent.click(screen.getByRole("button", { name: /change afwijzen/i }));

    expect((screen.getByLabelText("Naam afwijzer") as HTMLInputElement).value).toBe("Arjan Accountmanager");
  });

  it("explains and blocks final submission when the active profile cannot approve", () => {
    setActiveRole("change_manager");

    render(<ApprovalPanel changeRequestId="11111111-1111-1111-1111-111111111111" />);
    expect(screen.getByText("Actief profiel: Change manager")).toBeTruthy();
    expect(screen.getByText(/Alleen het profiel Account manager/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /change accorderen/i }));

    expect(screen.getByRole("button", { name: /bevestig goedkeuring/i })).toHaveProperty("disabled", true);
  });

  it("allows final submission controls for the account manager profile", () => {
    setActiveRole("account_manager");

    render(<ApprovalPanel changeRequestId="11111111-1111-1111-1111-111111111111" />);
    expect(screen.getByText("Actief profiel: Account manager")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /change accorderen/i }));

    expect(screen.getByRole("button", { name: /bevestig goedkeuring/i })).toHaveProperty("disabled", false);
  });
});
