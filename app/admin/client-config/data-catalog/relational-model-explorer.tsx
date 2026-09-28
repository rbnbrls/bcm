"use client";

import { useMemo, useRef, useState } from "react";
import type { ClientConfigTableModel } from "@/lib/client-config-data-model";

type DiagramBox = Readonly<{ x: number; y: number; w: number; h: number }>;

const CANVAS = { width: 1840, height: 1540 };

const diagramPositions: Record<string, DiagramBox> = {
  "client_config.legal_entity": { x: 48, y: 46, w: 250, h: 154 },
  "client_config.client": { x: 354, y: 46, w: 250, h: 154 },
  "client_config.parent_account": { x: 660, y: 46, w: 270, h: 190 },
  "client_config.portfolio": { x: 986, y: 46, w: 270, h: 190 },
  "client_config.asset_class": { x: 48, y: 306, w: 270, h: 174 },
  "client_config.sub_asset_class": { x: 374, y: 292, w: 300, h: 218 },
  "client_config.manager": { x: 730, y: 306, w: 250, h: 174 },
  "client_config.benchmark": { x: 1036, y: 292, w: 286, h: 198 },
  "client_config.npc_classification": { x: 1378, y: 306, w: 300, h: 174 },
  "client_config.portfolio_configuration": { x: 650, y: 592, w: 386, h: 360 },
  "client_config.change_portfolio_configuration": { x: 1104, y: 602, w: 390, h: 372 },
  "client_config.change_lookup_request": { x: 40, y: 668, w: 360, h: 342 },
  "client_config.client_onboarding_staging": { x: 40, y: 1068, w: 430, h: 430 },
  "client_config.change_portfolio_metadata_request": { x: 528, y: 1038, w: 394, h: 268 },
  "client_config.admin_audit_log": { x: 1518, y: 680, w: 280, h: 236 },
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

function lifecycleLabel(value: string) {
  if (value === "live") return "Live";
  if (value === "staging") return "Staging";
  if (value === "audit") return "Audit";
  return "Legacy";
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
  return tables.flatMap((table) =>
    table.columns.flatMap((column) => {
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
    }),
  );
}

function port(from: DiagramBox, to: DiagramBox) {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: from.x + from.w, y: fromCenter.y, side: "right" as const }
      : { x: from.x, y: fromCenter.y, side: "left" as const };
  }

  return dy > 0
    ? { x: fromCenter.x, y: from.y + from.h, side: "bottom" as const }
    : { x: fromCenter.x, y: from.y, side: "top" as const };
}

