/**
 * Tests for the /api/coolify-status route.
 *
 * Note: getCoolifyStatus catches its own errors and returns status objects —
 * the route handler catches only unexpected errors for the 502 path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GET /api/coolify-status", () => {
  beforeEach(() => {
    vi.stubEnv("COOLIFY_API_TOKEN", "test-token");
    vi.stubEnv("COOLIFY_HOST", "http://test-coolify:8000");
    vi.stubEnv("COOLIFY_APP_UUID", "test-uuid");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should return status on successful fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "running:healthy" }), { status: 200 })
    );

    const { GET } = await import("@/app/api/coolify-status/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status.level).toBe("green");
    expect(body.status.label).toBe("Online");
    expect(body.status.deploying).toBe(false);
  });

  it("should return amber for deploying status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "deploying" }), { status: 200 })
    );

    const { GET } = await import("@/app/api/coolify-status/route");
    const response = await GET();
    const body = await response.json();

    expect(body.status.level).toBe("amber");
    expect(body.status.label).toBe("Bezig met deployen");
    expect(body.status.deploying).toBe(true);
  });

  it("should return red for exited status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "exited" }), { status: 200 })
    );

    const { GET } = await import("@/app/api/coolify-status/route");
    const response = await GET();
    const body = await response.json();

    expect(body.status.level).toBe("red");
    expect(body.status.label).toBe("Offline");
  });

  it("should return error status on API error (not 502, caught internally)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );

    const { GET } = await import("@/app/api/coolify-status/route");
    const response = await GET();
    const body = await response.json();

    // getCoolifyStatus catches the 404 and returns an error status
    expect(response.status).toBe(200);
    expect(body.status.level).toBe("unknown");
    expect(body.status.raw).toContain("error");
  });

  it("should return unreachable status on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network failure")
    );

    const { GET } = await import("@/app/api/coolify-status/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status.level).toBe("unknown");
    expect(body.status.raw).toBe("unreachable");
  });

  it("should be force-dynamic (no caching)", async () => {
    const mod = await import("@/app/api/coolify-status/route");
    expect((mod as any).dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/coolify-status — degraded (no token)", () => {
  beforeEach(() => {
    vi.stubEnv("COOLIFY_API_TOKEN", "");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return degraded status when COOLIFY_API_TOKEN is not set", async () => {
    const { GET } = await import("@/app/api/coolify-status/route");
    const response = await GET();
    const body = await response.json();

    expect(body.status.level).toBe("unknown");
    expect(body.status.label).toBe("Niet geconfigureerd");
  });
});
