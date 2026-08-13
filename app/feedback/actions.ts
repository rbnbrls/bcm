"use server";

import { captureError } from "@/lib/sentry-helper";

const GITHUB_OWNER = "rbnbrls";
const GITHUB_REPO = "bcm";

// Dry-run guard (GH #453/#461/#463): when FEEDBACK_DRY_RUN is set to any
// truthy value ("1", "true", …) the action skips the real GitHub POST and
// returns a deterministic success state. The Playwright e2e suite always
// sets this (playwright.config.ts webServer env) and CI adds it as
// defense-in-depth, so automated test runs can never create real GitHub
// issues — the form still exercises the full success UI.
//
// The env is read at call time (not module scope) so unit tests can stub
// it per test via vi.stubEnv and both "1" and "true" spellings work.
function getDryRunUrl(): string | null {
  if (!process.env.FEEDBACK_DRY_RUN) return null;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues?q=E2E+dry-run`;
}

export type FeedbackState = { ok: true; url: string } | { ok: false; message: string };

export async function submitFeedback(prev: FeedbackState | null, formData: FormData): Promise<FeedbackState> {
  const title = formData.get("title")?.toString().trim();
  const body = formData.get("body")?.toString().trim();

  if (!title || title.length < 3) return { ok: false, message: "Titel is verplicht (minimaal 3 tekens)." };
  if (!body || body.length < 3) return { ok: false, message: "Beschrijving is verplicht (minimaal 3 tekens)." };

  // Dry-run (e2e/dev): deterministic success without a real GitHub issue.
  const dryRunUrl = getDryRunUrl();
  if (dryRunUrl) return { ok: true, url: dryRunUrl };

  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, message: "GitHub token niet geconfigureerd. Neem contact op met de beheerder." };

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
          title: `[Feedback] ${title}`,
          body: `## Feedback van gebruiker\n\n**Omschrijving:**\n${body}\n\n---\n*Automatisch aangemaakt via het feedbackformulier op bcm.7rb.nl*`,
          labels: ["feedback"],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      captureError(new Error(`GitHub feedback issue creation failed: ${response.status}`), {
        endpoint: "submitFeedback",
        phase: "github_issue",
        githubStatus: response.status,
        githubError: errorText.slice(0, 500),
      });
      return { ok: false, message: `Kon het issue niet aanmaken (GitHub: ${response.status}).` };
    }

    const issue = await response.json() as { html_url: string };
    return { ok: true, url: issue.html_url };
  } catch (error) {
    captureError(error, { endpoint: "submitFeedback", phase: "server_action" });
    return { ok: false, message: "Er is een fout opgetreden bij het verzenden van je feedback." };
  }
}
