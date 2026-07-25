"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { UpdatesTimeline, StatusPill, type TimelineCommit } from "@/components/updates-timeline";

export default function UpdatesPage() {
  const [commits, setCommits] = useState<TimelineCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cancelledRef = useRef(false);

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

      if (!cancelledRef.current) {
        setCommits(Array.isArray(data.commits) ? data.commits : []);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        const message = err instanceof Error ? err.message : "Onbekende fout";
        setError(message);
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCommits();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchCommits]);

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
