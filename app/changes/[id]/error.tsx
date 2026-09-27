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
      <ErrorBoundaryReporter error={error} boundary="app/changes/[id]" />
      <p className="eyebrow">FOUT</p>
      <h1>Change request laden mislukt</h1>
      <p>Controleer de link of ga terug naar het overzicht.</p>
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <Link className="button button-primary" href="/changes/new">
          Nieuwe change
        </Link>
        <Link className="button button-secondary" href="/">
          Naar home
        </Link>
      </div>
    </div>
  );
}
