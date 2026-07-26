/**
 * Tests for the GitHub API client module.
 *
 * Covers commit fetching, sorting, authentication, and error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchRecentCommits } from "@/lib/github";

const MOCK_COMMITS = [
  {
    sha: "abc123def456",
    commit: {
      message: "feat: add new feature",
      author: { date: "2026-07-24T10:00:00Z", name: "rbnbrls" },
    },
  },
  {
    sha: "def789abc012",
    commit: {
      message: "fix: resolve bug",
      author: { date: "2026-07-25T10:00:00Z", name: "Hermes Agent" },
    },
  },
  {
    sha: "ghi345jkl678",
    commit: {
      message: "chore: update deps",
      author: { date: "2026-07-23T10:00:00Z", name: "ruben" },
    },
  },
];

describe("fetchRecentCommits", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should return commits from GitHub API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_COMMITS), { status: 200 })
    );

    const result = await fetchRecentCommits();
    expect(result).toHaveLength(3);
    expect(result[0].sha).toBe("def789abc012"); // most recent first (2026-07-25)
    expect(result[0].commit.author.name).toBe("Hermes Agent");
  });

  it("should use GITHUB_TOKEN as Bearer token when available", async () => {
    vi.stubEnv("GITHUB_TOKEN", "my-secret-token");
    const mockFn = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(MOCK_COMMITS), { status: 200 })
      );

    await fetchRecentCommits();

    const opts = mockFn.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer my-secret-token");
  });

  it("should not send Authorization header when token is not set", async () => {
    const mockFn = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(MOCK_COMMITS), { status: 200 })
      );

    await fetchRecentCommits();

    const opts = mockFn.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("should sort commits by date descending (most recent first)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_COMMITS), { status: 200 })
    );

    const result = await fetchRecentCommits();
    expect(result[0].commit.author.date).toBe("2026-07-25T10:00:00Z"); // most recent first
    expect(result[1].commit.author.date).toBe("2026-07-24T10:00:00Z");
    expect(result[2].commit.author.date).toBe("2026-07-23T10:00:00Z");
  });

  it("should return empty array on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403, statusText: "Forbidden" })
    );

    const result = await fetchRecentCommits();
    expect(result).toEqual([]);
  });

  it("should return empty array on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network error")
    );

    const result = await fetchRecentCommits();
    expect(result).toEqual([]);
  });

  it("should request all commits (per_page=100)", async () => {
    const mockFn = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      );

    await fetchRecentCommits();

    const url = mockFn.mock.calls[0][0] as string;
    expect(url).toContain("per_page=100");
    expect(url).toContain("rbnbrls/bcm");
  });
});
