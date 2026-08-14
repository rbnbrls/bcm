import Link from "next/link";
import {
  clientConfigDataModel,
  type ClientConfigTableModel,
} from "@/lib/client-config-data-model";
import {
  clientConfigDataCatalog,
  DATA_CATALOG_OPERATIONS,
  type DataCatalogOperation,
} from "@/lib/workflow-studio/data-catalog";
import { clientConfigMutationAdapterRegistry } from "@/lib/workflow-studio/mutation-adapters";

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

const diagramPositions: Record<string, { x: number; y: number; w: number; h: number }> = {
  "client_config.legal_entity": { x: 40, y: 40, w: 230, h: 120 },
  "client_config.client": { x: 330, y: 40, w: 230, h: 120 },
  "client_config.parent_account": { x: 620, y: 40, w: 250, h: 138 },
  "client_config.portfolio": { x: 930, y: 40, w: 250, h: 138 },
  "client_config.asset_class": { x: 40, y: 260, w: 240, h: 138 },
  "client_config.sub_asset_class": { x: 330, y: 260, w: 260, h: 150 },
  "client_config.manager": { x: 650, y: 260, w: 230, h: 130 },
  "client_config.benchmark": { x: 940, y: 260, w: 250, h: 140 },
  "client_config.npc_classification": { x: 1240, y: 260, w: 250, h: 120 },
  "client_config.portfolio_configuration": { x: 500, y: 520, w: 330, h: 220 },
  "client_config.change_portfolio_configuration": { x: 390, y: 860, w: 330, h: 160 },
  "client_config.change_lookup_request": { x: 770, y: 860, w: 310, h: 160 },
  "client_config.client_onboarding_staging": { x: 1130, y: 860, w: 330, h: 170 },
  "client_config.change_portfolio_metadata_request": { x: 40, y: 910, w: 310, h: 150 },
  "client_config.admin_audit_log": { x: 1500, y: 860, w: 250, h: 130 },
};

type DiagramEdge = Readonly<{
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}>;

function shortTableName(name: string) {
  return name.replace("client_config.", "");
}

function referenceParts(reference: string) {
  const parts = reference.split(".");
  if (parts.length < 3) return null;
  return {
    table: `${parts[0]}.${parts[1]}`,
    column: parts.slice(2).join("."),
  };
}

function diagramEdges(tables: readonly ClientConfigTableModel[]): readonly DiagramEdge[] {
  return tables.flatMap((table) => table.columns.flatMap((column) => {
    if (!column.references) return [];
    const reference = referenceParts(column.references);
    if (!reference || !diagramPositions[table.name] || !diagramPositions[reference.table]) return [];
    return [{
      id: `${table.name}.${column.name}->${reference.table}.${reference.column}`,
      fromTable: table.name,
      fromColumn: column.name,
      toTable: reference.table,
      toColumn: reference.column,
    }];
  }));
}

function edgePath(edge: DiagramEdge) {
  const from = diagramPositions[edge.fromTable]!;
  const to = diagramPositions[edge.toTable]!;
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const start = fromCenter.x < toCenter.x
    ? { x: from.x + from.w, y: fromCenter.y }
    : { x: from.x, y: fromCenter.y };
  const end = fromCenter.x < toCenter.x
    ? { x: to.x, y: toCenter.y }
    : { x: to.x + to.w, y: toCenter.y };
  const midX = start.x + (end.x - start.x) / 2;
  return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
}

function DiagramTable({ table }: { table: ClientConfigTableModel }) {
  const position = diagramPositions[table.name]!;
  const visibleColumns = table.columns.filter((column) => column.key || column.references).slice(0, 8);
  return (
    <article
      className={`erd-node erd-node--${table.lifecycle}`}
      style={{ left: position.x, top: position.y, width: position.w, minHeight: position.h }}
    >
      <header>
        <span>{lifecycleLabel(table.lifecycle)}</span>
        <strong>{shortTableName(table.name)}</strong>
      </header>
      <ul>
        {visibleColumns.map((column) => (
          <li key={column.name} data-key={column.key ?? "column"}>
            <span>{column.key === "primary" ? "PK" : column.key === "foreign" ? "FK" : column.key === "unique" ? "UQ" : ""}</span>
            <code>{column.name}</code>
          </li>
        ))}
      </ul>
      {table.columns.length > visibleColumns.length ? <p>+{table.columns.length - visibleColumns.length} kolommen</p> : null}
    </article>
  );
}

function RelationalDiagram() {
  const edges = diagramEdges(clientConfigDataModel);
  return (
    <div className="erd-shell" role="img" aria-label="Relationeel datamodeldiagram voor client_config">
      <div className="erd-canvas">
        <svg className="erd-lines" viewBox="0 0 1800 1120" aria-hidden="true">
          <defs>
            <marker id="erd-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          {edges.map((edge) => (
            <g key={edge.id}>
              <path d={edgePath(edge)} />
              <title>{`${shortTableName(edge.fromTable)}.${edge.fromColumn} -> ${shortTableName(edge.toTable)}.${edge.toColumn}`}</title>
            </g>
          ))}
        </svg>
        {clientConfigDataModel.map((table) => <DiagramTable table={table} key={table.name} />)}
      </div>
    </div>
  );
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
        <RelationalDiagram />
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
