"use client";

import Link from "next/link";
import { ErrorBoundaryReporter } from "@/components/error-boundary-reporter";

export default function ChangesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-shell">
      <ErrorBoundaryReporter error={error} boundary="app/changes" />
      <div className="empty-state" style={{ textAlign: "center", padding: 64 }}>
        <p className="eyebrow">FOUT</p>
        <h1>Overzicht niet beschikbaar</h1>
        <p style={{ color: "var(--muted)", margin: "16px 0 24px", maxWidth: 480, marginInline: "auto" }}>
          {error.message || "Er is een fout opgetreden bij het laden van het change overzicht."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="button button-primary" onClick={reset} type="button">
            Opnieuw proberen
          </button>
          <Link className="button button-secondary" href="/">
            Naar home
          </Link>
        </div>
      </div>
    </div>
  );
}
