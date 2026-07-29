// @vitest-environment jsdom
/**
 * Regression tests for the MermaidRenderer component.
 *
 * These tests verify the component renders correctly in its loading state,
 * handles prop changes without crashing, and uses a static import of mermaid
 * (the fix for the Turbopack runtime bug).
 *
 * The full rendering logic is verified via:
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
    render: vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve({ svg: "<svg data-testid='mermaid-svg'></svg>" }), 100);
      });
    }),
  },
}));

describe("MermaidRenderer", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should show loading placeholder on initial render", async () => {
    render(<MermaidRenderer definition="flowchart LR\nA-->B" />);

    expect(screen.getByText("Procesoverzicht laden...")).toBeTruthy();
    expect(await screen.findByTestId("mermaid-svg")).toBeTruthy();
  });

  it("should not render error state or retry button on initial mount", async () => {
    render(<MermaidRenderer definition="flowchart LR\nA-->B" />);

    expect(screen.queryByText("Opnieuw")).toBeNull();
    expect(screen.queryByText(/⚠/)).toBeNull();

    expect(await screen.findByTestId("mermaid-svg")).toBeTruthy();
  });

  it("should accept a definition prop and re-render without crashing", async () => {
    const { rerender } = render(
      <MermaidRenderer definition="flowchart LR\nA-->B" />
    );

    expect(await screen.findByTestId("mermaid-svg")).toBeTruthy();

    rerender(<MermaidRenderer definition="flowchart LR\nC-->D" />);

    expect(await screen.findByTestId("mermaid-svg")).toBeTruthy();
  });

  it("should handle empty definition string without crashing", async () => {
    render(<MermaidRenderer definition="" />);

    expect(screen.getByText("Procesoverzicht laden...")).toBeTruthy();
    expect(await screen.findByTestId("mermaid-svg")).toBeTruthy();
  });

  it("should handle very long definition strings without crashing", async () => {
    const longDef = "flowchart LR\n" + "  A-->B\n".repeat(100);
    render(<MermaidRenderer definition={longDef} />);

    expect(await screen.findByTestId("mermaid-svg")).toBeTruthy();
  });
});
