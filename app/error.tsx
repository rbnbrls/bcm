"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useRef } from "react";

function reportError(error: Error) {
  // Report to Sentry/GlitchTip as primary channel
  try {
    Sentry.captureException(error);
  } catch {
    // Sentry not available — fall through to direct reporting
  }

  // Fallback: directly report to GitHub Issues via API route
  fetch("/api/report-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: { name: error.name, message: error.message, stack: error.stack },
      url: window.location.href,
      timestamp: new Date().toISOString(),
    }),
  }).catch((e) => console.error("Failed to report error:", e));
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    reportError(error);
  }, [error]);

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