function edgePath(edge: DiagramEdge, index: number) {
  const from = diagramPositions[edge.fromTable]!;
  const to = diagramPositions[edge.toTable]!;
  const start = port(from, to);
  const end = port(to, from);
  const offset = ((index % 5) - 2) * 12;

  if ((start.side === "left" || start.side === "right") && (end.side === "left" || end.side === "right")) {
    const midX = start.x + (end.x - start.x) / 2 + offset;
    return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
  }

  if ((start.side === "top" || start.side === "bottom") && (end.side === "top" || end.side === "bottom")) {
    const midY = start.y + (end.y - start.y) / 2 + offset;
    return `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
  }

  const elbow = { x: end.x, y: start.y + offset };
  return `M ${start.x} ${start.y} L ${start.x} ${elbow.y} L ${elbow.x} ${elbow.y} L ${end.x} ${end.y}`;
}

function clampScale(value: number) {
  return Math.min(1.45, Math.max(0.38, value));
}

function edgeTouches(edge: DiagramEdge, tableName: string) {
  return edge.fromTable === tableName || edge.toTable === tableName;
}

function DiagramTable({
  table,
  selected,
  related,
  dimmed,
  onSelect,
}: {
  table: ClientConfigTableModel;
  selected: boolean;
  related: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const position = diagramPositions[table.name]!;

  return (
    <button
      className="erd-node"
      data-lifecycle={table.lifecycle}
      data-selected={selected}
      data-related={related}
      data-dimmed={dimmed}
      style={{ left: position.x, top: position.y, width: position.w, height: position.h }}
      type="button"
      onClick={onSelect}
    >
      <header>
        <span>{lifecycleLabel(table.lifecycle)}</span>
        <strong>{shortTableName(table.name)}</strong>
      </header>
      <ul>
        {table.columns.map((column) => (
          <li key={column.name} data-key={column.key ?? "column"} data-reference={column.references ? "true" : "false"}>
            <span>{column.key === "primary" ? "PK" : column.key === "foreign" ? "FK" : column.key === "unique" ? "UQ" : ""}</span>
            <code>{column.name}</code>
            <small>{column.type}</small>
          </li>
        ))}
      </ul>
    </button>
  );
}

export function RelationalModelExplorer({ tables }: { tables: readonly ClientConfigTableModel[] }) {
  const edges = useMemo(() => diagramEdges(tables), [tables]);
  const [selectedTable, setSelectedTable] = useState("client_config.portfolio_configuration");
  const [query, setQuery] = useState("");
  const [transform, setTransform] = useState({ x: -250, y: -90, scale: 0.74 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);

  const selected = tables.find((table) => table.name === selectedTable) ?? tables[0];
  const relatedTables = useMemo(() => new Set(
    edges
      .filter((edge) => edgeTouches(edge, selectedTable))
      .flatMap((edge) => [edge.fromTable, edge.toTable]),
  ), [edges, selectedTable]);

  const matchingTables = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return new Set(tables.map((table) => table.name));
    return new Set(tables
      .filter((table) =>
        table.name.toLowerCase().includes(normalized) ||
        table.columns.some((column) => column.name.toLowerCase().includes(normalized)),
      )
      .map((table) => table.name));
  }, [query, tables]);

  const selectedEdges = edges.filter((edge) => edgeTouches(edge, selectedTable));
  const inbound = selectedEdges.filter((edge) => edge.toTable === selectedTable);
  const outbound = selectedEdges.filter((edge) => edge.fromTable === selectedTable);

  function zoom(delta: number) {
    setTransform((current) => ({ ...current, scale: clampScale(current.scale + delta) }));
  }

  function fitSelected(tableName = selectedTable) {
    const box = diagramPositions[tableName];
    if (!box) return;
    setTransform({
      scale: 0.92,
      x: 420 - (box.x + box.w / 2) * 0.92,
      y: 300 - (box.y + box.h / 2) * 0.92,
    });
  }

  return (
    <div className="erd-workbench">
      <div className="erd-toolbar">
        <label>
          <span>Zoeken</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tabel of kolom" />
        </label>
        <div className="erd-tool-buttons">
          <button type="button" onClick={() => zoom(0.1)} aria-label="Inzoomen">+</button>
          <button type="button" onClick={() => zoom(-0.1)} aria-label="Uitzoomen">-</button>
          <button type="button" onClick={() => fitSelected()}>Fit</button>
          <button type="button" onClick={() => setTransform({ x: -250, y: -90, scale: 0.74 })}>Reset</button>
        </div>
        <span className="erd-zoom">{Math.round(transform.scale * 100)}%</span>
      </div>

      <div className="erd-main">
        <aside className="erd-table-index" aria-label="Databasetabellen">
          {tables.map((table) => {
            const matches = matchingTables.has(table.name);
            return (
              <button
                key={table.name}
                type="button"
                data-selected={table.name === selectedTable}
                data-dimmed={!matches}
                onClick={() => {
                  setSelectedTable(table.name);
                  fitSelected(table.name);
                }}
              >
                <span>{lifecycleLabel(table.lifecycle)}</span>
                <strong>{shortTableName(table.name)}</strong>
                <small>{table.columns.length} kolommen</small>
              </button>
            );
          })}
        </aside>

        <section
          className="erd-viewport"
          aria-label="Interactief relationeel model voor client_config"
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            zoom(event.deltaY > 0 ? -0.08 : 0.08);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement;
            if (target.closest(".erd-node")) return;
            dragRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              originX: transform.x,
              originY: transform.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            setTransform((current) => ({
              ...current,
              x: drag.originX + event.clientX - drag.x,
              y: drag.originY + event.clientY - drag.y,
            }));
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <div
            className="erd-canvas"
            style={{
              width: CANVAS.width,
              height: CANVAS.height,
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          >
            <svg className="erd-lines" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} aria-hidden="true">
              <defs>
                <marker id="erd-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {edges.map((edge, index) => {
                const active = edgeTouches(edge, selectedTable);
                const dimmed = !active && query.trim().length > 0 && (!matchingTables.has(edge.fromTable) || !matchingTables.has(edge.toTable));
                return (
                  <path
                    key={edge.id}
                    d={edgePath(edge, index)}
                    data-active={active}
                    data-dimmed={dimmed}
                  />
                );
              })}
            </svg>
            {tables.map((table) => {
              const matches = matchingTables.has(table.name);
              return (
                <DiagramTable
                  key={table.name}
                  table={table}
                  selected={table.name === selectedTable}
                  related={relatedTables.has(table.name)}
                  dimmed={!matches}
                  onSelect={() => setSelectedTable(table.name)}
                />
              );
            })}
          </div>
        </section>

        <aside className="erd-inspector" aria-label="Geselecteerde tabel">
          <p className="eyebrow">{lifecycleLabel(selected.lifecycle)}</p>
          <h3>{shortTableName(selected.name)}</h3>
          <p>{selected.purpose}</p>
          <dl>
            <div>
              <dt>Kolommen</dt>
              <dd>{selected.columns.length}</dd>
            </div>
            <div>
              <dt>Uitgaand</dt>
              <dd>{outbound.length}</dd>
            </div>
            <div>
              <dt>Inkomend</dt>
              <dd>{inbound.length}</dd>
            </div>
          </dl>
          <div className="erd-relation-list">
            {selectedEdges.length > 0 ? selectedEdges.map((edge) => (
              <button
                key={edge.id}
                type="button"
                onClick={() => setSelectedTable(edge.fromTable === selectedTable ? edge.toTable : edge.fromTable)}
              >
                <span>{edge.fromTable === selectedTable ? "FK" : "REF"}</span>
                <code>{shortTableName(edge.fromTable)}.{edge.fromColumn}</code>
                <small>{shortTableName(edge.toTable)}.{edge.toColumn}</small>
              </button>
            )) : <p className="data-muted">Geen relaties in dit model.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
