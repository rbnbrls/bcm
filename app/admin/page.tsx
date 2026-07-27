import Link from "next/link";

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

        <Link href="/admin/client-config/import" className="admin-card">
          <h2>Client config importeren</h2>
          <p>Importeer klanten en portefeuilles via CSV. De benchmarkcodes moeten al bestaan in de catalogus.</p>
        </Link>

        <Link href="/admin/benchmarks/import" className="admin-card">
          <h2>Benchmarks importeren</h2>
          <p>Importeer of werk de benchmark catalogus bij via CSV. Korte termijn oplossing totdat de catalogus vanuit Bloomberg/MSCI/FactSet wordt gevoed.</p>
        </Link>

        <Link href="/admin/webhooks" className="admin-card">
          <h2>Webhooks</h2>
          <p>Configureer webhooks naar asset servicer en FactSet voor STP (straight-through-processing) bij goedgekeurde changes.</p>
        </Link>

        <Link href="/admin/change-types" className="admin-card">
          <h2>Change catalogus</h2>
          <p>Beheer change types, kosten, doorlooptijd, velden en stakeholders die in de change catalogus worden getoond.</p>
        </Link>

        <Link href="/admin/attribute-options" className="admin-card">
          <h2>Attribuutopties</h2>
          <p>Beheer de toegestane opties voor WTP classificatie, Asset class, Manager en Benchmark.</p>
        </Link>
      </div>
    </div>
  );
}
