import { NextResponse } from "next/server";
import { fetchRecentCommits, type GitHubCommit } from "@/lib/github";
import { captureError } from "@/lib/sentry-helper";

export interface TimelineCommit {
  message: string;
  date: string;
  author: string;
  sha: string;
}

function toTimelineCommit(raw: GitHubCommit): TimelineCommit {
  return {
    sha: raw.sha,
    message: raw.commit.message,
    date: raw.commit.author.date,
    author: raw.commit.author.name,
  };
}

export async function GET() {
  try {
    const data = await fetchRecentCommits();
    const commits = data.map(toTimelineCommit);

    return NextResponse.json({ commits });
  } catch (error) {
    captureError(error, { route: "/api/commits", method: "GET", phase: "request" });
    const message =
      error instanceof Error ? error.message : "Onbekende fout bij ophalen commits";

    return NextResponse.json(
      { error: message, commits: [] },
      { status: 502 },
    );
  }
}
