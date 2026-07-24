/**
 * Service module for fetching data from the GitHub API.
 *
 * This module is server-side only and uses the standard `fetch` API,
 * making it inherently mockable for testing (mock globalThis.fetch).
 */

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
const PER_PAGE = 20;

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
      console.error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const data: GitHubCommit[] = await response.json();

    // Sort by date descending (most recent first) as a safety measure,
    // even though the API typically returns them in this order.
    data.sort((a, b) => {
      const dateA = new Date(a.commit.author.date).getTime();
      const dateB = new Date(b.commit.author.date).getTime();
      return dateB - dateA;
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch recent commits:", error);
    return [];
  }
}
