"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);

  return (
    <div className="page-shell empty-state" role="alert">
      <p className="eyebrow">FOUT</p>
      <h1>Er is een fout opgetreden</h1>
      <p>Probeer het nog een keer of ga terug naar de homepagina.</p>
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
