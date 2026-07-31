"use client";

import { useState, useEffect } from "react";

/**
 * UUID regex — matches any standard UUID variant (v1–v8, including nil).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BenchmarkFieldDiffProps {
  value: string | null;
  isIst: boolean;
  label: string;
}

/**
 * Resolves a benchmark UUID to its human-readable name via the
 * GET /api/benchmarks/{id}/name endpoint. Shows a loading placeholder
 * while fetching and falls back to the raw UUID on error.
 *
 * Uses AbortController to cancel in-flight requests when value changes,
 * and only calls setState inside async callbacks (never synchronously
 * in the effect body) to satisfy react-hooks/set-state-in-effect.
 */
export function BenchmarkFieldDiff({
  value,
  isIst,
  label,
}: BenchmarkFieldDiffProps) {
  const [name, setName] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  // Derived from props — deterministic, no setState needed
  const showFallback = !value || value === "—" || !UUID_RE.test(value);

  useEffect(() => {
    if (showFallback) return;

    const controller = new AbortController();

    fetch(`/api/benchmarks/${encodeURIComponent(value)}/name`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json() as Promise<{ name: string; code: string }>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setName(data.name);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setName(null);
          setFetchError(true);
        }
      });

    return () => controller.abort();
  }, [value, showFallback]);

  const className = isIst ? "diff-line diff-remove" : "diff-line diff-add";
  const prefix = isIst ? "−" : "+";

  if (showFallback) {
    return (
      <div className={className}>
        <i>{prefix}</i>
        <code>{String(value ?? "—")}</code>
      </div>
    );
  }

  if (name === null && !fetchError) {
    return (
      <div className={className}>
        <i>{prefix}</i>
        <code className="benchmark-placeholder">Bezig met laden…</code>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={className}>
        <i>{prefix}</i>
        <code>{String(value ?? "—")}</code>
      </div>
    );
  }

  return (
    <div className={className}>
      <i>{prefix}</i>
      <code className="benchmark-name">{name}</code>
      {value && (
        <span className="benchmark-uuid-note" title={`UUID: ${value}`}>
          {value.slice(0, 8)}…
        </span>
      )}
    </div>
  );
}
