/**
 * Tests for the /api/report-error route.
 *
 * Three scenarios:
 * 1. New error (unique fingerprint) → reports to GitHub
 * 2. Duplicate error (same name+message within dedup window) → skipped silently
 * 3. Missing GITHUB_TOKEN → returns 500
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track fetch calls for assertions
let fetchCalls: Array<{ url: string; options: any }> = [];

vi.stubGlobal("fetch", vi.fn((url: string, options: any) => {
  fetchCalls.push({ url, options });
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ html_url: "https://github.com/test", number: 1 }),
  });
}));

describe("POST /api/report-error — deduplication", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchCalls = [];
    vi.useFakeTimers();
    // Set the env var so the route doesn't bail early
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_12345");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports a new error to GitHub", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "TypeError", message: "Cannot read property of undefined" },
        url: "https://bcm.7rb.nl/dashboard",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("api.github.com/repos/rbnbrls/bcm/issues");
  });

  it("skips a duplicate error within the dedup window (same name + message)", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const errorPayload = {
      error: { name: "TestError", message: "validation-test-t_233438bf" },
      url: "https://bcm.7rb.nl/",
      timestamp: "2026-07-27T22:30:00Z",
    };

    // First report — should go through
    const request1 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorPayload),
    });
    const response1 = await POST(request1);
    const body1 = await response1.json();

    expect(response1.status).toBe(200);
    expect(body1.ok).toBe(true);
    expect(fetchCalls.length).toBe(1);

    // Second report with same error — should be skipped (dedup)
    const request2 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorPayload),
    });
    const response2 = await POST(request2);
    const body2 = await response2.json();

    expect(response2.status).toBe(200);
    expect(body2.ok).toBe(true);
    // Should NOT have called GitHub again
    expect(fetchCalls.length).toBe(1);
    expect(body2.deduplicated).toBe(true);
  });

  it("reports the same error again after the dedup window expires", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const errorPayload = {
      error: { name: "TypeError", message: "x is undefined" },
      url: "https://bcm.7rb.nl/",
      timestamp: "2026-07-27T22:00:00Z",
    };

    // First report
    const request1 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorPayload),
    });
    await POST(request1);
    expect(fetchCalls.length).toBe(1);

    // Advance time past the dedup window (3600 seconds = 1 hour)
    vi.advanceTimersByTime(3600_001);

    // Second report — should go through since window expired
    const request2 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorPayload),
    });
    const response2 = await POST(request2);
    const body2 = await response2.json();

    expect(response2.status).toBe(200);
    expect(body2.ok).toBe(true);
    // Should have called GitHub again
    expect(fetchCalls.length).toBe(2);
    expect(body2.deduplicated).toBeUndefined();
  });

  it("treats different error messages as separate (not deduplicated)", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const error1 = {
      error: { name: "TypeError", message: "x is undefined" },
      url: "https://bcm.7rb.nl/",
      timestamp: "2026-07-27T22:00:00Z",
    };
    const error2 = {
      error: { name: "TypeError", message: "y is undefined" },
      url: "https://bcm.7rb.nl/",
      timestamp: "2026-07-27T22:00:00Z",
    };

    const req1 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(error1),
    });
    const req2 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(error2),
    });

    await POST(req1);
    await POST(req2);

    expect(fetchCalls.length).toBe(2);
  });

  it("treats different error names as separate (not deduplicated)", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const error1 = {
      error: { name: "TypeError", message: "x is undefined" },
      url: "https://bcm.7rb.nl/",
      timestamp: "2026-07-27T22:00:00Z",
    };
    const error2 = {
      error: { name: "ReferenceError", message: "x is undefined" },
      url: "https://bcm.7rb.nl/",
      timestamp: "2026-07-27T22:00:00Z",
    };

    const req1 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(error1),
    });
    const req2 = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(error2),
    });

    await POST(req1);
    await POST(req2);

    expect(fetchCalls.length).toBe(2);
  });

  it("returns 500 when GITHUB_TOKEN is not configured", async () => {
    vi.stubEnv("GITHUB_TOKEN", undefined);

    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "something broke" },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("returns 502 when GitHub API returns an error", async () => {
    // Override fetch to return error for this test
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Bad credentials"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "test" },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
  });
});
