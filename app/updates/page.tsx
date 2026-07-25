"use client";

import { useEffect, useState, useCallback } from "react";
import { UpdatesTimeline, StatusPill, type TimelineCommit } from "@/components/updates-timeline";

export default function UpdatesPage() {
  const [commits, setCommits] = useState<TimelineCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCommits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/commits");

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Fout bij ophalen (${res.status})`);
      }

      const data = await res.json();

      if (Array.isArray(data.commits)) {
        setCommits(data.commits as TimelineCommit[]);
      } else {
        setCommits([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onbekende fout";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/commits");

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Fout bij ophalen (${res.status})`);
        }

        const data = await res.json();

        if (!cancelled) {
          setCommits(Array.isArray(data.commits) ? data.commits : []);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Onbekende fout";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-shell updates-shell">
      <section className="page-intro" role="region" aria-label="Recente wijzigingen">
        <p className="eyebrow">Tijdlijn</p>
        <h1 className="updates-title-row">
          Recente wijzigingen
          <StatusPill />
        </h1>
        <p className="hero-copy">
          Een overzicht van alle aanpassingen aan de BCM-app, gesorteerd van
          nieuw naar oud.
        </p>
      </section>

      <UpdatesTimeline
        commits={commits}
        loading={loading}
        error={error}
        onRetry={fetchCommits}
      />
    </div>
  );
}
