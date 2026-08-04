// @vitest-environment jsdom
/**
 * Page-level render tests for /changes/new.
 *
 * The frontend only exposes the benchmark switch process. Legacy links with
 * ?type=<slug> are accepted, but they no longer route users to other change
 * type forms from this entrypoint.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NewChangeRequestPage from "@/app/changes/new/page";
import { getMinimumDate } from "@/lib/change-form-utils";

async function renderPage(type?: string) {
  const element = await NewChangeRequestPage({
    searchParams: Promise.resolve(type ? { type } : {}),
  });
  return render(element);
}

describe("/changes/new benchmark switch flow", () => {
  it("renders only the benchmark switch request form by default", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Benchmarkwissel aanvragen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klant en portefeuille" })).toBeTruthy();
    expect(screen.getByText("Client-config regel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Benchmarkwissel aanvragen" })).toBeTruthy();
    expect(screen.queryByLabelText(/Change type/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Context van de aanvraag" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Portfolio definiëren" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Klantgegevens" })).toBeNull();
  });

  it("sets the effective date picker minimum to today plus the benchmark switch lead time", async () => {
    const { container } = await renderPage();

    const effectiveDate = container.querySelector<HTMLInputElement>('input[name="effectiveDate"]');
    if (!effectiveDate) {
      throw new Error("Expected effective date input to be rendered");
    }
    expect(screen.getByText("Gewenste ingangsdatum")).toBeTruthy();
    expect(effectiveDate.getAttribute("aria-describedby")).toBe("effective-date-help");
    expect(effectiveDate.type).toBe("date");
    expect(effectiveDate.min).toBe(getMinimumDate(7));
    expect(screen.getByText(`Minimaal ${getMinimumDate(7)} op basis van 7 dagen doorlooptijd.`)).toBeTruthy();
  });

  it("previews the benchmark switch as a red remove and green add diff", async () => {
    const { container } = await renderPage();

    fireEvent.change(screen.getByLabelText("Client-config regel"), {
      target: { value: "HOR*EQACX*ROB" },
    });
    fireEvent.change(screen.getByLabelText("Kies SOLL benchmark voor HORRP"), {
      target: { value: "MSCI-ACWI-NR" },
    });

    expect(screen.getByLabelText("Benchmarkwijziging preview")).toBeTruthy();
    expect(screen.getByText("client-config/HOR*EQACX*ROB.yaml")).toBeTruthy();
    expect(screen.getByText("portfolio: HOR*EQACX*ROB · HORRP · EQUITIES · AC WORLD · ROBECO")).toBeTruthy();

    const removedLine = container.querySelector(".diff-line.diff-remove");
    const addedLine = container.querySelector(".diff-line.diff-add");
    expect(removedLine?.textContent).toContain("−benchmark_code: MSCI-WORLD-NR");
    expect(removedLine?.textContent).toContain("MSCI World Net Return");
    expect(addedLine?.textContent).toContain("+benchmark_code: MSCI-ACWI-NR");
    expect(addedLine?.textContent).toContain("MSCI ACWI Net Return");
  });

  it("ignores legacy type parameters and keeps the user on benchmark switch", async () => {
    await renderPage("portfolio_configuration_update");

    expect(screen.getByRole("heading", { name: "Benchmarkwissel aanvragen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Klant en portefeuille" })).toBeTruthy();
    expect(screen.queryByText("Rekening (primary account id)")).toBeNull();
    expect(screen.queryByText("NPC-classificatie (SOLL)")).toBeNull();
  });
});
