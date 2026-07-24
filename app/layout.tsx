import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
            <Link href="/admin/client-config">Client config</Link>
          </nav>
          <div className="user-chip"><span className="avatar">RV</span> Vermogensbeheerder</div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
