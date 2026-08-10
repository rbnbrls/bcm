// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { WorkflowLivePreview } from "@/app/workflow-studio/[definitionId]/edit/workflow-live-preview";

describe("WorkflowLivePreview", () => {
  it("renders an inert end-user view directly from the supplied draft", () => {
    render(<WorkflowLivePreview
      metadata={{
        name: "Nieuwe aanvraag",
        description: "Doel van de aanvraag",
        catalogDescription: "Vraag een wijziging aan.",
        costModel: { baseCost: 10, currency: "EUR", description: "Vast" },
      }}
      nodes={[
        { id: "start", nodeKey: "start", blockType: "manual_start", contractVersion: 1, label: "Start", description: "Start", configuration: { label: "Start", starterRoleIds: ["aanvrager"] }, position: { x: 0, y: 0 } },
        { id: "form", nodeKey: "form", blockType: "form", contractVersion: 1, label: "Gegevens", description: "Formulier", configuration: { title: "Uw gegevens", fields: [
          { id: "naam", label: "Naam", type: "text", required: true, helpText: "Uw volledige naam" },
          { id: "keuze", label: "Keuze", type: "select", required: false, options: [{ value: "a", label: "Optie A" }] },
        ] }, position: { x: 100, y: 0 } },
        { id: "end", nodeKey: "end", blockType: "end", contractVersion: 1, label: "Klaar", description: "Voltooid", configuration: { label: "Klaar", outcome: "completed" }, position: { x: 200, y: 0 } },
      ]}
      edges={[
        { id: "a", edgeKey: "a", sourceNodeId: "start", sourcePort: "out", targetNodeId: "form", targetPort: "in" },
        { id: "b", edgeKey: "b", sourceNodeId: "form", sourcePort: "out", targetNodeId: "end", targetPort: "in" },
      ]}
      roleBindings={[{ workflowRole: "aanvrager", identityGroup: "bcm:requesters" }]}
      changeRequestCatalog={[]}
    />);

    const preview = screen.getByText("DRAFTPREVIEW · ALLEEN-LEZEN").closest("div[data-preview-mode]");
    if (!(preview instanceof HTMLElement)) throw new Error("Preview ontbreekt");
    expect(within(preview).getByRole("heading", { name: "Preview: Nieuwe aanvraag" })).toBeInTheDocument();
    expect(within(preview).getByRole("textbox", { name: "Naam *" })).toHaveAttribute("readonly");
    expect(within(preview).getByRole("combobox", { name: "Keuze" })).toBeDisabled();
    expect(within(preview).getByText("bcm:requesters")).toBeInTheDocument();
    expect(within(preview).getByText("3")).toBeInTheDocument();
    expect(within(preview).queryByRole("button")).not.toBeInTheDocument();
  });
});
