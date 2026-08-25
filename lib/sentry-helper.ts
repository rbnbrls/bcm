/**
 * Shared Sentry/GlitchTip Error Helper
 *
 * Provides consistent error capture across all API routes, frontend components,
 * and database operations. Captured errors flow through @sentry/nextjs to the
 * configured GlitchTip instance, which then creates GitHub issues via the
 * GlitchTip → GitHub pipeline.
 *
 * Usage:
 *   import { captureError } from "@/lib/sentry-helper";
 *
 *   try { ... } catch (error) {
 *     captureError(error, { route: "/api/health", method: "GET" });
 *     return NextResponse.json({ error: "..." }, { status: 500 });
 *   }
 */

import * as Sentry from "@sentry/nextjs";
import { createGitHubIssue, errorFingerprint } from "@/lib/github-issue-reporter";

/**
 * Enrichment context tag keys used for filtering in GlitchTip:
 *   - route:    API route path (e.g. "/api/changes", "/api/portfolio/[id]")
 *   - method:   HTTP method (GET, POST, PATCH, DELETE)
 *   - endpoint: Alternative to route for non-route contexts (e.g. "db.withTableEnsure")
 *   - phase:    Lifecycle phase (e.g. "request", "db_query", "write_op", "render")
 */
export interface ErrorContext {
  route?: string;
  method?: string;
  endpoint?: string;
  phase?: string;
  skipGithubIssue?: boolean;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Sentinel/verification error filter.
 *
 * Recognizes deliberate, controlled test events that are raised to verify an
 * error-monitoring pipeline end-to-end (e.g. "FinanceSyncBridgeE2E
 * verification", "kanban-verification controlled test event").  These are NOT
 * production defects — they are proof-of-life events and must never become
 * GitHub bug issues (issue #641: a sentinel RuntimeError flowed through
 * GlitchTip → bridge → GitHub and was filed as a bug).
 *
 * Returns a non-empty reason string when the error IS a verification
 * sentinel, or an empty string for real errors.
 */
export function isVerificationSentinel(error: {
  name: string;
  message: string;
}): string {
  const message = (error.message || "").toLowerCase();

  // Message markers used by kanban/monitoring verification campaigns
  // (e.g. "FinanceSyncBridgeE2E verification", "kanban-verification
  // controlled test event", "FinanceSyncAlertEngineNatural verification").
  // Deliberately narrow: "verification" as a standalone marker or the
  // explicit "test event" phrase — a bare word "test" inside a real error
  // message must NOT trip the filter. The error name is NOT used (TestError
  // is a common fixture name in this repo's tests).
  if (message.includes("verification")) return "Verification/sentinel event (message contains 'verification')";
  if (message.includes("test event")) return "Verification/sentinel event (message contains 'test event')";

  return "";
}

/**
 * Capture an error in Sentry/GlitchTip with contextual tags, then log to console.
 *
 * In development/test mode, only logs to console (avoids noise in dev).
 * In production, sends to GlitchTip which creates GitHub issues via the poller.
 *
 * @param error  - The error to capture (Error, string, or unknown)
 * @param context - Optional context tags for filtering in GlitchTip
 */
export function captureError(error: unknown, context?: ErrorContext): void {
  // Build a stable message for console logging
  const prefix = context?.route || context?.endpoint || "app";
  const method = context?.method ? ` ${context.method}` : "";
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(`[${prefix}${method}] ${errorMessage}`, error instanceof Error ? error.stack || "" : "");

  // Verification/sentinel events (issue #641) are deliberate controlled test
  // events, not production defects — never capture them to GlitchTip and
  // never file them as GitHub bug issues. Log to console only.
  if (error instanceof Error && isVerificationSentinel({ name: error.name, message: error.message })) {
    console.info(`[sentry-helper] Skipping verification/sentinel error: ${error.name}: ${errorMessage.slice(0, 120)}`);
    return;
  }

  // Skip Sentry in dev/test to avoid noise
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) {
          scope.setExtra(key, value);
        }
      }
    }
    scope.setTag("handled", "true");
    Sentry.captureException(error);
  });

  if (!context?.skipGithubIssue) {
    const title = `[GlitchTip] ${prefix}${method}: ${errorMessage.slice(0, 120)}`;
    const body = [
      "## GlitchTip error",
      "",
      `**Context:** ${prefix}${method}`,
      `**Phase:** ${context?.phase ?? "unknown"}`,
      `**Message:** ${errorMessage}`,
      `**Tijd:** ${new Date().toISOString()}`,
      "",
      context
        ? `### Tags\n\`\`\`json\n${JSON.stringify(context, null, 2).slice(0, 2000)}\n\`\`\``
        : "",
      error instanceof Error && error.stack
        ? `### Stack trace\n\`\`\`\n${error.stack.slice(0, 2000)}\n\`\`\``
        : "",
      "",
      "---",
      "*Automatisch aangemaakt via GlitchTip closed-loop monitor.*",
    ].filter(Boolean).join("\n");

    void createGitHubIssue({
      title,
      body,
      labels: ["bug", "glitchtip"],
      fingerprint: errorFingerprint(error, `glitchtip:${prefix}:${context?.phase ?? ""}`),
    }).then((result) => {
      if (!result.ok && result.reason !== "not_production" && result.reason !== "missing_token") {
        console.error(`[github-issue] Failed to create GlitchTip issue: ${result.reason}`, result.message ?? result.status ?? "");
      }
    });
  }
}

/**
 * Higher-order function that wraps an async API route handler with automatic
 * error capture. Use this when you want Sentry to report caught exceptions
 * but you handle the response yourself.
 *
 * @param route    - API route path identifier (e.g. "/api/changes")
 * @param method   - HTTP method (GET, POST, etc.)
 * @param handler  - Async function that returns a NextResponse
 * @returns        - The handler wrapped with error logging
 */
export function withErrorCapture<T>(
  route: string,
  method: string,
  handler: () => Promise<T>,
): Promise<T>;

export function withErrorCapture<T>(
  route: string,
  method: string,
  handler: () => Promise<T>,
): Promise<T> {
  return handler().catch((error) => {
    captureError(error, { route, method, phase: "request" });
    throw error; // Re-throw so the route's outer catch can send the response
  });
}
