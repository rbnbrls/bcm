"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef } from "react";
import { FriendlyErrorState } from "@/components/friendly-error-state";

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
        <FriendlyErrorState
          eyebrow="SYSTEEMFOUT"
          title="BCM kon niet verder"
          message="Er is een onverwachte fout opgetreden. De melding is doorgestuurd; probeer opnieuw of ga terug naar het dashboard."
          detail={error.digest ? `Referentie: ${error.digest}` : `${error.name}: ${error.message}`}
          onRetry={reset}
          primaryHref="/"
          primaryLabel="Naar dashboard"
          secondaryHref="/changes"
          secondaryLabel="Naar changes"
        />
      </body>
    </html>
  );
}
