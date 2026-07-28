/**
 * Server-side error reporter for database and form-submission errors.
 *
 * Logs errors to GlitchTip (via Sentry SDK) and creates a GitHub Issue
 * so database constraint violations and other server errors are tracked
 * and visible without manual reporting.
 *
 * Flow:
 *   1. Server action catch block calls reportError()
 *   2. Error is sent to Sentry/GlitchTip via captureError()
 *   3. A GitHub Issue is created directly (with 1-hour dedup)
 *   4. The GlitchTip bridge also picks up the error from GlitchTip and
 *      creates an issue — this function creates one immediately for
 *      zero-delay visibility.
 *
 * Deduplication prevents flooding the issue tracker with repeated
 * occurrences of the same error within a 1-hour window.
 */

import { captureError } from "./sentry-helper";

const GITHUB_OWNER = "rbnbrls";
const GITHUB_REPO = "bcm";

/** Dedup window: 1 hour */
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * In-memory dedup cache (server-side only — resets on process restart).
 * Key: fingerprint (error name + first 200 chars of message)
 * Value: timestamp of last report
 */
const recentErrors = new Map<string, number>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function fingerprint(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}:${error.message.slice(0, 200)}`;
  }
  return `unknown:${String(error).slice(0, 200)}`;
}

function isDuplicate(fp: string): boolean {
  const now = Date.now();
  const lastReported = recentErrors.get(fp);
  if (lastReported !== undefined && now - lastReported < DEDUP_WINDOW_MS) {
    return true;
  }
  recentErrors.set(fp, now);
  // Purge entries older than 2× the window
  for (const [key, ts] of recentErrors) {
    if (now - ts > DEDUP_WINDOW_MS * 2) recentErrors.delete(key);
  }
  return false;
}

function isProduction(): boolean {
  return (
    process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test"
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ErrorReportContext {
  /** Short kebab-case action name (e.g. "create-benchmark-change") */
  action: string;
  /** The user-facing error message returned to the client */
  userMessage?: string;
  /** Optional label to apply to the GitHub issue (default: "database") */
  label?: string;
  /** Extra tags to pass to captureError */
  tags?: Record<string, string | number | boolean | undefined>;
}

/**
 * Report an error to GlitchTip and create a GitHub Issue.
 *
 * Call this from server action catch blocks *before* returning the
 * user-facing error state. It is safe to call in development/test
 * (GitHub issue creation is skipped; GlitchTip logging is skipped
 * by captureError in dev/test).
 *
 * @example
 *   try { ... } catch (error) {
 *     await reportError(error, { action: "create-benchmark-change" });
 *     return { issues: ["De change kon niet worden opgeslagen."] };
 *   }
 */
export async function reportError(
  error: unknown,
  context: ErrorReportContext,
): Promise<void> {
  // 1. Always log to GlitchTip via Sentry (skipped in dev/test by captureError)
  captureError(error, {
    endpoint: `server-action.${context.action}`,
    phase: "db_write",
    userMessage: context.userMessage ?? "",
    ...context.tags,
  });

  // 2. Create GitHub Issue (production only, with dedup)
  if (!isProduction()) return;

  const fp = fingerprint(error);
  if (isDuplicate(fp)) {
    console.debug(`[error-reporter] Duplicate error, skipping GitHub issue: ${fp.slice(0, 100)}`);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[error-reporter] GITHUB_TOKEN not set — cannot create GitHub issue");
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorStack = error instanceof Error ? error.stack : "";

  // Detect common database error patterns for better issue titles
  const isFkViolation =
    errorMessage.includes("foreign key constraint") ||
    errorMessage.includes("violates foreign key");
  const isUniqueViolation =
    errorMessage.includes("unique constraint") ||
    errorMessage.includes("violates unique constraint");
  const isNotNullViolation =
    errorMessage.includes("null value") ||
    errorMessage.includes("not-null constraint");

  const category = isFkViolation
    ? "FK"
    : isUniqueViolation
      ? "UNIQUE"
      : isNotNullViolation
        ? "NOTNULL"
        : "DB";

  const title = `[${category}] ${errorName}: ${errorMessage.slice(0, 120)}`;
  const label = context.label ?? "database";

  const body = [
    `## 🗄️ Database error bij formulierverwerking`,
    ``,
    `**Type:** ${errorName}`,
    `**Message:** ${errorMessage}`,
    `**Action:** ${context.action}`,
    `**Tijd:** ${new Date().toISOString()}`,
    ``,
    context.userMessage
      ? `**Gebruikersmelding:** ${context.userMessage}`
      : "",
    ``,
    errorStack
      ? `### Stack trace\n\`\`\`\n${errorStack.slice(0, 2000)}\n\`\`\``
      : "",
    ``,
    `---`,
    `*Automatisch aangemaakt via error reporter op bcm.7rb.nl*`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
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
          labels: ["bug", label],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[error-reporter] GitHub API ${response.status}: ${errorText.slice(0, 500)}`,
      );
    } else {
      const issue = (await response.json()) as {
        html_url: string;
        number: number;
      };
      console.info(
        `[error-reporter] Created GitHub issue #${issue.number}: ${title}`,
      );
    }
  } catch (fetchError) {
    console.error("[error-reporter] Failed to create GitHub issue:", fetchError);
  }
}
