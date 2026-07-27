"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef } from "react";

function reportError(error: Error, componentStack?: string) {
  fetch("/api/report-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack,
      },
      url: typeof window !== "undefined" ? window.location.href : undefined,
      timestamp: new Date().toISOString(),
    }),
  }).catch((e) => console.error("Failed to report error:", e));
}

export default function GlobalError({
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

    // Try Sentry first (works if SENTRY_DSN is configured in Coolify)
    try {
      Sentry.captureException(error);
    } catch {
      // Sentry not available — fall through to direct reporting
    }

    // Fallback: directly report to GitHub Issues via API route
    reportError(error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
            Er is iets misgegaan
          </h1>
          <p style={{ marginBottom: "0.5rem", color: "#666" }}>
            Er is een onverwachte fout opgetreden. Ons team is op de hoogte gesteld.
          </p>
          <p style={{ marginBottom: "2rem", fontSize: "0.85rem", color: "#999" }}>
            {error.name}: {error.message}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              background: "var(--accent, #0052cc)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      </body>
    </html>
  );
}
