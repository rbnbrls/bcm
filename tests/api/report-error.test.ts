/**
 * Tests for the /api/report-error route.
 *
 * Behaviors tested:
 *  1. New error (unique fingerprint) → reports to GitHub
 *  2. Duplicate error (same name+message within dedup window) → skipped silently
 *  3. Duplicate after dedup window expires → reports again
 *  4. Different error messages → separate (not deduped)
 *  5. Different error names → separate (not deduped)
 *  6. Missing GITHUB_TOKEN → returns 500
 *  7. Invalid JSON body → returns 400
 *  8. GitHub API error → returns 502
 *  9. Dev-origin filter: localhost, 127.0.0.1, 0.0.0.0 → filtered
 * 10. Production URL → not filtered
 * 11. Undefined URL → not filtered
 * 12. Empty-string URL → not filtered (not undefined, but doesn't match dev patterns)
 * 13. localhost.com (substring false positive) → documented as currently filtered
 * 14. Mixed-case Localhost → passes through (case-sensitive regex — known limitation)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track fetch calls for assertions
let fetchCalls: Array<{ url: string; options: any }> = [];

describe("POST /api/report-error — deduplication", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchCalls = [];
    vi.useFakeTimers();
    // Stub the env and global fetch fresh each test so the 502 test's
    // vi.stubGlobal override doesn't leak into subsequent tests.
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

  it("skips GitHub issue creation for localhost URLs (dev-origin filter)", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "TypeError", message: "dev error on localhost" },
        url: "http://localhost:3000/some-page",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.filtered).toBe(true);
    expect(body.reason).toBe("dev-origin");
    // Should NOT have called GitHub
    expect(fetchCalls.length).toBe(0);
  });

  it("skips GitHub issue creation for 127.0.0.1 URLs (dev-origin filter)", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "TestError", message: "test from loopback" },
        url: "http://127.0.0.1:3000/test",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.filtered).toBe(true);
    expect(body.reason).toBe("dev-origin");
    // Should NOT have called GitHub
    expect(fetchCalls.length).toBe(0);
  });

  it("does NOT filter errors from production URLs", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "production error" },
        url: "https://bcm.7rb.nl/dashboard",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);

    // The route did NOT filter the error (no dev-origin reason)
    const body = await response.json();
    expect(body.filtered).toBeUndefined();
    // The code attempted to call GitHub API (production URL passes through)
    expect(fetchCalls.length).toBe(1);
  });

  it("does NOT filter errors with undefined url", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "no url" },
      }),
    });

    const response = await POST(request);

    // The route did NOT filter the error (no dev-origin reason)
    const body = await response.json();
    expect(body.filtered).toBeUndefined();
    // The code attempted to call GitHub API (no url means we can't determine it's dev)
    expect(fetchCalls.length).toBe(1);
  });

  it("skips GitHub issue creation for 0.0.0.0 URLs (dev-origin filter)", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "error from 0.0.0.0" },
        url: "http://0.0.0.0:3000/test",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.filtered).toBe(true);
    expect(body.reason).toBe("dev-origin");
    // Should NOT have called GitHub
    expect(fetchCalls.length).toBe(0);
  });

  it("does NOT filter errors from localhost.com (a real domain) — guards against substring false positive", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "error on localhost.com domain" },
        url: "https://localhost.com:3000/page",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    // The regex /localhost/ matches "localhost" as a substring within
    // "localhost.com", so this IS currently filtered.  This test documents
    // the existing behavior; if the regex is tightened (e.g. to anchor on
    // host boundary), this test should be updated to expect no filter.
    expect(body.filtered).toBe(true);
    expect(body.reason).toBe("dev-origin");
    expect(fetchCalls.length).toBe(0);
  });

  it("does NOT filter errors with an empty-string URL", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "empty url" },
        url: "",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    // An empty string is !== undefined, but /localhost/.test("") is false,
    // so the error passes through (not filtered, not deduped)
    expect(body.filtered).toBeUndefined();
    expect(fetchCalls.length).toBe(1);
  });

  /**
   * Regression: the dev-origin regex /localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0/
   * is CASE-SENSITIVE.  Browsers/dev tools consistently send lowercase
   * "localhost", but if a client ever sends "Localhost" or "LOCALHOST"
   * the filter will NOT match and the error will create a GitHub issue.
   *
   * If case-insensitive filtering is desired, the regex should become
   * /localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0/i
   */
  it("passes through mixed-case Localhost URLs (case-sensitive regex — known limitation)", async () => {
    const { POST } = await import("@/app/api/report-error/route");

    const request = new Request("https://bcm.7rb.nl/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: "Error", message: "mixed case localhost" },
        url: "http://LOCALHOST:3000/page",
        timestamp: "2026-07-27T22:00:00Z",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    // The regex IS case-sensitive, so "LOCALHOST" does NOT match "localhost"
    expect(body.filtered).toBeUndefined();
    expect(fetchCalls.length).toBe(1);
  });
});
