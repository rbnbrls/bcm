"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

async function reportError(error: Error) {
  try {
    await fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("Failed to report error:", e);
  }
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (!reported) {
      setReported(true);
      reportError(error);
    }
  }, [error, reported]);

  return (
    <div className="page-shell empty-state" role="alert">
      <p className="eyebrow">FOUT</p>
      <h1>Er is een fout opgetreden</h1>
      <p>Probeer het nog een keer of ga terug naar de homepagina.</p>
      {reported && (
        <p style={{ fontSize: "0.85rem", color: "#666", marginTop: 8 }}>
          De fout is automatisch gerapporteerd.
        </p>
      )}
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
