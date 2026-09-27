// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/workflow-studio/actions", () => ({
  createWorkflowDraftAction: vi.fn(),
}));

import { WorkflowWizard } from "@/app/workflow-studio/new/workflow-wizard";

const templates = [
  { reference: "builtin:benchmark_switch", label: "Benchmarkwissel · standaardtemplate", description: "Wijzig een benchmark." },
  { reference: "builtin:portfolio_configuration_create", label: "Nieuwe portefeuille aanvragen · standaardtemplate", description: "Vraag een portefeuille aan." },
];

describe("workflow wizard", () => {
  it("shows business scenarios and advances from goal to details", () => {
    render(<WorkflowWizard templates={templates} />);

    expect(screen.getByRole("heading", { name: "Wat wil je regelen?" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Benchmarkwissel/ })).toBeVisible();
    expect(screen.queryByText("nodes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Nieuwe portefeuille aanvragen/ }));
    expect(screen.getByRole("heading", { name: /Gegevens voor Nieuwe portefeuille aanvragen/ })).toBeVisible();
    expect(screen.getByDisplayValue("builtin:portfolio_configuration_create")).toBeInTheDocument();
  });

  it("fills safe example data and keeps publishing separate from draft creation", () => {
    render(<WorkflowWizard templates={templates} selectedTemplate="builtin:benchmark_switch" />);
    fireEvent.click(screen.getByRole("button", { name: /Voorbeeld invullen/ }));

    expect(screen.getByRole("textbox", { name: "Naam" })).toHaveValue("Benchmark wijzigen");
    expect(screen.getByRole("textbox", { name: /Technische slug/ })).toHaveValue("benchmark-wijziging");
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole("button", { name: "Volgende" }));
    expect(screen.getByRole("button", { name: "Concept aanmaken" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publiceren" })).toBeNull();
  });
});
