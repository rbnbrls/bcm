import Link from "next/link";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";

export default function HomePage() {
  return (
    <div className="page-shell home-shell">
      <section className="hero" role="region" aria-label="Dashboard">
        <p className="eyebrow">DASHBOARD</p>
        <h1>Welkom bij BCM</h1>
        <p className="hero-copy">
          Kies een categorie om te beginnen met het beheren van benchmark
          wijzigingen voor je klanten.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link className="button button-primary" href="/changes/new">
            Change aanvragen →
          </Link>
        </div>
      </section>

      <DashboardGrid />
    </div>
  );
}
