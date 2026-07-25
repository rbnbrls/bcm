import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { FeedbackButton } from "@/components/feedback-button";

export const metadata: Metadata = {
  title: "BCM | Business Change Management",
  description: "First-time-right change requests for investment management.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <header className="topbar">
          <Link className="brand" href="/" aria-label="BCM home"><span>BC</span> Management</Link>
          <nav aria-label="Hoofdnavigatie">
            <Link href="/changes/new">Nieuwe change</Link>
            <Link href="/benchmarks">Benchmark catalogus</Link>
            <Link href="/admin/client-config">Client config</Link>
          </nav>
          <div className="topbar-right">
            <Link href="/updates" className="updates-link" aria-label="Updates en changelog" title="Updates">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12" />
                <rect x="2" y="7" width="20" height="5" />
                <line x1="12" y1="22" x2="12" y2="7" />
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
            </Link>
            <div className="user-chip" role="status" aria-live="polite"><span className="avatar">RV</span> Vermogensbeheerder</div>
          </div>
        </header>
        <main>{children}</main>
        <FeedbackButton />
      </body>
    </html>
  );
}
