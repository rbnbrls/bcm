// @vitest-environment jsdom
/**
 * Component tests for UniqueCodeField.
 *
 * Verifies:
 *  - Duplicate codes show an inline validation error (role="alert")
 *  - Unique codes pass (no error, success hint shown)
 *  - Format-invalid values never hit the API
 *  - onStatusChange reports taken/available so parent forms can gate submission
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UniqueCodeField } from "@/components/unique-code-field";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("UniqueCodeField — client code", () => {
  it("shows an inline error when the client code is already taken", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        clientCodeTaken: true,
        portfolioCodeTaken: false,
        clientCodeMessage: "Klantcode HOR is al in gebruik.",
        portfolioCodeMessage: null,
      }),
    });

    render(<UniqueCodeField kind="client" label="Klantcode" value="HOR" onChange={() => {}} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Klantcode HOR is al in gebruik.");
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("passes when the client code is unique (no error, success hint)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        clientCodeTaken: false,
        portfolioCodeTaken: false,
        clientCodeMessage: null,
        portfolioCodeMessage: null,
      }),
    });

    render(<UniqueCodeField kind="client" label="Klantcode" value="ZZZ" onChange={() => {}} />);

    const success = await screen.findByText("Code is beschikbaar.");
    expect(success).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not call the API for format-invalid values", async () => {
    render(<UniqueCodeField kind="client" label="Klantcode" value="TOOLONG" onChange={() => {}} />);

    // Give the debounce window time to elapse; the API must never be called.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not call the API while the value is empty", async () => {
    render(<UniqueCodeField kind="client" label="Klantcode" value="" onChange={() => {}} />);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports taken status to the parent via onStatusChange", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        clientCodeTaken: true,
        portfolioCodeTaken: false,
        clientCodeMessage: "Klantcode HOR is al in gebruik.",
        portfolioCodeMessage: null,
      }),
    });
    const onStatusChange = vi.fn();

    render(
      <UniqueCodeField kind="client" label="Klantcode" value="HOR" onChange={() => {}} onStatusChange={onStatusChange} />,
    );

    await screen.findByRole("alert");
    expect(onStatusChange).toHaveBeenCalledWith("taken");
  });

  it("reports available status to the parent for unique codes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        clientCodeTaken: false,
        portfolioCodeTaken: false,
        clientCodeMessage: null,
        portfolioCodeMessage: null,
      }),
    });
    const onStatusChange = vi.fn();

    render(
      <UniqueCodeField kind="client" label="Klantcode" value="ZZZ" onChange={() => {}} onStatusChange={onStatusChange} />,
    );

    await screen.findByText("Code is beschikbaar.");
    expect(onStatusChange).toHaveBeenCalledWith("available");
  });

  it("uppercases typed input", () => {
    const onChange = vi.fn();
    render(<UniqueCodeField kind="client" label="Klantcode" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hor" } });
    expect(onChange).toHaveBeenCalledWith("HOR");
  });
});

describe("UniqueCodeField — portfolio code", () => {
  it("shows an inline error when the portfolio code is already taken", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        clientCodeTaken: false,
        portfolioCodeTaken: true,
        clientCodeMessage: null,
        portfolioCodeMessage: "Portfoliocode HORRP is al in gebruik.",
      }),
    });

    render(<UniqueCodeField kind="portfolio" label="Portfoliocode" value="HORRP" onChange={() => {}} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Portfoliocode HORRP is al in gebruik.");
  });

  it("passes when the portfolio code is unique", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        clientCodeTaken: false,
        portfolioCodeTaken: false,
        clientCodeMessage: null,
        portfolioCodeMessage: null,
      }),
    });

    render(<UniqueCodeField kind="portfolio" label="Portfoliocode" value="ZZZRP" onChange={() => {}} />);

    const success = await screen.findByText("Code is beschikbaar.");
    expect(success).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
