/**
 * Tests for the feedback submission server action.
 *
 * Covers validation, GitHub API interaction, and error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitFeedback } from "@/app/feedback/actions";

describe("submitFeedback", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should accept valid feedback and return issue URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ html_url: "https://github.com/rbnbrls/bcm/issues/1" }),
        { status: 201 }
      )
    );

    const formData = new FormData();
    formData.set("title", "Great app");
    formData.set("body", "I love this feature");

    const result = await submitFeedback(null, formData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://github.com/rbnbrls/bcm/issues/1");
    }
  });

  it("should reject title shorter than 3 chars", async () => {
    const formData = new FormData();
    formData.set("title", "AB");
    formData.set("body", "Valid body text");

    const result = await submitFeedback(null, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("minimaal 3 tekens");
    }
  });

  it("should reject body shorter than 3 chars", async () => {
    const formData = new FormData();
    formData.set("title", "Valid title");
    formData.set("body", "AB");

    const result = await submitFeedback(null, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("minimaal 3 tekens");
    }
  });

  it("should return error when GITHUB_TOKEN is not set", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");

    const formData = new FormData();
    formData.set("title", "Valid title");
    formData.set("body", "Valid body");

    const result = await submitFeedback(null, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("GitHub token niet geconfigureerd");
    }
  });

  it("should return API error message on failed GitHub API call", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403, statusText: "Forbidden" })
    );

    const formData = new FormData();
    formData.set("title", "Valid title");
    formData.set("body", "Valid body");

    const result = await submitFeedback(null, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("GitHub");
    }
  });

  it("should return generic error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network failure")
    );

    const formData = new FormData();
    formData.set("title", "Valid title");
    formData.set("body", "Valid body");

    const result = await submitFeedback(null, formData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBeTruthy();
    }
  });

  it("regression #461: skips the real GitHub POST when FEEDBACK_DRY_RUN is set", async () => {
    // GH #461: every CI E2E run used to create a real GitHub issue because
    // submitFeedback POSTs server-side to api.github.com — Playwright's
    // page.route() can never intercept that (the interceptor in
    // tests/e2e/user-interactions.spec.ts was dead code). The fix must make
    // the action short-circuit when FEEDBACK_DRY_RUN is set (always in CI),
    // returning success without touching the GitHub API.
    vi.stubEnv("FEEDBACK_DRY_RUN", "1");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            html_url: "https://github.com/rbnbrls/bcm/issues/99999",
          }),
          { status: 201 }
        )
      );

    const formData = new FormData();
    formData.set("title", "Valid title");
    formData.set("body", "Valid body");

    const result = await submitFeedback(null, formData);

    // The dry-run guard must short-circuit BEFORE any fetch to GitHub.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("should prefix title with [Feedback]", async () => {
    const mockFn = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ html_url: "https://github.com/rbnbrls/bcm/issues/1" }),
        { status: 201 }
      )
    );

    const formData = new FormData();
    formData.set("title", "My feedback");
    formData.set("body", "Some description");

    await submitFeedback(null, formData);

    const callBody = JSON.parse(
      (mockFn.mock.calls[0][1] as RequestInit).body as string
    ) as any;
    expect(callBody.title).toBe("[Feedback] My feedback");
    expect(callBody.labels).toContain("feedback");
  });
});
