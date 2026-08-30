/**
 * Regression tests for the verification/sentinel error filter (GitHub issue
 * #641 — "RuntimeError: FinanceSyncBridgeE2E verification").
 *
 * Background: the "FinanceSyncBridgeE2E verification" RuntimeError was NOT a
 * production defect. It was a deliberate, controlled E2E verification sentinel
 * raised via `python -c` inside the finance-sync prod container by a
 * monitoring-verification task (kanban task t_75cc129c). It flowed through
 * GlitchTip -> bridge -> GitHub and was wrongly filed as bug issue #641.
 *
 * Root cause addressed here: the error-monitoring pipeline must never file
 * verification/test sentinels as GitHub bug issues. This suite pins the
 * contract:
 *
 *  1. isVerificationSentinel() recognizes the FinanceSyncBridgeE2E message
 *     (and the sibling verification sentinels from the same campaign).
 *  2. POST /api/report-error returns filtered:true / reason
 *     "verification-sentinel" and does NOT call the GitHub API for the
 *     FinanceSyncBridgeE2E sentinel.
 *  3. Real production errors (no "verification"/"test event" markers) still
 *     create GitHub issues — the filter is narrow, not a broad mute.
 *  4. captureError() skips GlitchTip capture + GitHub issue for sentinels.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track fetch calls for assertions
let fetchCalls: Array<{ url: string; options: any }> = [];

describe("isVerificationSentinel — sentinel detection (#641)", () => {
  it("detects the FinanceSyncBridgeE2E verification sentinel (issue #641 repro)", async () => {
    const { isVerificationSentinel } = await import("@/lib/sentry-helper");
    const reason = isVerificationSentinel({
      name: "RuntimeError",
      message: "FinanceSyncBridgeE2E verification",
    });
    expect(reason).not.toBe("");
    expect(reason.toLowerCase()).toContain("verification");
  });

  it("detects the sibling verification sentinels from the same campaign", async () => {
    const { isVerificationSentinel } = await import("@/lib/sentry-helper");
    expect(
      isVerificationSentinel({ name: "RuntimeError", message: "kanban-verification controlled test event" }),
    ).not.toBe("");
    expect(
      isVerificationSentinel({ name: "RuntimeError", message: "FinanceSyncAlertEngineNatural verification" }),
    ).not.toBe("");
  });

  it("detects the exact \x27test event\x27 phrase in a sentinel message", async () => {
    const { isVerificationSentinel } = await import("@/lib/sentry-helper");
    expect(
      isVerificationSentinel({ name: "RuntimeError", message: "kanban-verification controlled test event" }),
    ).not.toBe("");
  });

  it("returns empty string for real production errors", async () => {
    const { isVerificationSentinel } = await import("@/lib/sentry-helper");
    expect(
      isVerificationSentinel({ name: "TypeError", message: "Cannot read property of undefined" }),
    ).toBe("");
    expect(
      isVerificationSentinel({ name: "Error", message: "foreign key constraint violation" }),
    ).toBe("");
    expect(
      isVerificationSentinel({ name: "Error", message: "failed to verify account balance" }),
    ).toBe("");
  });
});

describe("POST /api/report-error — verification sentinel filter (#641)", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchCalls = [];
    vi.useFakeTimers();
    vi.stubEnv("GITHUB_TOKEN", "test_token_12345");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options: any) => {
        fetchCalls.push({ url, options });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              html_url: "https://github.com/test",
              number: 1,
            }),
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("filters the FinanceSyncBridgeE2E verification sentinel — no GitHub issue created", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: {
          name: "RuntimeError",
          message: "FinanceSyncBridgeE2E verification",
          stack: "RuntimeError: FinanceSyncBridgeE2E verification\\n  at <module> (/app/<string>:6)",
        },
        url: "https://bcm.7rb.nl/",
        timestamp: "2026-08-25T14:42:25Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.filtered).toBe(true);
    expect(body.reason).toBe("verification-sentinel");
    expect(fetchCalls.length).toBe(0);
  });

  it("filters the kanban-verification controlled test event — no GitHub issue created", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: {
          name: "RuntimeError",
          message: "kanban-verification controlled test event",
        },
        url: "https://bcm.7rb.nl/",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filtered).toBe(true);
    expect(body.reason).toBe("verification-sentinel");
    expect(fetchCalls.length).toBe(0);
  });

  it("still creates a GitHub issue for a real production error", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: {
          name: "TypeError",
          message: "Cannot read properties of undefined (reading \x27map\x27)",
        },
        url: "https://bcm.7rb.nl/dashboard",
        timestamp: "2026-08-25T15:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.filtered).toBeUndefined();
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("api.github.com/repos/rbnbrls/bcm/issues");
  });
});

describe("captureError — verification sentinel skip (#641)", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchCalls = [];
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GITHUB_TOKEN", "test_token_12345");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options: any) => {
        fetchCalls.push({ url, options });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              html_url: "https://github.com/test",
              number: 1,
            }),
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips GlitchTip capture and GitHub issue for the FinanceSyncBridgeE2E sentinel", async () => {
    const { captureError } = await import("@/lib/sentry-helper");

    captureError(new Error("FinanceSyncBridgeE2E verification"), {
      route: "/api/health",
      method: "GET",
      phase: "request",
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchCalls.length).toBe(0);
  });

  it("still captures and reports a real production error", async () => {
    const { captureError } = await import("@/lib/sentry-helper");

    captureError(new Error("Cannot read properties of undefined"), {
      route: "/api/dashboard",
      method: "GET",
      phase: "request",
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(fetchCalls[0].url).toContain("api.github.com/repos/rbnbrls/bcm/issues");
  });
});
