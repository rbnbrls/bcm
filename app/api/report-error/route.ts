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
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ErrorReport {
  error: {
    name: string;
    message: string;
    stack?: string;
    componentStack?: string;
  };
  url?: string;
  timestamp?: string;
}

export async function POST(request: Request) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "GitHub token not configured" },
      { status: 500 },
    );
  }

  let report: ErrorReport;
  try {
    report = (await request.json()) as ErrorReport;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { error, url, timestamp } = report;
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
      console.error("GitHub API error:", response.status, errorText);
      return NextResponse.json(
        { ok: false, message: `GitHub API error: ${response.status}` },
        { status: 502 },
      );
    }

    const issue = (await response.json()) as { html_url: string; number: number };
    console.info(`Created GitHub issue #${issue.number}: ${title}`);
    return NextResponse.json({ ok: true, url: issue.html_url, number: issue.number });
  } catch (error) {
    console.error("Report-error API error:", error);
    return NextResponse.json(
      { ok: false, message: "Failed to create GitHub issue" },
      { status: 500 },
    );
  }
}
