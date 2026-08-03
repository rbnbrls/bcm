// @vitest-environment jsdom
/**
 * Component tests for the /admin/client-config table edit affordance + the
 * prefilled update wizard (t_cb7f89f2).
 *
 * Verifies:
 *  - Every row renders an edit trigger ("Bewerken") when editable
 *  - The trigger is hidden for rows without edit permission (inactive rows)
 *  - A custom canEditRow predicate gates visibility
 *  - Clicking the trigger passes the row's stable identity (primaryAccountId)
 *    to the wizard and opens it
 *  - The wizard opens prefilled with the row's current values (IST) as
 *    editable inputs — every mutable field reflects the row on open
 *  - The fields can be modified and the 'Submit Change Request' button
 *    submits the edited values to the staging server action
 *  - The wizard can be closed again
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ClientConfigTable from "@/app/admin/client-config/client-config-table";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

// Mock the server actions module so the wizard's submit can be asserted
// without a database. The table and wizard import the same module.
const { updateClientConfigRowAction } = vi.hoisted(() => ({
  updateClientConfigRowAction: vi.fn(),
}));
vi.mock("@/app/admin/client-config/actions", () => ({
  updateClientConfigRowAction,
}));

beforeEach(() => {
  updateClientConfigRowAction.mockResolvedValue({ success: true });
});

function makeRow(
  overrides: Partial<ClientConfigPortfolioConfigurationRow> = {},
): ClientConfigPortfolioConfigurationRow {
  return {
    primaryAccountId: "HOR*EQACX*ROB",
    clientCode: "HOR",
    clientName: "Pensioenfonds Horizon",
    portfolioCode: "HOR",
    parentAccountId: null,
    parentAccountCode: null,
    assetClassCode: "EQ",
    assetClassName: "Equities",
    subAssetClassCode: "ACX",
    subAssetClassName: "Active Global",
    managerCode: "ROB",
    managerName: "ROBECO",
    benchmarkCode: "MSCI-WORLD-NR",
    benchmarkName: "MSCI World NR",
    npcClassificationId: 2,
    npcClassificationName: "Return",
    longName: "Horizon Active Equities",
    shortName: "HAE",
    activeInd: true,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    changeRequestId: null,
    ...overrides,
  };
}

describe("ClientConfigTable edit affordance", () => {
  it("renders an edit trigger for every editable row", () => {
    render(
      <ClientConfigTable
        rows={[
          makeRow(),
          makeRow({ primaryAccountId: "HOR*FIPR*UBS", portfolioCode: "HOR2" }),
        ]}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /Bewerk rij/ });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("data-edit-row", "HOR*EQACX*ROB");
    expect(buttons[1]).toHaveAttribute("data-edit-row", "HOR*FIPR*UBS");
    expect(buttons[0]).toHaveTextContent("Bewerken");
  });

  it("hides the edit trigger for rows without edit permission (inactive rows)", () => {
    render(
      <ClientConfigTable
        rows={[
          makeRow(),
          makeRow({ primaryAccountId: "HOR*FIPR*UBS", activeInd: false }),
        ]}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /Bewerk rij/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("data-edit-row", "HOR*EQACX*ROB");
  });

  it("honors a custom canEditRow permission predicate", () => {
    const canEditRow = vi.fn(
      (row: ClientConfigPortfolioConfigurationRow) =>
        row.portfolioCode === "HOR",
    );
    render(
      <ClientConfigTable
        rows={[
          makeRow(),
          makeRow({ primaryAccountId: "HOR*FIPR*UBS", portfolioCode: "AND" }),
        ]}
        canEditRow={canEditRow}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /Bewerk rij/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("data-edit-row", "HOR*EQACX*ROB");
    expect(canEditRow).toHaveBeenCalledTimes(2);
  });

  it("calls onEditRow with the full row (stable identity) when the trigger is clicked", () => {
    const onEditRow = vi.fn();
    const row = makeRow();
    render(<ClientConfigTable rows={[row]} onEditRow={onEditRow} />);

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));
    expect(onEditRow).toHaveBeenCalledTimes(1);
    expect(onEditRow).toHaveBeenCalledWith(row);
  });

  it("opens the update wizard with the row's stable identity on click", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    expect(screen.queryByLabelText(/Wijzig client config rij/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Bewerk rij HOR\*EQACX\*ROB/ }),
    );

    const wizard = screen.getByLabelText(
      /Wijzig client config rij HOR\*EQACX\*ROB/,
    );
    expect(wizard).toBeTruthy();
    expect(within(wizard).getByText("HOR*EQACX*ROB")).toBeTruthy();
  });

  it("prefills the wizard with the row's current values as editable inputs (IST state)", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));

    const wizard = screen.getByLabelText(/Wijzig client config rij/);
    const input = (key: string) =>
      within(wizard).getByTestId(`ist-field-${key}`) as HTMLInputElement;
    expect(input("portfolioCode")).toHaveValue("HOR");
    expect(input("assetClassCode")).toHaveValue("EQ");
    expect(input("subAssetClassCode")).toHaveValue("ACX");
    expect(input("managerCode")).toHaveValue("ROB");
    expect(input("benchmarkCode")).toHaveValue("MSCI-WORLD-NR");
    expect(input("npcClassificationId")).toHaveValue(2);
    expect(input("longName")).toHaveValue("Horizon Active Equities");
    expect(input("shortName")).toHaveValue("HAE");
    expect(input("effectiveFrom")).toHaveValue("2026-01-01");
  });

  it("renders every mutable field as an editable input (not read-only)", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));

    const wizard = screen.getByLabelText(/Wijzig client config rij/);
    // Valid replacement value per input type (number/date inputs sanitize
    // invalid strings to "" in jsdom).
    const editedValue: Record<string, string> = {
      portfolioCode: "HOR2",
      assetClassCode: "EQ",
      subAssetClassCode: "ACX",
      managerCode: "ROB",
      benchmarkCode: "MSCI-WORLD-NR",
      npcClassificationId: "3",
      longName: "Horizon Active Equities II",
      shortName: "HAE2",
      effectiveFrom: "2026-02-01",
    };
    for (const [key, value] of Object.entries(editedValue)) {
      const input = within(wizard).getByTestId(
        `ist-field-${key}`,
      ) as HTMLInputElement;
      expect(input.tagName).toBe("INPUT");
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute("name");
      // Modifying the field must be allowed (reflects IST but is editable)
      fireEvent.change(input, { target: { value } });
      // number inputs expose a numeric value in jsdom
      const expected = key === "npcClassificationId" ? Number(value) : value;
      expect(input).toHaveValue(expected);
    }
  });

  it("submits the edited values as a change request via the staging action", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));

    const wizard = screen.getByLabelText(/Wijzig client config rij/);
    fireEvent.change(
      within(wizard).getByTestId("ist-field-longName") as HTMLInputElement,
      { target: { value: "Horizon Active Equities (hernoemd)" } },
    );
    fireEvent.change(
      within(wizard).getByTestId("ist-field-shortName") as HTMLInputElement,
      { target: { value: "HAE2" } },
    );

    const submit = within(wizard).getByTestId("submit-change-request");
    expect(submit).toBeTruthy();
    expect(submit).toHaveTextContent(/wijzigingsverzoek/i);

    const form = (submit as HTMLButtonElement).closest("form")!;
    fireEvent.submit(form);

    expect(updateClientConfigRowAction).toHaveBeenCalledTimes(1);
    const [prev, formData] = (
      updateClientConfigRowAction as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(prev).toEqual({});
    expect(formData.get("primaryAccountId")).toBe("HOR*EQACX*ROB");
    expect(formData.get("portfolioCode")).toBe("HOR");
    expect(formData.get("longName")).toBe("Horizon Active Equities (hernoemd)");
    expect(formData.get("shortName")).toBe("HAE2");
  });

  it("closes the wizard via the close button", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));
    expect(screen.getByLabelText(/Wijzig client config rij/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Sluit wijzig wizard" }),
    );
    expect(screen.queryByLabelText(/Wijzig client config rij/)).toBeNull();
  });

  it("renders inline field errors returned by the staging action", async () => {
    updateClientConfigRowAction.mockResolvedValueOnce({
      success: false,
      error: 'Benchmark "NOPE-INDEX" bestaat niet in de catalogus.',
      issues: ['Benchmark "NOPE-INDEX" bestaat niet in de catalogus.'],
      fieldErrors: {
        benchmarkCode: 'Benchmark "NOPE-INDEX" bestaat niet in de catalogus.',
      },
    });

    render(<ClientConfigTable rows={[makeRow()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));

    const wizard = screen.getByLabelText(/Wijzig client config rij/);
    const submit = within(wizard).getByTestId("submit-change-request");
    fireEvent.submit((submit as HTMLButtonElement).closest("form")!);

    // The error appears inline under the benchmark field (not only in the
    // general error block), and the input is flagged invalid.
    const inlineError = await within(wizard).findByTestId(
      "field-error-benchmarkCode",
    );
    expect(inlineError).toHaveTextContent("NOPE-INDEX");
    expect(inlineError).toHaveAttribute("role", "alert");

    const benchmarkInput = within(wizard).getByTestId(
      "ist-field-benchmarkCode",
    );
    expect(benchmarkInput).toHaveAttribute("aria-invalid", "true");
  });
});
