"use client";

import { useEffect, useState, useMemo } from "react";

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
        <span className="pill-spinner" style={{ display: "inline-block", width: 12, height: 12 }} role="status" aria-label="Bezig met deployen" />
      )}
    </span>
  );
}

/* ── Date formatting ── */

export function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();

  // Future dates should not show "zojuist"
  if (diffMs < 0) {
    return date.toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

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

export function commitType(message: string): { label: string; variant: string } {
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

export function authorName(author: string): string {
  if (author === "Hermes Agent") return "🤖 Hermes";
  if (author === "rbnbrls" || author === "ruben") return "Ruben";
  return author;
}

/* ── Short hash ── */

export function shortSha(sha: string): string {
  return sha.substring(0, 7);
}

/* ── Truncate long messages ── */

export function truncate(msg: string, max = 80): string {
  if (msg.length <= max) return msg;
  return msg.substring(0, max).replace(/\s+\S*$/, "") + "…";
}

/* ── Filtering and sorting helpers ── */

export function filterCommits(
  commits: TimelineCommit[],
  filters: Partial<Record<keyof TimelineCommit, string>>
): TimelineCommit[] {
  let result = [...commits];
  for (const [key, val] of Object.entries(filters)) {
    if (!val) continue;
    const q = val.toLowerCase().trim();
    result = result.filter((c) => {
      const field = String(c[key as keyof TimelineCommit] ?? "").toLowerCase();
      return field.includes(q);
    });
  }
  return result;
}

export function sortCommits(
  commits: TimelineCommit[],
  sortKey: keyof TimelineCommit | null,
  sortDir: "asc" | "desc" | null
): TimelineCommit[] {
  if (!sortKey || !sortDir) return [...commits];
  const sorted = [...commits].sort((a, b) => {
    const va = String(a[sortKey] ?? "").toLowerCase();
    const vb = String(b[sortKey] ?? "").toLowerCase();
    const cmp = va.localeCompare(vb, "nl");
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
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
      aria-label="Bezig met laden…"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

/* ── Sort icon ── */

type SortDir = "asc" | "desc" | null;

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === "asc") return <span className="sort-icon sort-icon--asc">▲</span>;
  if (dir === "desc") return <span className="sort-icon sort-icon--desc">▼</span>;
  return <span className="sort-icon sort-icon--none">⇅</span>;
}

/* ── Main component ── */

export function UpdatesTimeline({
  commits,
  loading = false,
  error = null,
  onRetry,
}: UpdatesTimelineProps) {
  const [sortKey, setSortKey] = useState<keyof TimelineCommit | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filters, setFilters] = useState<Partial<Record<keyof TimelineCommit, string>>>({});
  const [showFilters, setShowFilters] = useState(false);

  function handleSort(key: keyof TimelineCommit) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else { setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function setFilter(key: keyof TimelineCommit, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  const filtered = useMemo(() => {
    let data = filterCommits(commits, filters);
    data = sortCommits(data, sortKey, sortDir);
    // Default sort: newest first
    if (!sortKey || !sortDir) {
      data = [...data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }
    return data;
  }, [commits, filters, sortKey, sortDir]);

  const filterCount = Object.keys(filters).length;

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
            aria-label="Opnieuw proberen"
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

  /* ── Empty state (only when there are no commits at all) ── */
  if (commits.length === 0) {
    return (
      <div className="empty-state">
        <p>Er zijn nog geen wijzigingen vastgelegd.</p>
      </div>
    );
  }

  /* ── Sortable & filterable table ── */
  const COLUMNS: { key: keyof TimelineCommit; label: string; className: string }[] = [
    { key: "message", label: "Omschrijving", className: "col-message" },
    { key: "author", label: "Auteur", className: "col-author" },
    { key: "date", label: "Datum", className: "col-date" },
    { key: "sha", label: "Hash", className: "col-hash" },
  ];

  return (
    <>
      <div className="config-table-toolbar">
        <button
          className={`config-filter-toggle ${showFilters ? "config-filter-toggle--active" : ""}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 2.5h13M3.5 7.5h8M6 12h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Filter
          {filterCount > 0 && <span className="filter-badge">{filterCount}</span>}
        </button>
        <span className="config-table-count">{filtered.length} van {commits.length} wijzigingen</span>
      </div>

      <div className="updates-table-wrapper">
        <table className="updates-table">
          <caption style={{ display: "none" }}>Overzicht van recente wijzigingen aan de BCM-app</caption>
          <thead>
            <tr>
              <th className="col-badge">Type</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className={col.className} aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                  <button
                    className={`sort-header ${sortKey === col.key ? "sort-header--active" : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon dir={sortKey === col.key ? sortDir : null} />
                  </button>
                </th>
              ))}
            </tr>
            {showFilters && (
              <tr className="filter-row">
                <td className="col-badge"></td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className={col.className}>
                    <input
                      className="col-filter"
                      type="text"
                      placeholder={`Filter ${col.label.toLowerCase()}…`}
                      aria-label={`Filter op ${col.label.toLowerCase()}`}
                      value={filters[col.key] ?? ""}
                      onChange={(e) => setFilter(col.key, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="config-table-empty">
                  Geen wijzigingen gevonden voor de huidige filters.
                </td>
              </tr>
            ) : (
              filtered.map((commit) => {
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
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
