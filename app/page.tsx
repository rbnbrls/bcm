import { DashboardGrid } from "@/components/dashboard/dashboard-grid";

export default function HomePage() {
  return (
    <div className="page-shell home-shell">
      <section className="hero" role="region" aria-label="Dashboard">
        <p className="eyebrow">DASHBOARD</p>
        <h1>Welkom bij BCM</h1>
        <p className="hero-instruction">
          Met dit dashboard beheer je eenvoudig benchmark wijzigingen voor je
          klanten. Kies hieronder een van de drie categorieën om te beginnen.
        </p>
      </section>

      <DashboardGrid />
    </div>
  );
}
