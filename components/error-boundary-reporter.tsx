"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef } from "react";

type ErrorBoundaryReporterProps = {
  error: Error & { digest?: string };
  boundary: string;
};

export function ErrorBoundaryReporter({ error, boundary }: ErrorBoundaryReporterProps) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;

    try {
      Sentry.withScope((scope) => {
        scope.setTag("boundary", boundary);
        scope.setTag("handled", "true");
        if (error.digest) scope.setExtra("digest", error.digest);
        Sentry.captureException(error);
      });
    } catch {
      // Keep the fallback below available when the SDK is unavailable.
    }

    fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: { name: error.name, message: error.message, stack: error.stack, digest: error.digest },
        boundary,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch((reportError) => console.error("Failed to report boundary error:", reportError));
  }, [boundary, error]);

  return null;
}
