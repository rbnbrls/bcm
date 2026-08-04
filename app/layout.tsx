import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { FeedbackButton } from "@/components/feedback-button";
import { NavBar } from "@/components/navbar";
import { ProfileSwitcher } from "@/components/profile-switcher";
import { StaleActionRecovery } from "@/components/stale-action-recovery";

export const metadata: Metadata = {
  title: "BCM | Business Change Management",
  description: "First-time-right change requests for investment management.",
};

// All pages query live data and there is no static content worth caching.
// force-dynamic also prevents Next.js from emitting prerendered HTML with
// s-maxage=31536000 (a stale document served by the CDN after a deploy keeps
// old JS chunk URLs + old server action IDs alive for up to a year, which is
// the amplifier behind UnrecognizedActionError — see issue #293).
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <StaleActionRecovery />
        <header className="topbar">
          <Link className="brand" href="/" aria-label="BCM home"><span>BC</span> Management</Link>
          <NavBar />
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
            <ProfileSwitcher />
          </div>
        </header>
        <main>{children}</main>
        <FeedbackButton />
      </body>
    </html>
  );
}
