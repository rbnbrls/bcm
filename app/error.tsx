"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef } from "react";
import { FriendlyErrorState } from "@/components/friendly-error-state";

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
    <FriendlyErrorState
      eyebrow="FOUT"
      title="Deze pagina kon niet worden geladen"
      message="Je werk is niet automatisch aangepast. Probeer opnieuw of ga terug naar het change-overzicht."
      detail={error.digest ? `Referentie: ${error.digest}` : undefined}
      onRetry={reset}
      primaryHref="/changes"
      primaryLabel="Naar changes"
      secondaryHref="/"
      secondaryLabel="Naar dashboard"
    />
  );
}
