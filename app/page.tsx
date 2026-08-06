import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { getIdentityContext } from "@/lib/identity/request";
import { DEFAULT_ROLE, getIdentityRoles } from "@/lib/rbac";

export default async function HomePage() {
  const identity = await getIdentityContext();
  const activeRole = getIdentityRoles(identity)[0] ?? DEFAULT_ROLE;
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

      <DashboardGrid initialRole={activeRole} />
    </div>
  );
}
