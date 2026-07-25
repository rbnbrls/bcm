/**
 * Tests for the /api/commits route.
 *
 * Tests successful response, error handling, and response shape.
 * Note: fetchRecentCommits catches its own errors and returns [] —
 * the API only returns 502 for unexpected routing errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MOCK_COMMITS = [
  {
    sha: "abc123def456",
    commit: {
      message: "feat: add new feature",
      author: { date: "2026-07-24T10:00:00Z", name: "rbnbrls" },
    },
  },
];

describe("GET /api/commits", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should return commits on successful fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MOCK_COMMITS), { status: 200 })
    );

    const { GET } = await import("@/app/api/commits/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commits).toHaveLength(1);
    expect(body.commits[0].sha).toBe("abc123def456");
    expect(body.commits[0].message).toBe("feat: add new feature");
    expect(body.commits[0].author).toBe("rbnbrls");
    expect(body.commits[0].date).toBe("2026-07-24T10:00:00Z");
  });

  it("should return empty commits array on GitHub API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Rate Limited", { status: 403, statusText: "Forbidden" })
    );

    const { GET } = await import("@/app/api/commits/route");
    const response = await GET();
    const body = await response.json();

    // fetchRecentCommits catches errors internally and returns []
    expect(response.status).toBe(200);
    expect(body.commits).toEqual([]);
  });

  it("should return empty commits array on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network failure")
    );

    const { GET } = await import("@/app/api/commits/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commits).toEqual([]);
  });

  it("should sort commits by date descending", async () => {
    const unsorted = [
      {
        sha: "old",
        commit: {
          message: "old commit",
          author: { date: "2026-07-20T10:00:00Z", name: "rbnbrls" },
        },
      },
      {
        sha: "new",
        commit: {
          message: "new commit",
          author: { date: "2026-07-25T10:00:00Z", name: "rbnbrls" },
        },
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(unsorted), { status: 200 })
    );

    const { GET } = await import("@/app/api/commits/route");
    const response = await GET();
    const body = await response.json();

    expect(body.commits[0].sha).toBe("new");
    expect(body.commits[1].sha).toBe("old");
  });
});
