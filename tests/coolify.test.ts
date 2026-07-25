/**
 * Tests for the Coolify API client module.
 *
 * Covers status mapping, no-token degradation, and network error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapStatus, getCoolifyStatus } from "@/lib/coolify";

describe("mapStatus", () => {
  it("should return unknown for null input", () => {
    const result = mapStatus(null);
    expect(result.level).toBe("unknown");
    expect(result.label).toBe("Onbekend");
    expect(result.deploying).toBe(false);
  });

  it("should return green for 'running'", () => {
    const result = mapStatus("running");
    expect(result.level).toBe("green");
    expect(result.label).toBe("Online");
    expect(result.deploying).toBe(false);
  });

  it("should return green for 'running:running'", () => {
    const result = mapStatus("running:running");
    expect(result.level).toBe("green");
    expect(result.label).toBe("Online");
  });

  it("should return green for 'running:healthy'", () => {
    const result = mapStatus("running:healthy");
    expect(result.level).toBe("green");
    expect(result.label).toBe("Online");
  });

  it("should return green for 'healthy'", () => {
    const result = mapStatus("healthy");
    expect(result.level).toBe("green");
  });

  it("should return amber for deploying status", () => {
    const result = mapStatus("deploying");
    expect(result.level).toBe("amber");
    expect(result.label).toBe("Bezig met deployen");
    expect(result.deploying).toBe(true);
  });

  it("should return amber for building status", () => {
    const result = mapStatus("building");
    expect(result.level).toBe("amber");
    expect(result.deploying).toBe(true);
  });

  it("should return amber for 'in_progress'", () => {
    const result = mapStatus("in_progress");
    expect(result.level).toBe("amber");
    expect(result.deploying).toBe(true);
  });

  it("should return amber for 'running:unknown'", () => {
    const result = mapStatus("running:unknown");
    expect(result.level).toBe("amber");
    expect(result.label).toBe("Stabiel");
  });

  it("should return amber for 'starting'", () => {
    const result = mapStatus("starting");
    expect(result.level).toBe("amber");
    expect(result.label).toBe("Stabiel");
  });

  it("should return red for 'exited'", () => {
    const result = mapStatus("exited");
    expect(result.level).toBe("red");
    expect(result.label).toBe("Offline");
  });

  it("should return red for 'stopped'", () => {
    const result = mapStatus("stopped");
    expect(result.level).toBe("red");
  });

  it("should return red for 'degraded'", () => {
    const result = mapStatus("degraded");
    expect(result.level).toBe("red");
  });

  it("should return red for 'unhealthy'", () => {
    const result = mapStatus("unhealthy");
    expect(result.level).toBe("red");
  });

  it("should return amber catch-all for unknown status strings", () => {
    const result = mapStatus("some-random-status");
    expect(result.level).toBe("amber");
    expect(result.label).toBe("Onbekend");
  });
});

describe("getCoolifyStatus — no token", () => {
  beforeEach(() => {
    delete process.env.COOLIFY_API_TOKEN;
  });

  it("should return degraded status when COOLIFY_API_TOKEN is not set", async () => {
    const result = await getCoolifyStatus();
    expect(result.level).toBe("unknown");
    expect(result.raw).toBe("unconfigured");
    expect(result.label).toBe("Niet geconfigureerd");
    expect(result.deploying).toBe(false);
  });
});

describe("getCoolifyStatus — with token", () => {
  beforeEach(() => {
    process.env.COOLIFY_API_TOKEN = "test-token";
    process.env.COOLIFY_HOST = "http://test-coolify:8000";
    process.env.COOLIFY_APP_UUID = "test-uuid";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return healthy status on successful API response", async () => {
    const mockResponse = { status: "running:healthy" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await getCoolifyStatus();
    expect(result.level).toBe("green");
    expect(result.label).toBe("Online");
    expect(result.deploying).toBe(false);
  });

  it("should handle API error status codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404, statusText: "Not Found" })
    );

    const result = await getCoolifyStatus();
    expect(result.level).toBe("unknown");
    expect(result.raw).toContain("error");
    expect(result.label).toBe("Fout bij ophalen");
  });

  it("should handle network errors gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network failure")
    );

    const result = await getCoolifyStatus();
    expect(result.level).toBe("unknown");
    expect(result.raw).toBe("unreachable");
    expect(result.label).toBe("Niet bereikbaar");
  });

  it("should include auth header in request", async () => {
    const mockFn = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "running" }), { status: 200 })
      );

    await getCoolifyStatus();

    const callUrl = mockFn.mock.calls[0][0] as string;
    const callOpts = mockFn.mock.calls[0][1] as RequestInit;
    expect(callUrl).toContain("test-coolify");
    expect(callUrl).toContain("test-uuid");
    expect(callOpts.headers).toBeDefined();
  });
});
