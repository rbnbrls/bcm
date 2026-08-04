"use server";

const GITHUB_OWNER = "rbnbrls";
const GITHUB_REPO = "bcm";

export type FeedbackState = { ok: true; url: string } | { ok: false; message: string };

export async function submitFeedback(prev: FeedbackState | null, formData: FormData): Promise<FeedbackState> {
  const title = formData.get("title")?.toString().trim();
  const body = formData.get("body")?.toString().trim();

  if (!title || title.length < 3) return { ok: false, message: "Titel is verplicht (minimaal 3 tekens)." };
  if (!body || body.length < 3) return { ok: false, message: "Beschrijving is verplicht (minimaal 3 tekens)." };

  // Dry-run guard (GH #463): when FEEDBACK_DRY_RUN is set (any truthy value,
  // e.g. "1" or "true") the action returns a deterministic success without
  // calling the GitHub API. The Playwright e2e suite always sets this
  // (playwright.config.ts webServer env) and CI adds it as defense-in-depth,
  // so automated test runs can never create real GitHub issues — the form
  // still exercises the full success UI.
  if (process.env.FEEDBACK_DRY_RUN) {
    return { ok: true, url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues?dry_run=1` };
  }

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
