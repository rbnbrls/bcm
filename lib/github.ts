/**
 * Service module for fetching data from the GitHub API.
 *
 * This module is server-side only and uses the standard `fetch` API,
 * making it inherently mockable for testing (mock globalThis.fetch).
 */

import { captureError } from "@/lib/sentry-helper";

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
      name: string;
    };
  };
}

const GITHUB_API_BASE = "https://api.github.com";
const REPO = "rbnbrls/bcm";
const PER_PAGE = 100;

/**
 * Fetches the most recent commits from the rbnbrls/bcm repository
 * via the public GitHub API.
 *
 * Returns commits sorted by date descending (most recent first).
 * On failure, returns an empty array.
 */
export async function fetchRecentCommits(): Promise<GitHubCommit[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "bcm-app",
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${REPO}/commits?per_page=${PER_PAGE}`,
      { headers }
    );

    if (!response.ok) {
      captureError(new Error(`GitHub API error: ${response.status} ${response.statusText}`), {
        endpoint: "fetchRecentCommits",
        phase: "github_api",
        githubStatus: response.status,
      });
      return [];
    }

    const data: GitHubCommit[] = await response.json();

    return data;
  } catch (error) {
    captureError(error, { endpoint: "fetchRecentCommits", phase: "github_api" });
    return [];
  }
}
