import Link from "next/link";

import { getServiceCatalogModel, type ServiceCatalogItem, type ServiceCatalogItemType } from "@/lib/service-catalog";

export const dynamic = "force-dynamic";

const typeLabels: Record<ServiceCatalogItemType, string> = {
  asset_class: "Asset classes",
  sub_asset_class: "Sub asset classes",
  benchmark: "Benchmarks",
};

function CatalogTable({ items, type }: { items: readonly ServiceCatalogItem[]; type: ServiceCatalogItemType }) {
  const rows = items.filter((item) => item.type === type);
  return (
    <section className="service-catalog-section">
      <h2>{typeLabels[type]}</h2>
      <div className="runtime-table-wrap">
        <table className="runtime-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Naam</th>
              <th>Status</th>
              <th>Configuraties</th>
              <th>Klanten</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.code}</strong></td>
                <td>{item.name}<br /><small>{item.description}</small></td>
                <td><span className={`studio-status studio-status--${item.status === "active" ? "published" : "draft"}`}>{item.status}</span></td>
                <td>{item.usageCount}</td>
                <td>{item.clientCodes.length > 0 ? item.clientCodes.join(", ") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ServiceCatalogPage() {
  const model = await getServiceCatalogModel();
  const configuredItems = model.items.filter((item) => item.usageCount > 0);

  return (
    <div className="page-shell service-catalog-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">ADMIN - SERVICE CATALOGUS</p>
          <h1>Service catalogus</h1>
          <p>Beschikbare services, producten en diensten. Klantactivatie wordt uitsluitend gelezen uit portfolio_configuration per primary account.</p>
        </div>
        <div className="page-intro-actions">
          <Link className="button button-secondary" href="/workflow-studio">Workflow Studio</Link>
          <Link className="button button-secondary" href="/workflow-runtime">Workflow Runtime</Link>
        </div>
      </header>

      <dl className="runtime-metric-grid">
        <div><dt>Asset classes</dt><dd>{model.summary.assetClasses}</dd></div>
        <div><dt>Sub asset classes</dt><dd>{model.summary.subAssetClasses}</dd></div>
        <div><dt>Benchmarks</dt><dd>{model.summary.benchmarks}</dd></div>
        <div><dt>Primary accounts</dt><dd>{model.summary.configuredPrimaryAccounts}</dd></div>
        <div><dt>Klanten</dt><dd>{model.summary.activeClients}</dd></div>
      </dl>

      <section className="standard-note">
        <b>Wijzigingen verlopen via workflows</b>
        <span>Deze catalogus is read-only. Nieuwe of gewijzigde klantproducten worden aangevraagd en toegepast via Workflow Studio en Workflow Runtime; directe mutaties op portfolio_configuration zijn niet toegestaan.</span>
      </section>

      <CatalogTable items={model.items} type="asset_class" />
      <CatalogTable items={model.items} type="sub_asset_class" />
      <CatalogTable items={model.items} type="benchmark" />

      <section className="service-catalog-section">
        <h2>Ingerichte diensten per klant</h2>
        <div className="runtime-table-wrap">
          <table className="runtime-table">
            <thead>
              <tr>
                <th>Primary account</th>
                <th>Klant</th>
                <th>Portfolio</th>
                <th>Asset class</th>
                <th>Sub asset class</th>
                <th>Benchmark</th>
                <th>Vanaf</th>
              </tr>
            </thead>
            <tbody>
              {model.clientConfigurations.map((row) => (
                <tr key={row.primaryAccountId}>
                  <td><strong>{row.primaryAccountId}</strong></td>
                  <td>{row.clientName ?? row.clientCode}<br /><small>{row.clientCode}</small></td>
                  <td>{row.portfolioCode}</td>
                  <td>{row.assetClassName}</td>
                  <td>{row.subAssetClassName}</td>
                  <td>{row.benchmarkName ?? row.benchmarkItemId.replace("benchmark:", "")}</td>
                  <td>{row.effectiveFrom}</td>
                </tr>
              ))}
              {model.clientConfigurations.length === 0 ? (
                <tr><td colSpan={7}>Geen portfolio_configuration rijen beschikbaar.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="service-catalog-section">
        <h2>Catalogusrelaties</h2>
        <div className="service-relation-list">
          {model.relations.slice(0, 60).map((relation) => {
            const from = model.items.find((item) => item.id === relation.fromItemId);
            const to = model.items.find((item) => item.id === relation.toItemId);
            return (
              <div key={relation.id}>
                <span>{from?.code ?? relation.fromItemId}</span>
                <b>{relation.relationType}</b>
                <span>{to?.code ?? relation.toItemId}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="service-catalog-section">
        <h2>Actieve catalogusitems</h2>
        <p className="catalog-subtitle">{configuredItems.length} catalogusitems zijn momenteel gekoppeld aan minimaal een primary account.</p>
      </section>
    </div>
  );
}
