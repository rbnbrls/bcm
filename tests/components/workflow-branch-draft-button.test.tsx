// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/app/workflow-studio/actions", () => ({
  createDraftFromPublishedAction: vi.fn(),
}));

import { createDraftFromPublishedAction } from "@/app/workflow-studio/actions";
import { WorkflowBranchDraftButton } from "@/app/workflow-studio/workflow-branch-draft-button";

const branchAction = vi.mocked(createDraftFromPublishedAction);

describe("WorkflowBranchDraftButton", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    branchAction.mockReset();
  });

  it("renders the Aanpassen action button", () => {
    render(<WorkflowBranchDraftButton definitionId="def-1" />);

    expect(screen.getByRole("button", { name: "Aanpassen" })).toBeTruthy();
  });

  it("branches a draft from the published version and navigates to the editor on success", async () => {
    branchAction.mockResolvedValue({
      success: true,
      message: "Draft aangemaakt vanaf de gepubliceerde versie.",
      definitionId: "def-1",
    });

    render(<WorkflowBranchDraftButton definitionId="def-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aanpassen" }));

    await waitFor(() => expect(branchAction).toHaveBeenCalledWith({ definitionId: "def-1" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/workflow-studio/def-1/edit"));
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("routes to the editor when a draft already exists instead of surfacing an error", async () => {
    branchAction.mockResolvedValue({
      success: false,
      code: "draft_already_exists",
      message: "Deze workflow heeft al een bewerkbare draft.",
    });

    render(<WorkflowBranchDraftButton definitionId="def-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aanpassen" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/workflow-studio/def-1/edit"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the backend message and stays put when there is no published version", async () => {
    branchAction.mockResolvedValue({
      success: false,
      code: "no_published_version",
      message: "Deze workflowdefinitie heeft geen gepubliceerde versie om van af te takken.",
    });

    render(<WorkflowBranchDraftButton definitionId="def-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aanpassen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Deze workflowdefinitie heeft geen gepubliceerde versie om van af te takken.",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("surfaces a permission denial without navigating", async () => {
    branchAction.mockResolvedValue({
      success: false,
      code: "scope_denied",
      message: "Je hebt geen rechten om deze workflow aan te passen.",
    });

    render(<WorkflowBranchDraftButton definitionId="def-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Aanpassen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Je hebt geen rechten om deze workflow aan te passen.",
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
