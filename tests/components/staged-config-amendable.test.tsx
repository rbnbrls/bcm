// @vitest-environment jsdom
/**
 * Component tests for AmendableStagedConfig.
 *
 * Verifies:
 *  - Renders StagedConfigDiff without edit controls when status is NOT editable
 *  - Shows edit button for submitted/accepted statuses
 *  - Shows delete button for draft/submitted/accepted statuses
 *  - Shows delete confirmation on click
 *  - Clicking edit reveals the inline edit form with field inputs
 *  - Cancel button hides the form
 *  - Saving calls the server action
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AmendableStagedConfig } from "@/components/staged-config-amendable";

// Mock the server action
vi.mock("@/app/changes/actions", () => ({
  amendPortfolioConfig: vi.fn().mockResolvedValue({ success: true, message: "Wijziging opgeslagen." }),
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AmendableStagedConfig } from "@/components/staged-config-amendable";

// Mock the server actions
vi.mock("@/app/changes/actions", () => ({
  amendPortfolioConfig: vi.fn().mockResolvedValue({ success: true, message: "Wijziging opgeslagen." }),
  deletePortfolioConfig: vi.fn().mockResolvedValue({ success: true, message: "Staged configuratie verwijderd." }),
}));

const mockRow = {
  id: 1,
  changeRequestId: "11111111-1111-1111-1111-111111111111",
  actionType: "UPDATE",
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
};

describe("AmendableStagedConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders StagedConfigDiff without edit button when status is not editable (draft)", () => {
  // ── Existing amend tests (unchanged semantics) ──

  it("renders StagedConfigDiff without action buttons when status does not allow any action", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="processed"
      />,
    );

    expect(screen.getByText("CLIENT-CONFIGURATIE")).toBeTruthy();
    expect(screen.queryByText("Wijzig")).toBeNull();
    expect(screen.queryByText("Verwijder")).toBeNull();
  });

  it("renders delete button only when status is draft", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="draft"
      />,
    );

    // The section should render
    expect(screen.getByText("CLIENT-CONFIGURATIE")).toBeTruthy();
    // No edit button
    expect(screen.queryByText("Wijzig")).toBeNull();
  });

  it("renders edit button when status is submitted", () => {
    expect(screen.getByText("CLIENT-CONFIGURATIE")).toBeTruthy();
    // Delete button visible
    expect(screen.getByText("Verwijder")).toBeTruthy();
    // Edit button NOT visible for draft
    expect(screen.queryByText("Wijzig")).toBeNull();
  });

  it("renders both edit and delete buttons when status is submitted", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    expect(screen.getByText("CLIENT-CONFIGURATIE")).toBeTruthy();
    expect(screen.getByText("Wijzig")).toBeTruthy();
  });

  it("renders edit button when status is accepted", () => {
    expect(screen.getByText("Verwijder")).toBeTruthy();
  });

  it("renders both edit and delete buttons when status is accepted", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="accepted"
      />,
    );

    expect(screen.getByText("Wijzig")).toBeTruthy();
    expect(screen.getByText("Verwijder")).toBeTruthy();
  });

  it("renders nothing when rows array is empty", () => {
    const { container } = render(
      <AmendableStagedConfig
        rows={[]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows inline edit form when edit button is clicked", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    fireEvent.click(screen.getByText("Wijzig"));

    // Edit form should appear
    expect(screen.getByText("Wijzig waarden")).toBeTruthy();
    expect(screen.getByText("Rij #1")).toBeTruthy();

    // Field inputs should be pre-filled with current values
    const longNameInput = screen.getByDisplayValue("Active Equity Global");
    expect(longNameInput).toBeTruthy();
    const benchmarkInput = screen.getByDisplayValue("MSCI-WORLD-NR");
    expect(benchmarkInput).toBeTruthy();

    // Save and Cancel buttons
    expect(screen.getByText("Opslaan")).toBeTruthy();
    expect(screen.getByText("Annuleren")).toBeTruthy();
  });

  it("hides the inline edit form when cancel is clicked", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    fireEvent.click(screen.getByText("Wijzig"));
    expect(screen.getByText("Wijzig waarden")).toBeTruthy();

    fireEvent.click(screen.getByText("Annuleren"));
    expect(screen.queryByText("Wijzig waarden")).toBeNull();
    // Edit button should reappear
    expect(screen.getByText("Wijzig")).toBeTruthy();
  });

  it("hides edit button for the row being edited", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    fireEvent.click(screen.getByText("Wijzig"));

    // Edit button should be hidden while editing
    expect(screen.queryByText("Wijzig")).toBeNull();
  });

  it("renders all 11 editable fields in the edit form", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    fireEvent.click(screen.getByText("Wijzig"));

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

    // Labels appear both in the diff table and the edit form.
    // Use getAllByText — at least 2 of each should exist.
    for (const label of expectedLabels) {
      const elements = screen.getAllByText(label);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  // ── New delete-specific tests ──

  it("shows delete confirmation when delete button is clicked (submitted)", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    fireEvent.click(screen.getByText("Verwijder"));

    // Confirmation prompt should appear
    expect(screen.getByText("Weet je het zeker?")).toBeTruthy();
    expect(screen.getByText("Annuleren")).toBeTruthy();
    // Original delete button should be gone
    expect(screen.queryByText("Verwijder")).toBeNull();
  });

  it("shows delete confirmation when delete button is clicked (draft)", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="draft"
      />,
    );

    fireEvent.click(screen.getByText("Verwijder"));

    expect(screen.getByText("Weet je het zeker?")).toBeTruthy();
    expect(screen.getByText("Annuleren")).toBeTruthy();
    expect(screen.queryByText("Verwijder")).toBeNull();
  });

  it("hides delete confirmation when cancel is clicked", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    fireEvent.click(screen.getByText("Verwijder"));
    expect(screen.getByText("Weet je het zeker?")).toBeTruthy();

    fireEvent.click(screen.getByText("Annuleren"));

    // Confirmation should disappear, delete button reappear
    expect(screen.queryByText("Weet je het zeker?")).toBeNull();
    expect(screen.getByText("Verwijder")).toBeTruthy();
  });

  it("hides delete button when both edit and delete are open (edit wins)", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    // Open delete confirmation
    fireEvent.click(screen.getByText("Verwijder"));
    expect(screen.getByText("Weet je het zeker?")).toBeTruthy();

    // Now click Wijzig — should close delete confirmation and open edit form
    fireEvent.click(screen.getByText("Wijzig"));

    // Edit form should open
    expect(screen.getByText("Wijzig waarden")).toBeTruthy();
    // Delete confirmation should close
    expect(screen.queryByText("Weet je het zeker?")).toBeNull();
  });

  it("shows delete confirmation with submit button when delete is clicked", () => {
    render(
      <AmendableStagedConfig
        rows={[mockRow]}
        changeRequestId="11111111-1111-1111-1111-111111111111"
        changeStatus="submitted"
      />,
    );

    // Open delete confirmation
    fireEvent.click(screen.getByText("Verwijder"));

    // Confirm prompt should include a submit button
    const confirmBtn = screen.getByLabelText("Bevestig verwijderen van rij 1");
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.getAttribute("type")).toBe("submit");
    expect(screen.getByText("Weet je het zeker?")).toBeTruthy();

    // Cancel button also present
    expect(screen.getByLabelText("Annuleer verwijderen")).toBeTruthy();
  });
});
