"use server";

const GITHUB_OWNER = "rbnbrls";
const GITHUB_REPO = "bcm";

// Dry-run mode: when FEEDBACK_DRY_RUN=true the action skips the real GitHub
// POST and returns a deterministic success state. The Playwright e2e suite
// always sets this (playwright.config.ts webServer env) so test runs can
// never create real issues — the form still exercises the full success UI.
const FEEDBACK_DRY_RUN_URL =
  process.env.FEEDBACK_DRY_RUN === "true"
    ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues?q=E2E+dry-run`
    : null;

export type FeedbackState = { ok: true; url: string } | { ok: false; message: string };

export async function submitFeedback(prev: FeedbackState | null, formData: FormData): Promise<FeedbackState> {
  const title = formData.get("title")?.toString().trim();
  const body = formData.get("body")?.toString().trim();

  if (!title || title.length < 3) return { ok: false, message: "Titel is verplicht (minimaal 3 tekens)." };
  if (!body || body.length < 3) return { ok: false, message: "Beschrijving is verplicht (minimaal 3 tekens)." };

  // Dry-run (e2e/dev): deterministic success without a real GitHub issue.
  if (FEEDBACK_DRY_RUN_URL) return { ok: true, url: FEEDBACK_DRY_RUN_URL };

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
      console.error("GitHub API error:", response.status, errorText);
      return { ok: false, message: `Kon het issue niet aanmaken (GitHub: ${response.status}).` };
    }

    const issue = await response.json() as { html_url: string };
    return { ok: true, url: issue.html_url };
  } catch (error) {
    console.error("Feedback submit error:", error);
    return { ok: false, message: "Er is een fout opgetreden bij het verzenden van je feedback." };
  }
}
