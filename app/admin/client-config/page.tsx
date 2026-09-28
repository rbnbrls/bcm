import Link from "next/link";
import { getClientConfigPortfolioConfigurations } from "@/lib/client-config-db";
import ClientConfigTable from "./client-config-table";

export default async function ClientConfigPage() {
  const rows = await getClientConfigPortfolioConfigurations();

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">BRONREGISTRATIE</p>
          <h1>Client config</h1>
          <p>Genormaliseerde client configuration: één rij per primary account, met propere relaties naar asset class, sub asset class, manager, benchmark en NPC classificatie.</p>
        </div>
        <div className="standard-note">
          <b>Configuratiebron</b>
          <span>Per primary account, portefeuille en benchmark.</span>
        </div>
      </div>
      <div className="bottom-actions" style={{ justifyContent: "flex-start", marginBottom: 18, marginTop: -24 }}>
        <Link className="button button-secondary" href="/admin/client-config/data-catalog">
          Data catalogus
        </Link>
        <Link className="button button-secondary" href="/admin/service-catalog">
          Service catalogus
        </Link>
      </div>
      <ClientConfigTable rows={rows} />
    </div>
  );
}
