// @vitest-environment jsdom
/**
 * Component tests for the /admin/client-config table edit affordance.
 *
 * Verifies:
 *  - Every row renders an edit trigger ("Bewerken") when editable
 *  - The trigger is hidden for rows without edit permission (inactive rows)
 *  - A custom canEditRow predicate gates visibility
 *  - Clicking the trigger passes the row's stable identity (primaryAccountId)
 *    to the wizard and opens it
 *  - The wizard shows the row's current values (IST preview)
 *  - The wizard can be closed again
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ClientConfigTable from "@/app/admin/client-config/client-config-table";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

function makeRow(overrides: Partial<ClientConfigPortfolioConfigurationRow> = {}): ClientConfigPortfolioConfigurationRow {
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
        rows={[makeRow(), makeRow({ primaryAccountId: "HOR*FIPR*UBS", portfolioCode: "HOR2" })]}
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
    const canEditRow = vi.fn((row: ClientConfigPortfolioConfigurationRow) => row.portfolioCode === "HOR");
    render(
      <ClientConfigTable
        rows={[makeRow(), makeRow({ primaryAccountId: "HOR*FIPR*UBS", portfolioCode: "AND" })]}
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

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij HOR\*EQACX\*ROB/ }));

    const wizard = screen.getByLabelText(/Wijzig client config rij HOR\*EQACX\*ROB/);
    expect(wizard).toBeTruthy();
    expect(within(wizard).getByText("HOR*EQACX*ROB")).toBeTruthy();
  });

  it("prefills the wizard with the row's current values (IST state)", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));

    const wizard = screen.getByLabelText(/Wijzig client config rij/);
    const value = (key: string) =>
      within(wizard).getByTestId(`ist-field-${key}`) as HTMLElement;
    expect(value("portfolioCode")).toHaveTextContent("HOR");
    expect(value("assetClassCode")).toHaveTextContent("EQ");
    expect(value("subAssetClassCode")).toHaveTextContent("ACX");
    expect(value("managerCode")).toHaveTextContent("ROB");
    expect(value("benchmarkCode")).toHaveTextContent("MSCI-WORLD-NR");
    expect(value("npcClassificationId")).toHaveTextContent("2");
    expect(value("longName")).toHaveTextContent("Horizon Active Equities");
    expect(value("shortName")).toHaveTextContent("HAE");
    expect(value("effectiveFrom")).toHaveTextContent("2026-01-01");
  });

  it("closes the wizard via the close button", () => {
    render(<ClientConfigTable rows={[makeRow()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Bewerk rij/ }));
    expect(screen.getByLabelText(/Wijzig client config rij/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sluit wijzig wizard" }));
    expect(screen.queryByLabelText(/Wijzig client config rij/)).toBeNull();
  });
});
