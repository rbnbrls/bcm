// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { WorkflowAutosaveStatus, useWorkflowAutosave, type WorkflowAutosaveAction } from "@/app/workflow-studio/[definitionId]/edit/workflow-autosave";
import type { WorkflowEditorGraph } from "@/lib/workflow-studio/editor-model";
import { createWorkflowLocalDraftSnapshot, workflowLocalDraftStorageKey } from "@/lib/workflow-studio/workflow-autosave";

const definitionId = "11111111-1111-4111-8111-111111111111";
const initialGraph: WorkflowEditorGraph = {
  nodes: [{ id: "22222222-2222-4222-8222-222222222222", nodeKey: "start", blockType: "manual_start", contractVersion: 1, label: "Start", description: "Start", configuration: {}, position: { x: 10, y: 10 } }],
  edges: [],
};

function Harness({ action }: { action: WorkflowAutosaveAction }) {
  const [graph, setGraph] = useState(initialGraph);
  const [revision, setRevision] = useState("3");
  const autosave = useWorkflowAutosave({
    definitionId,
    revision,
    graph,
    roleBindings: [],
    valid: true,
    onRevisionChange: setRevision,
    onRestore: setGraph,
    action,
    delayMs: 100,
  });
  return <div>
    <WorkflowAutosaveStatus autosave={autosave} />
    <output aria-label="Revisie">{revision}</output>
    <output aria-label="Positie">{graph.nodes[0]?.position.x}</output>
    <button type="button" onClick={() => setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => ({ ...node, position: { ...node.position, x: node.position.x + 5 } })) }))}>Verplaats</button>
  </div>;
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("workflow autosave controller", () => {
  it("debounces valid graph changes, advances revision and clears recovery storage", async () => {
    vi.useFakeTimers();
    const action = vi.fn<WorkflowAutosaveAction>().mockResolvedValue({ success: true, code: "ok", message: "Opgeslagen", revision: "4" });
    render(<Harness action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Verplaats" }));
    expect(screen.getByText("Autosave wacht")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0]?.[0]).toMatchObject({ definitionId, expectedRevision: 3 });
    expect(screen.getByText("Opgeslagen")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Revisie" })).toHaveTextContent("4");
    expect(window.localStorage.getItem(workflowLocalDraftStorageKey(definitionId))).toBeNull();
  });

  it("keeps the local snapshot and blocks retries after a revision conflict", async () => {
    vi.useFakeTimers();
    const action = vi.fn<WorkflowAutosaveAction>().mockResolvedValue({ success: false, code: "revision_conflict", message: "De draft is door een andere bewerker gewijzigd." });
    render(<Harness action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Verplaats" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });

    expect(screen.getByText("Edit-conflict")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Serverversie laden" })).toBeInTheDocument();
    expect(window.localStorage.getItem(workflowLocalDraftStorageKey(definitionId))).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verplaats" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("offers and restores a valid local draft after refresh", async () => {
    vi.useFakeTimers();
    const recovered = structuredClone(initialGraph);
    recovered.nodes[0]!.position.x = 77;
    window.localStorage.setItem(workflowLocalDraftStorageKey(definitionId), JSON.stringify(createWorkflowLocalDraftSnapshot(definitionId, "3", recovered, "2026-08-10T12:00:00.000Z")));
    const action = vi.fn<WorkflowAutosaveAction>().mockResolvedValue({ success: true, code: "ok", message: "Opgeslagen", revision: "4" });
    render(<Harness action={action} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.getByText("Lokale herstelkopie gevonden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lokale draft herstellen" }));
    expect(screen.getByRole("status", { name: "Positie" })).toHaveTextContent("77");
    expect(screen.getByText(/autosave controleert de serverrevisie/)).toBeInTheDocument();
  });
});
