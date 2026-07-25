/**
 * Tests for the UpdatesTimeline component utility functions.
 *
 * These pure functions handle commit type classification,
 * author name display, date formatting, hash truncation,
 * and message truncation.
 */
import { describe, it, expect } from "vitest";
import { formatTimeAgo, commitType, authorName, shortSha, truncate } from "@/components/updates-timeline";

describe("commitType", () => {
  it("should classify feat commits", () => {
    expect(commitType("feat: add new feature").label).toBe("Nieuwe functie");
    expect(commitType("feat: add new feature").variant).toBe("feat");
  });

  it("should classify fix commits", () => {
    expect(commitType("fix: resolve bug").label).toBe("Bugfix");
    expect(commitType("fix: resolve bug").variant).toBe("fix");
  });

  it("should classify refactor commits", () => {
    expect(commitType("refactor: clean up code").label).toBe("Verbetering");
    expect(commitType("refactor: clean up code").variant).toBe("refactor");
  });

  it("should classify chore commits", () => {
    expect(commitType("chore: update deps").label).toBe("Onderhoud");
    expect(commitType("chore: update deps").variant).toBe("chore");
  });

  it("should classify docs commits", () => {
    expect(commitType("docs: add readme").label).toBe("Documentatie");
    expect(commitType("docs: add readme").variant).toBe("docs");
  });

  it("should classify perf commits", () => {
    expect(commitType("perf: optimize query").label).toBe("Prestatie");
    expect(commitType("perf: optimize query").variant).toBe("perf");
  });

  it("should classify test commits", () => {
    expect(commitType("test: add unit tests").label).toBe("Test");
    expect(commitType("test: add unit tests").variant).toBe("test");
  });

  it("should classify unknown commit types as Wijziging", () => {
    expect(commitType("random: something").label).toBe("Wijziging");
    expect(commitType("random: something").variant).toBe("other");
  });

  it("should match feat even with scope", () => {
    expect(commitType("feat(api): add endpoint").label).toBe("Nieuwe functie");
  });
});

describe("authorName", () => {
  it("should show robot emoji for Hermes Agent", () => {
    expect(authorName("Hermes Agent")).toBe("🤖 Hermes");
  });

  it("should show Ruben for rbnbrls", () => {
    expect(authorName("rbnbrls")).toBe("Ruben");
  });

  it("should show Ruben for ruben", () => {
    expect(authorName("ruben")).toBe("Ruben");
  });

  it("should return other names as-is", () => {
    expect(authorName("John Doe")).toBe("John Doe");
    expect(authorName("")).toBe("");
  });
});

describe("shortSha", () => {
  it("should return first 7 characters", () => {
    expect(shortSha("abc123def456ghi")).toBe("abc123d");
  });

  it("should handle short strings", () => {
    expect(shortSha("abc")).toBe("abc");
  });
});

describe("truncate", () => {
  it("should not truncate short messages", () => {
    const msg = "Short message";
    expect(truncate(msg)).toBe(msg);
  });

  it("should truncate long messages at word boundary", () => {
    const long = "This is a very long message that should be truncated at word boundary with ellipsis at the end of the line";
    const result = truncate(long, 40);
    expect(result.length).toBeLessThanOrEqual(43); // 40 + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("should not cut in middle of word", () => {
    const msg = "hello world this is a test";
    const result = truncate(msg, 17);
    // Should truncate at word boundary
    expect(result).not.toContain("hello world th…");
    expect(result.endsWith("…")).toBe(true);
  });

  it("should use default max of 80", () => {
    const msg = "a".repeat(100);
    expect(truncate(msg).length).toBeLessThan(100);
    expect(truncate(msg).endsWith("…")).toBe(true);
  });
});

describe("formatTimeAgo", () => {
  it("should return 'zojuist' for very recent time", () => {
    const now = new Date();
    expect(formatTimeAgo(now.toISOString())).toBe("zojuist");
  });

  it("should return '1 minuut geleden' for 1 minute ago", () => {
    const date = new Date(Date.now() - 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("1 minuut geleden");
  });

  it("should return 'X min geleden' for under an hour", () => {
    const date = new Date(Date.now() - 5 * 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("5 min geleden");
  });

  it("should return '1 uur geleden' for 1 hour ago", () => {
    const date = new Date(Date.now() - 60 * 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("1 uur geleden");
  });

  it("should return 'X uur geleden' for under 24 hours", () => {
    const date = new Date(Date.now() - 3 * 60 * 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("3 uur geleden");
  });

  it("should return 'gisteren' for 1 day ago", () => {
    const date = new Date(Date.now() - 24 * 60 * 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("gisteren");
  });

  it("should return 'X dagen geleden' for under a week", () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("3 dagen geleden");
  });

  it("should return '1 week geleden' for exactly 1 week", () => {
    const date = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("1 week geleden");
  });

  it("should return 'X weken geleden' for under 5 weeks", () => {
    const date = new Date(Date.now() - 3 * 7 * 24 * 60 * 60_000);
    expect(formatTimeAgo(date.toISOString())).toBe("3 weken geleden");
  });

  it("should return formatted date for older than 5 weeks", () => {
    // Use a fixed date well in the past
    const date = new Date("2026-01-15T10:00:00Z");
    const result = formatTimeAgo(date.toISOString());
    // Should be "15 jan 2026" or similar (NL format)
    expect(result).toMatch(/\d{1,2} (jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec) \d{4}/);
  });
});
