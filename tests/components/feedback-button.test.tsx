// @vitest-environment jsdom
/**
 * Regression tests for FeedbackButton modal open behavior.
 *
 * Acceptance criteria:
 * 1. Page load does not auto-open the modal.
 * 2. Unrelated user interactions (scrolling, clicking non-trigger elements)
 *    do not open the modal.
 * 3. An explicit intended trigger click opens the modal as expected.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeedbackButton } from "@/components/feedback-button";

describe("FeedbackButton — modal open behavior", () => {
  function getModal() {
    return document.querySelector(".feedback-modal") as HTMLElement | null;
  }

  it("does not render the modal on mount", () => {
    render(<FeedbackButton />);

    const modal = getModal();
    expect(modal).toBeNull();
  });

  it("does not open the modal on unrelated clicks", () => {
    render(<FeedbackButton />);

    fireEvent.click(document.body);

    expect(getModal()).toBeNull();
  });

  it("opens the modal only from the explicit feedback trigger", () => {
    render(<FeedbackButton />);

    const trigger = screen.getByRole("button", { name: /feedback geven/i });
    expect(trigger.classList.contains("feedback-trigger")).toBe(true);

    fireEvent.click(trigger);

    const modal = getModal();
    expect(modal).not.toBeNull();
    expect(modal!.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector(".feedback-modal--open")).not.toBeNull();
  });

  it("closes the modal from the dedicated close button", () => {
    render(<FeedbackButton />);

    fireEvent.click(screen.getByRole("button", { name: /feedback geven/i }));
    expect(getModal()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /sluiten/i }));

    expect(getModal()).toBeNull();
  });
});
