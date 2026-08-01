// @vitest-environment jsdom
/**
 * Component tests for ClientConfigTable retire action button.
 *
 * Verifies:
 *  - Each ACTIVE row shows an enabled "Beëindigen" (retire) button
 *  - Inactive rows show a DISABLED retire button
 *  - Clicking the retire button on an active row opens the retire modal
 *  - The modal renders requester, rationale, and effective-date fields
 *  - Submitting the modal calls deletePortfolioConfigurationAction with the
 *    target primaryAccountId (governed change request — no direct mutation)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ClientConfigTable from "@/app/admin/client-config/client-config-table";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

// Mock the server action used by the retire modal
vi.mock("@/app/admin/client-config/actions", () => ({
  deletePortfolioConfigurationAction: vi.fn().mockResolvedValue({
    success: true,
    changeRequestId: "22222222-2222-2222-2222-222222222222",
  }),
}));

import { deletePortfolioConfigurationAction } from "@/app/admin/client-config/actions";

function makeRow(overrides: Partial<ClientConfigPortfolioConfigurationRow> = {}): ClientConfigPortfolioConfigurationRow {
  return {
    primaryAccountId: "ADPEQACXROB",
    clientCode: "ADP",
    clientName: "Ad Pepijn Beheer",
    portfolioCode: "ADP",
    parentAccountId: null,
    parentAccountCode: null,
    assetClassCode: "EQ",
    assetClassName: "Equities",
    subAssetClassCode: "ACX",
    subAssetClassName: "Active Equity",
    managerCode: "ROB",
    managerName: "Robeco",
    benchmarkCode: "MSCI-WORLD-NR",
    benchmarkName: "MSCI World NR",
    npcClassificationId: 1,
    npcClassificationName: "Match",
    longName: "Active Equity Global",
    shortName: "AEQ",
    activeInd: true,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    changeRequestId: null,
    ...overrides,
  };
}

function getRetireButton(primaryAccountId: string): HTMLButtonElement {
  return screen.getByRole("button", {
    name: `Beëindig portfolio configuratie ${primaryAccountId}`,
  }) as HTMLButtonElement;
}

describe("ClientConfigTable — retire action button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an enabled 'Beëindigen' button on every active row", () => {
    render(
      <ClientConfigTable
        rows={[
          makeRow({ primaryAccountId: "ADPEQACXROB" }),
          makeRow({ primaryAccountId: "ADPEQACXBLK" }),
        ]}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /beëindig portfolio configuratie/i });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toBe("Beëindigen");
    }
  });

  it("disables the 'Beëindigen' button on inactive rows", () => {
    render(
      <ClientConfigTable
        rows={[
          makeRow({ primaryAccountId: "ADPEQACXROB", activeInd: true }),
          makeRow({ primaryAccountId: "ADPEQACXBLK", activeInd: false }),
        ]}
      />,
    );

    expect(getRetireButton("ADPEQACXROB").disabled).toBe(false);
    expect(getRetireButton("ADPEQACXBLK").disabled).toBe(true);
  });

  it("opens the retire modal when an active row's button is clicked", () => {
    render(
      <ClientConfigTable
        rows={[
          makeRow({ primaryAccountId: "ADPEQACXROB" }),
          makeRow({ primaryAccountId: "ADPEQACXBLK", activeInd: false }),
        ]}
      />,
    );

    // Modal is not rendered before the trigger click
    expect(document.querySelector(".retire-modal")).toBeNull();

    fireEvent.click(getRetireButton("ADPEQACXROB"));

    const modal = document.querySelector(".retire-modal") as HTMLElement | null;
    expect(modal).not.toBeNull();
    expect(modal!.getAttribute("aria-modal")).toBe("true");
    expect(within(modal!).getByText(/Portefeuille beëindigen/i)).toBeTruthy();
    // Target identity is shown in the modal
    expect(within(modal!).getByText(/ADPEQACXROB/)).toBeTruthy();
  });

  it("modal includes requester, rationale, and effective-date fields", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);
    fireEvent.click(getRetireButton("ADPEQACXROB"));

    const modal = document.querySelector(".retire-modal") as HTMLElement;
    expect(within(modal).getByLabelText("Aanvrager")).toBeTruthy();
    expect(within(modal).getByLabelText(/Reden van beëindiging/i)).toBeTruthy();
    expect(within(modal).getByLabelText("Ingangsdatum beëindiging")).toBeTruthy();
    // Hidden field carries the stable target identity
    const hiddenInput = modal.querySelector('input[name="primaryAccountId"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("ADPEQACXROB");
  });

  it("submits a governed change request on modal submit", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);
    fireEvent.click(getRetireButton("ADPEQACXROB"));

    const modal = document.querySelector(".retire-modal") as HTMLElement;
    const form = modal.querySelector("form") as HTMLFormElement;
    fireEvent.change(within(modal).getByLabelText(/Reden van beëindiging/i), {
      target: { value: "Portefeuille wordt overgeheveld naar een andere manager." },
    });
    fireEvent.change(within(modal).getByLabelText("Ingangsdatum beëindiging"), {
      target: { value: "2026-12-01" },
    });

    fireEvent.submit(form);

    expect(deletePortfolioConfigurationAction).toHaveBeenCalledTimes(1);
    const [prev, formData] = (deletePortfolioConfigurationAction as ReturnType<typeof vi.fn>).mock
      .calls[0] as [unknown, FormData];
    expect(prev).toEqual({});
    expect(formData.get("primaryAccountId")).toBe("ADPEQACXROB");
    expect(formData.get("rationale")).toBe(
      "Portefeuille wordt overgeheveld naar een andere manager.",
    );
    expect(formData.get("effectiveDate")).toBe("2026-12-01");
    expect(formData.get("requestedBy")).toBe("Ruben Verboon");
  });

  it("closes the modal via the close button", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);
    fireEvent.click(getRetireButton("ADPEQACXROB"));
    expect(document.querySelector(".retire-modal")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sluiten" }));
    expect(document.querySelector(".retire-modal")).toBeNull();
  });
});
