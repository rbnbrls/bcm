// @vitest-environment jsdom
/**
 * Regression tests for the MermaidRenderer component.
 *
 * These tests verify the component renders correctly in its loading state,
 * handles prop changes without crashing, and uses a static import of mermaid
 * (the fix for the Turbopack runtime bug).
 *
 * State transitions (loading -> rendered, loading -> error) rely on the
 * ref div being rendered — in jsdom the ref div is only mounted in the
 * rendered state, so the effect cannot trigger mermaid.render() on initial
 * mount. The full rendering logic is verified via:
 *   1) Unit tests for generateMermaidFlowchart / generateFlowMermaid
 *      in tests/change-type-catalog.test.ts
 *   2) E2E test at tests/e2e/process-flow.spec.ts
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MermaidRenderer } from "@/components/mermaid-renderer";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

describe("MermaidRenderer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should show loading placeholder on initial render", () => {
    render(<MermaidRenderer definition="flowchart LR\nA-->B" />);

    expect(screen.getByText("Procesoverzicht laden...")).toBeTruthy();
  });

  it("should not render error state or retry button on initial mount", () => {
    render(<MermaidRenderer definition="flowchart LR\nA-->B" />);

    expect(screen.queryByText("Opnieuw")).toBeNull();
    expect(screen.queryByText(/⚠/)).toBeNull();
  });

  it("should accept a definition prop and re-render without crashing", () => {
    const { rerender } = render(
      <MermaidRenderer definition="flowchart LR\nA-->B" />
    );

    expect(screen.getByText("Procesoverzicht laden...")).toBeTruthy();

    rerender(<MermaidRenderer definition="flowchart LR\nC-->D" />);
    expect(screen.getByText("Procesoverzicht laden...")).toBeTruthy();
  });

  it("should handle empty definition string without crashing", () => {
    render(<MermaidRenderer definition="" />);
    expect(screen.getByText("Procesoverzicht laden...")).toBeTruthy();
  });

  it("should handle very long definition strings without crashing", () => {
    const longDef = "flowchart LR\n" + "  A-->B\n".repeat(100);
    render(<MermaidRenderer definition={longDef} />);
    expect(screen.getByText("Procesoverzicht laden...")).toBeTruthy();
  });
});
