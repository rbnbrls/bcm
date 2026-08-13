"use client";

import Link from "next/link";
import { ErrorBoundaryReporter } from "@/components/error-boundary-reporter";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-shell empty-state" role="alert">
      <ErrorBoundaryReporter error={error} boundary="app/benchmark-aanvraag" />
      <p className="eyebrow">FOUT</p>
      <h1>Formulier laden mislukt</h1>
      <p>Controleer je verbinding en probeer het opnieuw.</p>
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button className="button button-primary" onClick={reset} type="button">
          Probeer opnieuw
        </button>
        <Link className="button button-secondary" href="/">
          Naar home
        </Link>
      </div>
    </div>
  );
}
