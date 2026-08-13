const GITHUB_OWNER = "rbnbrls";
const GITHUB_REPO = "bcm";
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

const recentIssues = new Map<string, number>();

export type GitHubIssueReport = Readonly<{
  title: string;
  body: string;
  labels: readonly string[];
  fingerprint: string;
}>;

function isProduction(): boolean {
  return process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test";
}

function isDuplicate(fingerprint: string): boolean {
  const now = Date.now();
  const lastReported = recentIssues.get(fingerprint);
  if (lastReported !== undefined && now - lastReported < DEDUP_WINDOW_MS) {
    return true;
  }
  recentIssues.set(fingerprint, now);
  for (const [key, timestamp] of recentIssues) {
    if (now - timestamp > DEDUP_WINDOW_MS * 2) recentIssues.delete(key);
  }
  return false;
}

export async function createGitHubIssue(report: GitHubIssueReport): Promise<{
  ok: true;
  deduplicated?: boolean;
  url?: string;
  number?: number;
} | {
  ok: false;
  reason: "not_production" | "missing_token" | "github_api" | "network";
  status?: number;
  message?: string;
}> {
  if (!isProduction()) return { ok: false, reason: "not_production" };
  if (isDuplicate(report.fingerprint)) return { ok: true, deduplicated: true };

  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, reason: "missing_token" };

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
          title: report.title,
          body: report.body,
          labels: [...report.labels],
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return { ok: false, reason: "github_api", status: response.status, message };
    }

    const issue = (await response.json()) as { html_url: string; number: number };
    return { ok: true, url: issue.html_url, number: issue.number };
  } catch (error) {
    return {
      ok: false,
      reason: "network",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function errorFingerprint(error: unknown, prefix = "error"): string {
  if (error instanceof Error) return `${prefix}:${error.name}:${error.message.slice(0, 200)}`;
  return `${prefix}:unknown:${String(error).slice(0, 200)}`;
}
