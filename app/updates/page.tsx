import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface Commit {
  hash: string;
  fullHash: string;
  date: string;
  author: string;
  message: string;
}

function getCommits(): Commit[] {
  const jsonPath = resolve(process.cwd(), "public", "commits.json");
  if (existsSync(jsonPath)) {
    const raw = readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw) as Commit[];
  }
  return [];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} om ${hours}:${minutes}`;
}

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

function authorName(author: string): string {
  if (author === "Hermes Agent") return "🤖 Hermes Agent";
  if (author === "rbnbrls" || author === "ruben") return "Ruben";
  return author;
}

export default function UpdatesPage() {
  const commits = getCommits();

  return (
    <div className="page-shell updates-shell">
      <section className="page-intro">
        <p className="eyebrow">Tijdlijn</p>
        <h1>Recente wijzigingen</h1>
        <p className="hero-copy">
          Een overzicht van alle aanpassingen aan de BCM-app, gesorteerd van
          nieuw naar oud.
        </p>
      </section>

      {commits.length === 0 ? (
        <div className="empty-state">
          <h1>—</h1>
          <p>Er zijn nog geen wijzigingen vastgelegd.</p>
        </div>
      ) : (
        <div className="timeline">
          {commits.map((commit, i) => {
            const type = commitType(commit.message);
            const isLast = i === commits.length - 1;
            return (
              <div className={`timeline-item ${isLast ? "is-last" : ""}`} key={commit.fullHash}>
                <div className="timeline-marker">
                  <span className={`marker-dot ${type.variant}`} />
                  {!isLast && <span className="marker-line" />}
                </div>
                <article className="timeline-card">
                  <div className="timeline-card-header">
                    <span className={`commit-badge ${type.variant}`}>
                      {type.label}
                    </span>
                    <span className="commit-date">
                      {formatDate(commit.date)}
                    </span>
                  </div>
                  <p className="commit-message">{commit.message}</p>
                  <div className="commit-meta">
                    <code className="commit-hash">{commit.hash}</code>
                    <span className="commit-author">{authorName(commit.author)}</span>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
