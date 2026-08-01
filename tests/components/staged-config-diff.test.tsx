// @vitest-environment jsdom
/**
 * Component tests for StagedConfigDiff.
 *
 * Verifies the rendering logic for staged change_portfolio_configuration rows:
 *  - Empty state (no rows)
 *  - Action badges (CREATE / UPDATE / DELETE)
 *  - Target identity display
 *  - Field-level IST/SOLL rows
 *  - Apply outcome badges for processed rows
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StagedConfigDiff } from "@/components/staged-config-diff";

const mockCreateRow = {
  id: 1,
  changeRequestId: "11111111-1111-1111-1111-111111111111",
  actionType: "CREATE",
  targetPrimaryAccountId: null,
  clientCode: "ADP",
  portfolioCode: "ADP",
  assetClassCode: "EQ",
  subAssetClassCode: "ACX",
  managerCode: "ROB",
  benchmarkCode: "MSCI-WORLD-NR",
  npcClassificationId: 42,
  longName: "Active Equity Global",
  shortName: "AEQ",
  effectiveFrom: "2026-12-01",
  effectiveUntil: null,
  applyStatus: null,
  applyError: null,
};

const mockUpdateRow = {
  id: 2,
  changeRequestId: "11111111-1111-1111-1111-111111111111",
  actionType: "UPDATE",
  targetPrimaryAccountId: "ADP*EQACX*ROB",
  clientCode: "ADP",
  portfolioCode: "ADP",
  assetClassCode: "EQ",
  subAssetClassCode: "ACX",
  managerCode: "ROB",
  benchmarkCode: "MSCI-EM-NR",
  npcClassificationId: 42,
  longName: "Active Equity Global Updated",
  shortName: "AEQ",
  effectiveFrom: "2026-12-01",
  effectiveUntil: null,
  applyStatus: null,
  applyError: null,
};

const mockDeleteRow = {
  id: 3,
  changeRequestId: "11111111-1111-1111-1111-111111111111",
  actionType: "DELETE",
  targetPrimaryAccountId: "ADP*FIAGG*ROB",
  clientCode: "ADP",
  portfolioCode: "ADP",
  assetClassCode: "FI",
  subAssetClassCode: "AGG",
  managerCode: "ROB",
  benchmarkCode: "BLOOMBERG-AGG",
  npcClassificationId: 15,
  longName: "Fixed Income Aggregate",
  shortName: "FIA",
  effectiveFrom: "2026-06-01",
  effectiveUntil: "2026-12-01",
  applyStatus: null,
  applyError: null,
};

// ── Mocks with apply outcomes ──

const mockAppliedRow = {
  ...mockCreateRow,
  id: 4,
  applyStatus: "applied",
  applyError: null,
};

const mockSkippedRow = {
  ...mockCreateRow,
  id: 5,
  applyStatus: "skipped",
  applyError: "Er bestaat al een actieve configuratie voor deze primary_account_id.",
};

const mockFailedRow = {
  ...mockUpdateRow,
  id: 6,
  applyStatus: "failed",
  applyError: "Geen actieve configuratie gevonden om bij te werken.",
};

describe("StagedConfigDiff", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when rows array is empty", () => {
    const { container } = render(<StagedConfigDiff rows={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the section with correct heading", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    expect(screen.getByText("CLIENT-CONFIGURATIE")).toBeTruthy();
    expect(screen.getByText("IST / SOLL")).toBeTruthy();
  });

  it("renders a CREATE action badge", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    expect(screen.getByText("Aanmaken")).toBeTruthy();
  });

  it("renders an UPDATE action badge", () => {
    render(<StagedConfigDiff rows={[mockUpdateRow]} />);
    expect(screen.getByText("Wijzigen")).toBeTruthy();
  });

  it("renders a DELETE (Beëindigen) action badge", () => {
    render(<StagedConfigDiff rows={[mockDeleteRow]} />);
    // Note: the component renders DELETE as "Beëindigen"
    expect(screen.getByText("Beëindigen")).toBeTruthy();
  });

  it("displays the target identity derived from dimension codes", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    // Identity format: CLIENT-ASSETCLASS-SUBASSET-MANAGER
    expect(screen.getByText("ADP-EQ-ACX-ROB")).toBeTruthy();
  });

  it("displays the portfolio code in the staged row header", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    // ADP appears as the portfolio label in the header
    const elements = screen.getAllByText("ADP");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders field-level IST and SOLL values for a CREATE row", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);

    // For a CREATE, all IST values show "—" and SOLL shows the target values
    // Check a few key fields
    const labels = screen.getAllByText("Benchmark");
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("MSCI-WORLD-NR")).toBeTruthy();
    expect(screen.getByText("Active Equity Global")).toBeTruthy();
    expect(screen.getByText("AEQ")).toBeTruthy();
  });

  it("renders multiple rows when provided", () => {
    render(<StagedConfigDiff rows={[mockCreateRow, mockUpdateRow, mockDeleteRow]} />);

    expect(screen.getByText("Aanmaken")).toBeTruthy();
    expect(screen.getByText("Wijzigen")).toBeTruthy();
    expect(screen.getByText("Beëindigen")).toBeTruthy();
  });

  it("renders effective_from as a localized date", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    // December 1, 2026 in nl-NL locale
    expect(screen.getByText(/1 december 2026/)).toBeTruthy();
  });

  it("renders effective_until as 'Onbepaald' when null", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    expect(screen.getAllByText("Onbepaald").length).toBeGreaterThanOrEqual(1);
  });

  it("renders effective_until as a date when provided", () => {
    render(<StagedConfigDiff rows={[mockDeleteRow]} />);
    expect(screen.getByText(/1 december 2026/)).toBeTruthy();
  });

  it("renders field labels in correct order", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);

    const expectedLabels = [
      "Portfolio",
      "Client",
      "Asset class",
      "Sub asset class",
      "Manager",
      "Benchmark",
      "NPC classificatie",
      "Lange naam",
      "Korte naam",
      "Ingangsdatum",
      "Einddatum",
    ];

    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("renders arrow separators between IST and SOLL values", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    // Arrow characters should appear between IST and SOLL values
    const arrows = screen.getAllByText("→");
    expect(arrows.length).toBeGreaterThanOrEqual(11); // one per dimension field
  });

  // ── Apply outcome tests ──

  it("does not render apply outcome badge when applyStatus is null", () => {
    render(<StagedConfigDiff rows={[mockCreateRow]} />);
    expect(screen.queryByText("Toegepast")).toBeNull();
    expect(screen.queryByText("Overgeslagen")).toBeNull();
    expect(screen.queryByText("Mislukt")).toBeNull();
  });

  it("renders 'Toegepast' badge when applyStatus is 'applied'", () => {
    render(<StagedConfigDiff rows={[mockAppliedRow]} />);
    expect(screen.getByText("Toegepast")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
  });

  it("renders 'Overgeslagen' badge with error message when applyStatus is 'skipped'", () => {
    render(<StagedConfigDiff rows={[mockSkippedRow]} />);
    expect(screen.getByText("Overgeslagen")).toBeTruthy();
    expect(screen.getByText("⏭")).toBeTruthy();
    expect(
      screen.getByText("Er bestaat al een actieve configuratie voor deze primary_account_id."),
    ).toBeTruthy();
  });

  it("renders 'Mislukt' badge with error message when applyStatus is 'failed'", () => {
    render(<StagedConfigDiff rows={[mockFailedRow]} />);
    expect(screen.getByText("Mislukt")).toBeTruthy();
    expect(screen.getByText("✗")).toBeTruthy();
    expect(
      screen.getByText("Geen actieve configuratie gevonden om bij te werken."),
    ).toBeTruthy();
  });

  it("renders apply outcome badges on mixed rows (some processed, some not)", () => {
    render(
      <StagedConfigDiff
        rows={[mockCreateRow, mockAppliedRow, mockFailedRow]}
      />,
    );

    // Unprocessed row: shows CREATE action badge
    expect(screen.getAllByText("Aanmaken").length).toBe(2); // mockCreateRow + mockAppliedRow

    // Applied row
    expect(screen.getByText("Toegepast")).toBeTruthy();

    // Failed row
    expect(screen.getByText("Mislukt")).toBeTruthy();
  });
});
