"use client";

import { useEffect, useState } from "react";

/* ── Types ── */

export interface TimelineCommit {
  message: string;
  date: string;
  author: string;
  sha: string;
}

interface UpdatesTimelineProps {
  commits: TimelineCommit[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/* ── Coolify status types ── */

type StatusLevel = "green" | "amber" | "red" | "unknown";

export interface CoolifyStatus {
  level: StatusLevel;
  raw: string;
  label: string;
  deploying: boolean;
}

/* ── Status pill component (self-fetching) ── */

const STATUS_COLORS: Record<StatusLevel, { bg: string; dot: string; text: string }> = {
  green: { bg: "#dff4e9", dot: "#0f6d55", text: "#0a513f" },
  amber: { bg: "#fff3d6", dot: "#c8950c", text: "#926d0a" },
  red: { bg: "#ffebe8", dot: "#a44032", text: "#7a2f24" },
  unknown: { bg: "#eef1ed", dot: "#5d6864", text: "#5d6864" },
};

export function StatusPill() {
  const [status, setStatus] = useState<CoolifyStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/coolify-status");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setStatus(data.status ?? null);
        }
      } catch {
        // Silently degrade — pill stays on "Laden…"
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const colors = STATUS_COLORS[status?.level ?? "unknown"];
  const label = status?.label ?? "Laden…";

  return (
    <span
      className="coolify-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 100,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        background: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
        verticalAlign: "middle",
      }}
      title={status ? `Coolify: ${status.raw}` : undefined}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: colors.dot,
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      {label}
      {status?.deploying && (
        <span className="pill-spinner" style={{ display: "inline-block", width: 12, height: 12 }} />
      )}
    </span>
  );
}

/* ── Date formatting ── */

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) return "zojuist";
  if (diffMinutes < 2) return "1 minuut geleden";
  if (diffMinutes < 60) return `${diffMinutes} min geleden`;
  if (diffHours < 2) return "1 uur geleden";
  if (diffHours < 24) return `${diffHours} uur geleden`;
  if (diffDays === 1) return "gisteren";
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  if (diffWeeks === 1) return "1 week geleden";
  if (diffWeeks < 5) return `${diffWeeks} weken geleden`;

  const months = [
    "jan", "feb", "mrt", "apr", "mei", "jun",
    "jul", "aug", "sep", "okt", "nov", "dec",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/* ── Commit type classification ── */

function commitType(message: string): { label: string; variant: string } {
  if (message.startsWith("feat")) return { label: "Nieuwe functie", variant: "feat" };
  if (message.startsWith("fix")) return { label: "Bugfix", variant: "fix" };
  if (message.startsWith("refactor")) return { label: "Verbetering", variant: "refactor" };
  if (message.startsWith("chore")) return { label: "Onderhoud", variant: "chore" };
  if (message.startsWith("docs")) return { label: "Documentatie", variant: "docs" };
  if (message.startsWith("perf")) return { label: "Prestatie", variant: "perf" };
  if (message.startsWith("test")) return { label: "Test", variant: "test" };
  return { label: "Wijziging", variant: "other" };
}

/* ── Author display ── */

function authorName(author: string): string {
  if (author === "Hermes Agent") return "🤖 Hermes";
  if (author === "rbnbrls" || author === "ruben") return "Ruben";
  return author;
}

/* ── Short hash ── */

function shortSha(sha: string): string {
  return sha.substring(0, 7);
}

/* ── Truncate long messages ── */

function truncate(msg: string, max = 80): string {
  if (msg.length <= max) return msg;
  return msg.substring(0, max).replace(/\s+\S*$/, "") + "…";
}

/* ── Spinner ── */

function Spinner() {
  return (
    <svg
      className="timeline-spinner"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

/* ── Main component ── */

export function UpdatesTimeline({
  commits,
  loading = false,
  error = null,
  onRetry,
}: UpdatesTimelineProps) {
  /* Loading state */
  if (loading) {
    return (
      <div className="timeline-state" role="status">
        <Spinner />
        <p style={{ margin: 0 }}>Wijzigingen laden…</p>
      </div>
    );
  }

  /* Error state */
  if (error) {
    return (
      <div className="timeline-state timeline-error">
        <div className="form-errors" role="alert">
          <b>Laden mislukt</b>
          <p>{error}</p>
        </div>
        {onRetry && (
          <button
            className="button button-secondary timeline-retry"
            onClick={onRetry}
            type="button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Probeer opnieuw
          </button>
        )}
      </div>
    );
  }

  /* Sort by date descending */
  const sorted = [...commits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  /* Empty state */
  if (sorted.length === 0) {
    return (
      <div className="empty-state">
        <p>Er zijn nog geen wijzigingen vastgelegd.</p>
      </div>
    );
  }

  /* ── Compact table ── */
  return (
    <div className="updates-table-wrapper">
      <table className="updates-table">
        <thead>
          <tr>
            <th className="col-badge">Type</th>
            <th className="col-message">Omschrijving</th>
            <th className="col-author">Auteur</th>
            <th className="col-date">Datum</th>
            <th className="col-hash">Hash</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((commit) => {
            const type = commitType(commit.message);
            return (
              <tr key={commit.sha}>
                <td className="col-badge">
                  <span className={`commit-badge-sm ${type.variant}`}>{type.label}</span>
                </td>
                <td className="col-message">
                  <span title={commit.message}>{truncate(commit.message)}</span>
                </td>
                <td className="col-author">{authorName(commit.author)}</td>
                <td className="col-date" title={new Date(commit.date).toLocaleString("nl-NL")}>
                  {formatTimeAgo(commit.date)}
                </td>
                <td className="col-hash">
                  <code>{shortSha(commit.sha)}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
