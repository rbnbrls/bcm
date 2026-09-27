/**
 * Regression tests for the getCoolifyStatus 401 Unauthorized path
 * (GitHub issue #619, GlitchTip error "Coolify API error: 401 Unauthorized").
 *
 * The production Coolify API returned HTTP 401 {"message":"Unauthenticated."}
 * because the app env held a stale/revoked COOLIFY_API_TOKEN. These tests pin
 * the contract that must hold whenever Coolify answers 401:
 *
 *  1. getCoolifyStatus must NOT throw / crash the caller (the route returns a
 *     controlled degraded status instead of an unhandled exception).
 *  2. captureError must be called with the GlitchTip context values:
 *     endpoint "getCoolifyStatus", phase "coolify_api", coolifyStatus 401.
 *  3. The captured error message must be diagnosable: it must include the
 *     HTTP status AND the Coolify response body (e.g. {"message":"Unauthenticated."}),
 *     so a future 401 cannot be mistaken for a generic outage.
 *
 * Tests 1–2 pass against the current implementation; test 3 fails until the
 * error path is improved to include the response body (see kanban task
 * t_995d1056 "Implement fix for Coolify API authentication in getCoolifyStatus").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCaptureError } = vi.hoisted(() => ({ mockCaptureError: vi.fn() }));

vi.mock("@/lib/sentry-helper", () => ({
  captureError: mockCaptureError,
}));

import { getCoolifyStatus } from "@/lib/coolify";

const COOLIFY_401_BODY = JSON.stringify({ message: "Unauthenticated." });

describe("getCoolifyStatus — 401 Unauthorized (regression #619)", () => {
  beforeEach(() => {
    vi.stubEnv("COOLIFY_API_TOKEN", "test-token");
    vi.stubEnv("COOLIFY_HOST", "http://test-coolify:8000");
    vi.stubEnv("COOLIFY_APP_UUID", "test-uuid");
    mockCaptureError.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not crash the caller: returns a controlled degraded status instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(COOLIFY_401_BODY, { status: 401, statusText: "Unauthorized" })
    );

    let result;
    let threw = false;
    try {
      result = await getCoolifyStatus();
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toEqual({
      level: "unknown",
      raw: "error:401",
      label: "Fout bij ophalen",
      deploying: false,
    });
  });

  it("captures the error with the GlitchTip context (endpoint getCoolifyStatus, phase coolify_api, coolifyStatus 401)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(COOLIFY_401_BODY, { status: 401, statusText: "Unauthorized" })
    );

    await getCoolifyStatus();

    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    const [err, context] = mockCaptureError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(context).toEqual(
      expect.objectContaining({
        endpoint: "getCoolifyStatus",
        phase: "coolify_api",
        coolifyStatus: 401,
      })
    );
  });

  it("captures a diagnosable error message including HTTP status and the Coolify response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(COOLIFY_401_BODY, { status: 401, statusText: "Unauthorized" })
    );

    await getCoolifyStatus();

    const [err] = mockCaptureError.mock.calls[0];
    const message = err instanceof Error ? err.message : String(err);
    expect(message).toContain("401");
    // The response body must be included so a 401 (stale token) is
    // distinguishable from a generic outage (issue #619).
    expect(message).toContain("Unauthenticated.");
  });
});
