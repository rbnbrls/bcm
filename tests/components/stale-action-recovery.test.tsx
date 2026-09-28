// @vitest-environment jsdom
/**
 * Regression tests for StaleActionRecovery (issue #293).
 *
 * The component must:
 * 1. Not interfere with normal fetch traffic (pass-through).
 * 2. Detect the exact "server action not found" contract:
 *    server-action POST (Next-Action header) -> 404 + x-nextjs-action-not-found: 1.
 * 3. On detection: show the banner and schedule exactly ONE auto-reload
 *    per session (sessionStorage guard), so a tab that keeps failing cannot
 *    enter a reload loop.
 * 4. After the guard is set, keep showing the banner (manual reload) but
 *    never auto-reload again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  StaleActionRecovery,
  isStaleActionResponse,
} from "@/components/stale-action-recovery";

describe("isStaleActionResponse — pure detection", () => {
  it("detects the exact server 404 contract", () => {
    const res = new Response("Server action not found.", {
      status: 404,
      headers: { "x-nextjs-action-not-found": "1" },
    });
    expect(isStaleActionResponse(res)).toBe(true);
  });

  it("does not flag a plain 404", () => {
    const res = new Response("nope", { status: 404 });
    expect(isStaleActionResponse(res)).toBe(false);
  });

  it("does not flag a 200 response with the header", () => {
    const res = new Response("ok", {
      status: 200,
      headers: { "x-nextjs-action-not-found": "1" },
    });
    expect(isStaleActionResponse(res)).toBe(false);
  });

  it("does not flag unrelated errors (500)", () => {
    const res = new Response("boom", {
      status: 500,
      headers: { "x-nextjs-action-not-found": "1" },
    });
    expect(isStaleActionResponse(res)).toBe(false);
  });
});

describe("StaleActionRecovery — fetch interception", () => {
  const RELOAD_GUARD_KEY = "bcm:stale-action-reload";

  function staleResponse(): Response {
    return new Response("Server action not found.", {
      status: 404,
      headers: { "x-nextjs-action-not-found": "1" },
    });
  }

  function okResponse(): Response {
    return new Response("{}", { status: 200 });
  }

  /** Count only the recovery's auto-reload timer (1500ms), not React internals. */
  function scheduledReloads(): number {
    const calls = (window.setTimeout as ReturnType<typeof vi.spyOn>).mock.calls;
    return calls.filter((call: unknown[]) => call[1] === 1500).length;
  }

  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(window, "setTimeout");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore the original fetch for the next test.
    delete (window as unknown as { fetch: unknown }).fetch;
  });

  it("passes through non-action traffic untouched", async () => {
    const originalFetch = vi.fn().mockResolvedValue(okResponse());
    window.fetch = originalFetch as unknown as typeof fetch;

    render(<StaleActionRecovery />);

    const res = await window.fetch("https://bcm.7rb.nl/api/health");
    expect(res.status).toBe(200);
    expect(originalFetch).toHaveBeenCalledWith(
      "https://bcm.7rb.nl/api/health",
      undefined,
    );
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    expect(scheduledReloads()).toBe(0);
  });

  it("shows the banner and schedules one reload on a stale action response", async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(staleResponse()) as unknown as typeof fetch;

    render(<StaleActionRecovery />);

    const res = await window.fetch("https://bcm.7rb.nl/admin/client-config", {
      method: "POST",
      headers: { "Next-Action": "60ecdb2f38e90789b77ad03af50ad209e41b98267e" },
    });

    expect(res.status).toBe(404);
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
    expect(screen.getByRole("status").textContent).toContain(
      "de pagina wordt herladen",
    );
    expect(scheduledReloads()).toBe(1);
    expect(sessionStorage.getItem(RELOAD_GUARD_KEY)).toBe("1");
  });

  it("does not reload on a stale response without the Next-Action header", async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(staleResponse()) as unknown as typeof fetch;

    render(<StaleActionRecovery />);

    // Same 404 contract but a plain navigation-style request
    await window.fetch("https://bcm.7rb.nl/admin/client-config", {
      method: "GET",
    });

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
    expect(scheduledReloads()).toBe(0);
    expect(sessionStorage.getItem(RELOAD_GUARD_KEY)).toBeNull();
  });

  it("never auto-reloads twice within a session", async () => {
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    window.fetch = vi
      .fn()
      .mockResolvedValue(staleResponse()) as unknown as typeof fetch;

    render(<StaleActionRecovery />);

    await window.fetch("https://bcm.7rb.nl/admin/client-config", {
      method: "POST",
      headers: { "Next-Action": "60ecdb2f38e90789b77ad03af50ad209e41b98267e" },
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });
    // Banner stays (manual reload offered) but no new auto-reload scheduled
    expect(screen.getByRole("status").textContent).toContain("herlaad de pagina");
    expect(scheduledReloads()).toBe(0);
  });

  it("manual reload button always reloads", async () => {
    window.fetch = vi
      .fn()
      .mockResolvedValue(staleResponse()) as unknown as typeof fetch;
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadSpy },
      writable: true,
    });

    render(<StaleActionRecovery />);

    await window.fetch("https://bcm.7rb.nl/admin/client-config", {
      method: "POST",
      headers: { "Next-Action": "60ecdb2f38e90789b77ad03af50ad209e41b98267e" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /herladen/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /herladen/i }));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
