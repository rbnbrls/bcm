"use client";

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
  if (diffMinutes < 60) return `${diffMinutes} minuten geleden`;
  if (diffHours < 2) return "1 uur geleden";
  if (diffHours < 24) return `${diffHours} uur geleden`;
  if (diffDays === 1) return "gisteren";
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  if (diffWeeks === 1) return "1 week geleden";
  if (diffWeeks < 5) return `${diffWeeks} weken geleden`;

  // Fall back to full Dutch date
  const months = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
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
  if (author === "Hermes Agent") return "🤖 Hermes Agent";
  if (author === "rbnbrls" || author === "ruben") return "Ruben";
  return author;
}

/* ── Short hash ── */

function shortSha(sha: string): string {
  return sha.substring(0, 7);
}

/* ── Spinner (inline SVG) ── */

function Spinner() {
  return (
    <svg
      className="timeline-spinner"
      width="32"
      height="32"
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
        <p>Wijzigingen laden…</p>
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

  /* Sort by date descending (newest first) */
  const sorted = [...commits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  /* Empty state */
  if (sorted.length === 0) {
    return (
      <div className="empty-state">
        <h1>—</h1>
        <p>Er zijn nog geen wijzigingen vastgelegd.</p>
      </div>
    );
  }

  /* Timeline */
  return (
    <div className="timeline">
      {sorted.map((commit, i) => {
        const type = commitType(commit.message);
        const isLast = i === sorted.length - 1;
        return (
          <div
            className={`timeline-item${isLast ? " is-last" : ""}`}
            key={commit.sha}
          >
            <div className="timeline-marker">
              <span className={`marker-dot ${type.variant}`} />
              {!isLast && <span className="marker-line" />}
            </div>
            <article className="timeline-card">
              <div className="timeline-card-header">
                <span className={`commit-badge ${type.variant}`}>
                  {type.label}
                </span>
                <span className="commit-date" title={new Date(commit.date).toLocaleString("nl-NL")}>
                  {formatTimeAgo(commit.date)}
                </span>
              </div>
              <p className="commit-message">{commit.message}</p>
              <div className="commit-meta">
                <code className="commit-hash">{shortSha(commit.sha)}</code>
                <span className="commit-author">{authorName(commit.author)}</span>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}
