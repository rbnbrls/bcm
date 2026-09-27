import Link from "next/link";
import { clientConfigDataModel } from "@/lib/client-config-data-model";
import {
  clientConfigDataCatalog,
  DATA_CATALOG_OPERATIONS,
  type DataCatalogOperation,
} from "@/lib/workflow-studio/data-catalog";
import { clientConfigMutationAdapterRegistry } from "@/lib/workflow-studio/mutation-adapters";
import { RelationalModelExplorer } from "./relational-model-explorer";

function lifecycleLabel(value: string) {
  if (value === "live") return "Live";
  if (value === "staging") return "Staging";
  if (value === "audit") return "Audit";
  return "Legacy";
}

function operationBadges(resourceId: string, operations: readonly DataCatalogOperation[]) {
  return operations.map((operation) => {
    const adapter = clientConfigMutationAdapterRegistry.resolve(resourceId, operation);
    return (
      <span className="status-pill" key={operation} title={adapter ? adapter.stageHandlerId : "Geen runtime adapter"}>
        {operation}
      </span>
    );
  });
}

export default function ClientConfigDataCatalogPage() {
  const resources = clientConfigDataCatalog.list();
  const requestablePairs = resources.flatMap((resource) => (
    DATA_CATALOG_OPERATIONS
      .filter((operation) => resource.attributes.some((attribute) => attribute.requestableOperations.includes(operation)))
      .map((operation) => ({ resourceId: resource.id, operation }))
  ));
  const executablePairs = requestablePairs.filter((pair) => (
    clientConfigMutationAdapterRegistry.resolve(pair.resourceId, pair.operation)
  ));

  return (
    <div className="page-shell config-shell">
      <div className="page-intro">
        <div>
          <p className="eyebrow">BEHEER</p>
          <h1>Data catalogus</h1>
          <p>Beheerde client-configresources, runtime-mutaties en het volledige databaseschema achter de beheerpagina.</p>
        </div>
        <div className="standard-note">
          <b>{executablePairs.length}/{requestablePairs.length}</b>
          <span>aanvraagbare resource-operaties runtime-uitvoerbaar</span>
        </div>
      </div>

      <div className="bottom-actions" style={{ justifyContent: "flex-start", marginBottom: 24, marginTop: -22 }}>
        <Link className="button button-secondary" href="/admin/client-config">Terug naar client config</Link>
        <Link className="button button-secondary" href="/workflow-studio">Workflow Studio</Link>
      </div>

      <section className="data-model-section">
        <div className="section-heading">
          <p className="eyebrow">DIAGRAM</p>
          <h2>Relationeel datamodel</h2>
        </div>
        <RelationalModelExplorer tables={clientConfigDataModel} />
      </section>

      <section className="data-model-section">
        <div className="section-heading">
          <p className="eyebrow">WORKFLOW CATALOGUS</p>
          <h2>Resources en change contracts</h2>
        </div>
        <div className="data-resource-grid">
          {resources.map((resource) => {
            const resourceOperations = DATA_CATALOG_OPERATIONS.filter((operation) => (
              resource.attributes.some((attribute) => attribute.requestableOperations.includes(operation))
            ));
            return (
              <article className="data-resource-card" key={resource.id}>
                <div>
                  <p className="eyebrow">{resource.authorizationScope}</p>
                  <h3>{resource.label}</h3>
                  <p>{resource.description}</p>
                </div>
                <div className="data-badge-row">
                  <code>{resource.id}</code>
                  {resourceOperations.length > 0 ? operationBadges(resource.id, resourceOperations) : <span className="data-muted">Alleen lezen</span>}
                </div>
                <table className="runtime-table">
                  <thead>
                    <tr><th>Attribuut</th><th>Type</th><th>Operaties</th></tr>
                  </thead>
                  <tbody>
                    {resource.attributes.map((attribute) => (
                      <tr key={attribute.id}>
                        <td><code>{attribute.id}</code><br /><small>{attribute.label}</small></td>
                        <td>{attribute.valueType}</td>
                        <td>{attribute.requestableOperations.length > 0 ? attribute.requestableOperations.join(", ") : "read"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            );
          })}
        </div>
      </section>

      <section className="data-model-section">
        <div className="section-heading">
          <p className="eyebrow">DATABASE</p>
          <h2>Tabellen en kolommen</h2>
        </div>
        <div className="data-table-list">
          {clientConfigDataModel.map((table) => (
            <article className="data-table-card" key={table.name}>
              <header>
                <div>
                  <p className="eyebrow">{lifecycleLabel(table.lifecycle)}</p>
                  <h3><code>{table.name}</code></h3>
                  <p>{table.purpose}</p>
                </div>
                <span className="status-pill">{table.columns.length} kolommen</span>
              </header>
              <div className="runtime-table-wrap">
                <table className="runtime-table">
                  <thead>
                    <tr><th>Kolom</th><th>Type</th><th>Contract</th><th>Referentie</th></tr>
                  </thead>
                  <tbody>
                    {table.columns.map((column) => (
                      <tr key={column.name}>
                        <td><code>{column.name}</code></td>
                        <td>{column.type}</td>
                        <td>
                          {column.key ? `${column.key} · ` : ""}
                          {column.nullable ? "nullable" : "not null"}
                          {column.default ? ` · default ${column.default}` : ""}
                          {column.check ? <><br /><small>{column.check}</small></> : null}
                        </td>
                        <td>{column.references ? <code>{column.references}</code> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.indexes && table.indexes.length > 0 ? (
                <p className="data-indexes">Indexen: {table.indexes.map((index) => <code key={index}>{index}</code>)}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
