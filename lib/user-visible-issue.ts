import * as Sentry from "@sentry/nextjs";
import { createGitHubIssue } from "@/lib/github-issue-reporter";

export type UserVisibleIssueContext = Readonly<{
  route: string;
  message: string;
  severity?: "info" | "warning" | "error";
  fingerprint: string;
  details?: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}>;

export async function reportUserVisibleIssue(context: UserVisibleIssueContext): Promise<void> {
  const severity = context.severity ?? "warning";
  const title = `[User Visible ${severity.toUpperCase()}] ${context.route}: ${context.message.slice(0, 120)}`;
  const detailsJson = context.details ? JSON.stringify(context.details, null, 2).slice(0, 3000) : "";

  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    Sentry.withScope((scope) => {
      scope.setTag("handled", "true");
      scope.setTag("user_visible", "true");
      scope.setTag("route", context.route);
      scope.setTag("severity", severity);
      scope.setFingerprint([context.fingerprint]);
      if (context.details) scope.setContext("user_visible_issue", context.details);
      Sentry.captureMessage(context.message, severity === "error" ? "error" : "warning");
    });
  }

  const body = [
    "## Gebruiker ervaart melding",
    "",
    `**Route:** ${context.route}`,
    `**Severity:** ${severity}`,
    `**Melding:** ${context.message}`,
    `**Tijd:** ${new Date().toISOString()}`,
    "",
    detailsJson ? `### Context\n\`\`\`json\n${detailsJson}\n\`\`\`` : "",
    "",
    "---",
    "*Automatisch aangemaakt via user-visible closed-loop monitor.*",
  ].filter(Boolean).join("\n");

  const result = await createGitHubIssue({
    title,
    body,
    labels: ["bug", "user-visible", severity],
    fingerprint: `user-visible:${context.fingerprint}`,
  });

  if (!result.ok && result.reason !== "not_production" && result.reason !== "missing_token") {
    console.error(`[user-visible-issue] Failed to create GitHub issue: ${result.reason}`, result.message ?? result.status ?? "");
  }
}
