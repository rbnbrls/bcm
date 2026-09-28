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
import { getTodayDateString } from "@/lib/change-form-utils";

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

  it("shows the long client name with the short code as a muted label underneath", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    // Long name is the prominent element (bold) inside the client cell
    const name = screen.getByText("Ad Pepijn Beheer");
    const clientCell = name.closest("td");
    expect(clientCell).toBeTruthy();
    expect(clientCell?.classList.contains("config-table-client-cell")).toBe(true);
    expect(name.tagName).toBe("B");
    // Short code stays visible as a muted <small> below the long name
    const code = within(clientCell as HTMLElement).getByText("ADP");
    expect(code.tagName).toBe("SMALL");
    // Tooltip still exposes the combined 'Name (CODE)' form
    expect(screen.getByTitle("Ad Pepijn Beheer (ADP)")).toBeTruthy();
  });

  it("shows the seeded BAK client by its long name with the short code underneath", () => {
    render(
      <ClientConfigTable
        rows={[
          makeRow({
            clientCode: "BAK",
            clientName: "Bedrijfspensioenfonds Bakkerij",
            primaryAccountId: "BAK*EQEUR*ROB",
          }),
        ]}
      />,
    );

    const clientCell = screen
      .getByText("Bedrijfspensioenfonds Bakkerij")
      .closest("td");
    expect(clientCell).toBeTruthy();
    expect(within(clientCell as HTMLElement).getByText("BAK").tagName).toBe(
      "SMALL",
    );
  });

  it("does not duplicate the short code when the client name is missing", () => {
    const { container } = render(<ClientConfigTable rows={[makeRow({ clientName: null })]} />);

    const clientCell = container.querySelector("tbody td.config-table-client-cell");
    expect(clientCell?.textContent).toBe("ADP");
    // Only one code rendered — the name is absent, so no label duplication
    expect(within(clientCell as HTMLElement).getAllByText("ADP")).toHaveLength(1);
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

  it("auto-fills the requester field from the current user", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);
    fireEvent.click(getRetireButton("ADPEQACXROB"));

    const modal = document.querySelector(".retire-modal") as HTMLElement;
    const requester = within(modal).getByLabelText("Aanvrager") as HTMLInputElement;
    expect(requester.getAttribute("name")).toBe("requestedBy");
    // Pre-filled so the operator does not have to type their own name
    expect(requester.value.trim().length).toBeGreaterThan(0);
  });

  it("marks rationale and effective date as required and blocks past dates", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);
    fireEvent.click(getRetireButton("ADPEQACXROB"));

    const modal = document.querySelector(".retire-modal") as HTMLElement;
    const rationale = within(modal).getByLabelText(
      /Reden van beëindiging/i,
    ) as HTMLTextAreaElement;
    expect(rationale.required).toBe(true);

    const dateInput = within(modal).getByLabelText(
      "Ingangsdatum beëindiging",
    ) as HTMLInputElement;
    expect(dateInput.required).toBe(true);
    expect(dateInput.type).toBe("date");
    // min is set to today so the picker cannot select a past retirement date
    expect(dateInput.min).toBe(getTodayDateString());
  });

  it("prevents submission while required fields are invalid", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);
    fireEvent.click(getRetireButton("ADPEQACXROB"));

    const modal = document.querySelector(".retire-modal") as HTMLElement;
    const form = modal.querySelector("form") as HTMLFormElement;
    const rationale = within(modal).getByLabelText(
      /Reden van beëindiging/i,
    ) as HTMLTextAreaElement;
    const dateInput = within(modal).getByLabelText(
      "Ingangsdatum beëindiging",
    ) as HTMLInputElement;

    // Empty rationale + empty date → native constraint validation blocks submit
    fireEvent.change(rationale, { target: { value: "" } });
    fireEvent.change(dateInput, { target: { value: "" } });
    // jsdom implements required-constraint validation: the form is invalid and
    // a real browser therefore blocks the submit event from reaching the
    // server action (jsdom's fireEvent.submit bypasses validation, so the
    // checkValidity + constraint-attribute assertions below are the proof).
    expect(form.checkValidity()).toBe(false);

    // Constraint attributes enforce the remaining rules in the browser:
    // rationale minLength 10 and date min = today (past dates blocked)
    expect(rationale.minLength).toBe(10);
    expect(dateInput.min).toBe(getTodayDateString());
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

  it("shows both edit and retire buttons on the same active row (regression: CI #378 test (22))", () => {
    // Regression for CI #378 on fix/t_68567c4f: the #325 rewrite of
    // client-config-table.tsx replaced the retire button with the edit
    // affordance instead of adding alongside it, so the "Beëindigen" button
    // (added by #327) silently disappeared and 6 component tests failed with
    // "Unable to find button named /beëindig portfolio configuratie/i".
    // This test pins both actions coexisting per row.
    render(
      <ClientConfigTable
        rows={[
          makeRow({ primaryAccountId: "ADPEQACXROB" }),
          makeRow({ primaryAccountId: "ADPEQACXBLK", activeInd: false }),
        ]}
      />,
    );

    // Edit affordance present for ACTIVE rows only (data-driven permission rule);
    // inactive rows are closed-out history and must not be edited.
    expect(screen.getByRole("button", { name: "Bewerk rij ADPEQACXROB" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bewerk rij ADPEQACXBLK" })).toBeNull();

    // Retire button present alongside, enabled for active rows only.
    expect(getRetireButton("ADPEQACXROB").disabled).toBe(false);
    expect(getRetireButton("ADPEQACXBLK").disabled).toBe(true);
  });
});
