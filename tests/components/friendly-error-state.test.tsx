// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FriendlyErrorState } from "@/components/friendly-error-state";

describe("FriendlyErrorState", () => {
  it("renders recovery copy and links", () => {
    render(
      <FriendlyErrorState
        eyebrow="404"
        title="We kunnen deze pagina niet vinden"
        message="Ga terug naar het overzicht of start opnieuw."
        primaryHref="/changes"
        primaryLabel="Naar changes"
        secondaryHref="/changes/new"
        secondaryLabel="Nieuwe change"
      />,
    );

    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByText("We kunnen deze pagina niet vinden")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Naar changes" }).getAttribute("href")).toBe("/changes");
    expect(screen.getByRole("link", { name: "Nieuwe change" }).getAttribute("href")).toBe("/changes/new");
  });

  it("runs the retry action when provided", () => {
    const retry = vi.fn();

    render(
      <FriendlyErrorState
        eyebrow="FOUT"
        title="Deze pagina kon niet worden geladen"
        message="Probeer opnieuw."
        onRetry={retry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Probeer opnieuw" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
