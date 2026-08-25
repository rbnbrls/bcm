/**
 * Client-side error reporting endpoint.
 *
 * Captures unhandled front-end errors and creates a GitHub Issue so errors
 * are visible even when Sentry is not configured.  Works as a fallback /
 * complement to Sentry (GlitchTip).
 *
 * Usage: POST /api/report-error
 * Body:  { error: { name, message, stack, componentStack? }, url, timestamp }
 *
 * Requires GITHUB_TOKEN env var (set in Coolify).
 *
 * Deduplication: the same error (name + message) is reported at most once
 * per DEDUP_WINDOW_MS (default 1 hour) to avoid flooding the issue tracker.
 */

import { NextResponse } from "next/server";
import { errorReportSchema } from "@/lib/schemas";
import { captureError, isVerificationSentinel } from "@/lib/sentry-helper";

export const dynamic = "force-dynamic";

/** Dedup window: 1 hour */
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * In-memory dedup cache.
 * Key: fingerprint (error.name + ":" + error.message)
 * Value: timestamp of last report
 * Purged entries older than DEDUP_WINDOW_MS are treated as new.
 */
const recentErrors = new Map<string, number>();

/**
 * Generate a dedup fingerprint from an error report.
 */
function fingerprint(error: { name: string; message: string }): string {
  return `${error.name}:${error.message}`;
}

/**
 * Check if this error has been reported recently (within DEDUP_WINDOW_MS).
 * If not, record it and return false. If yes, return true.
 */
function isDuplicate(error: { name: string; message: string }): boolean {
  const key = fingerprint(error);
  const now = Date.now();
  const lastReported = recentErrors.get(key);

  if (lastReported !== undefined && now - lastReported < DEDUP_WINDOW_MS) {
    return true;
  }

  recentErrors.set(key, now);
  // Simple housekeeping: remove entries older than the window
  recentErrors.forEach((v, k) => {
    if (now - v > DEDUP_WINDOW_MS * 2) {
      recentErrors.delete(k);
    }
  });

  return false;
}

export async function POST(request: Request) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "GitHub token not configured" },
      { status: 500 },
    );
  }

  let report;
  try {
    const body = await request.json();
    const parsed = errorReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Validation error",
          errors: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }
    report = parsed.data;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { error, url, timestamp } = report;

  // Dedup: skip if this exact error was reported within the last hour
  if (isDuplicate(error)) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  // Skip GitHub issue creation for verification/sentinel events (issue #641).
  // Deliberate, controlled test events raised to verify the monitoring
  // pipeline end-to-end (e.g. "FinanceSyncBridgeE2E verification") are NOT
  // production defects and must never be filed as GitHub bug issues.
  const sentinelReason = isVerificationSentinel(error);
  if (sentinelReason) {
    console.info(
      `Skipped GitHub issue for verification/sentinel error: ${error.name}: ${error.message.slice(0, 120)} — ${sentinelReason}`,
    );
    return NextResponse.json({
      ok: true,
      filtered: true,
      reason: "verification-sentinel",
    });
  }

  // Skip GitHub issue creation for errors from local/dev origins (localhost,
  // 127.0.0.1, 0.0.0.0).  These can come from E2E tests, Playwright runs, or
  // synthetic validation tests — they are not production errors and would only
  // create noise in the issue tracker.
  const isDevOrigin =
    url !== undefined &&
    /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
  if (isDevOrigin) {
    console.info(
      `Skipped GitHub issue for dev-origin error: ${error.name}: ${error.message.slice(0, 120)} @ ${url}`,
    );
    return NextResponse.json({
      ok: true,
      filtered: true,
      reason: "dev-origin",
    });
  }

  const title = `[Frontend Error] ${error.name}: ${error.message.slice(0, 120)}`;
  const body = [
    `## 🐛 Front-end foutrapport`,
    ``,
    `**Type:** ${error.name}`,
    `**Message:** ${error.message}`,
    `**URL:** ${url ?? "onbekend"}`,
    `**Tijd:** ${timestamp ?? new Date().toISOString()}`,
    ``,
    error.stack
      ? `### Stack trace\n\`\`\`\n${error.stack.slice(0, 2000)}\n\`\`\``
      : "",
    error.componentStack
      ? `### Component stack\n\`\`\`\n${error.componentStack}\n\`\`\``
      : "",
    ``,
    `---`,
    `*Automatisch aangemaakt via front-end error monitor op bcm.7rb.nl*`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch(
      "https://api.github.com/repos/rbnbrls/bcm/issues",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body,
          labels: ["bug", "frontend"],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      captureError(new Error(`GitHub API ${response.status}: ${errorText.slice(0, 500)}`), {
        route: "/api/report-error",
        method: "POST",
        phase: "github_api",
        statusCode: response.status,
      });
      return NextResponse.json(
        { ok: false, message: `GitHub API error: ${response.status}` },
        { status: 502 },
      );
    }

    const issue = (await response.json()) as { html_url: string; number: number };
    console.info(`Created GitHub issue #${issue.number}: ${title}`);
    return NextResponse.json({ ok: true, url: issue.html_url, number: issue.number });
  } catch (error) {
    captureError(error, { route: "/api/report-error", method: "POST", phase: "request" });
    console.error("Report-error API error:", error);
    return NextResponse.json(
      { ok: false, message: "Failed to create GitHub issue" },
      { status: 500 },
    );
  }
}
