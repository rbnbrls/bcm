import Link from "next/link";
import { ResetSeedDataCard } from "./reset-seed-data-card";

export default function AdminPage() {
  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="eyebrow">ADMIN</p>
        <h1>Beheer</h1>
        <p>Beheer data, integraties en configuratie van BCM.</p>
      </div>

      <div className="admin-grid">
        <Link href="/admin/client-config" className="admin-card">
          <h2>Client config</h2>
          <p>Bekijk, filter en sorteer de huidige client configuratie. In productie wordt deze bron gevoed vanuit CRM, catalogus, tarieven, facturatie en klantrapportage.</p>
        </Link>

        <Link href="/admin/service-catalog" className="admin-card">
          <h2>Service catalogus</h2>
          <p>Bekijk beschikbare asset classes, sub asset classes en benchmarks, plus klantdiensten vanuit portfolio_configuration.</p>
        </Link>

        <Link href="/admin/webhooks" className="admin-card">
          <h2>Webhooks</h2>
          <p>Configureer webhooks naar asset servicer en FactSet voor STP (straight-through-processing) bij goedgekeurde changes.</p>
        </Link>

        <Link href="/admin/attribute-options" className="admin-card">
          <h2>Attribuutopties</h2>
          <p>Beheer de toegestane opties voor WTP classificatie, Asset class, Manager en Benchmark.</p>
        </Link>

        <ResetSeedDataCard />
      </div>
    </div>
  );
}
