"use client";

import { useState, useEffect } from "react";

/**
 * UUID regex — matches any standard UUID variant (v1–v8, including nil).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BenchmarkFieldDiffProps {
  value: string | null;
  isIst: boolean; // true = IST (red), false = SOLL (green)
  label: string;
}

/**
 * Resolves a benchmark UUID to its human-readable name via the
 * GET /api/benchmarks/{id}/name endpoint. Shows a loading placeholder
 * while fetching and falls back to the raw UUID on error.
 *
 * The loading state is the initial render — no synchronous setState
 * in the effect body, avoiding cascading renders.
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
    if (showFallback) return; // rendered via derived props, not state
    setFetchError(false);
    setName(null);

    fetch(`/api/benchmarks/${encodeURIComponent(value)}/name`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json() as Promise<{ name: string; code: string }>;
      })
      .then((data) => setName(data.name))
      .catch(() => {
        setName(null);
        setFetchError(true);
      });
  }, [value]);

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
