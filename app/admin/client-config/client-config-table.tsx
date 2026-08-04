"use client";

import { useState, useMemo } from "react";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";
import {
  getAssetClassColor,
  getAssetClassLabel,
  getAssetClassDotStyle,
  getNpcClassificationColor,
  getNpcClassificationLabel,
  getActiveBadgeClass,
  getActiveLabel,
  getRowTintStyle,
} from "@/lib/client-config-formatting";
import { canEditClientConfigRow } from "@/lib/client-config-edit-permission";
import ClientConfigEditWizard from "./client-config-edit-wizard";
import { RetirePortfolioModal } from "./retire-portfolio-modal";

type Row = ClientConfigPortfolioConfigurationRow;

type SortDir = "asc" | "desc" | null;

type ColKey = keyof Row;

function formatClientLabel(row: Row) {
  const clientName = row.clientName?.trim();
  if (!clientName || clientName === row.clientCode) return row.clientCode;
  return `${clientName} (${row.clientCode})`;
}

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "clientName", label: "Klant" },
  { key: "primaryAccountId", label: "Primary account" },
  { key: "portfolioCode", label: "Portefeuille" },
  { key: "parentAccountCode", label: "Parent account" },
  { key: "longName", label: "Lange naam" },
  { key: "shortName", label: "Korte naam" },
  { key: "assetClassName", label: "Asset class" },
  { key: "subAssetClassName", label: "Sub asset class" },
  { key: "managerName", label: "Manager" },
  { key: "benchmarkName", label: "Benchmark" },
  { key: "npcClassificationName", label: "NPC classificatie" },
  { key: "effectiveFrom", label: "Geldig vanaf" },
  { key: "activeInd", label: "Actief" },
];

function formatCell(row: Row, key: ColKey) {
  switch (key) {
    case "clientName":
      return (
        <span className="config-table-client-label" title={formatClientLabel(row)}>
          {formatClientLabel(row)}
        </span>
      );
    case "primaryAccountId":
      return (
        <>
          <b>{row.primaryAccountId}</b>
          <small>{row.portfolioCode}</small>
        </>
      );
    case "portfolioCode":
      return <>{row.portfolioCode}</>;
    case "parentAccountCode":
      return <>{row.parentAccountCode ?? "—"}</>;
    case "longName":
      return <>{row.longName}</>;
    case "shortName":
      return <>{row.shortName}</>;
    case "assetClassName":
      return (
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={getAssetClassDotStyle(row.assetClassCode)} />
          <span
            style={{
              color: getAssetClassColor(row.assetClassCode),
              fontWeight: 600,
            }}
          >
            {row.assetClassName}
          </span>
          <small style={{ marginLeft: 4, opacity: 0.5 }}>
            ({row.assetClassCode})
          </small>
        </span>
      );
    case "subAssetClassName":
      return <>{row.subAssetClassName}</>;
    case "managerName":
      return (
        <>
          <b>{row.managerName}</b>
          <small>{row.managerCode}</small>
        </>
      );
    case "benchmarkName":
      return (
        <>
          <b>{row.benchmarkName ?? row.benchmarkCode}</b>
          <small>{row.benchmarkCode}</small>
        </>
      );
    case "npcClassificationName":
      return (
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: "0.85em",
            fontWeight: 600,
            color: "#fff",
            backgroundColor: getNpcClassificationColor(row.npcClassificationId),
          }}
        >
          {row.npcClassificationName}
        </span>
      );
    case "effectiveFrom":
      return <>{row.effectiveFrom}</>;
    case "activeInd":
      return (
        <span className={getActiveBadgeClass(row.activeInd)}>
          {getActiveLabel(row.activeInd)}
        </span>
      );
    default:
      return <>{String(row[key] ?? "—")}</>;
  }
}

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (dir === "asc") return <span className="sort-icon sort-icon--asc">▲</span>;
  if (dir === "desc")
    return <span className="sort-icon sort-icon--desc">▼</span>;
  return <span className="sort-icon sort-icon--none">⇅</span>;
};

export default function ClientConfigTable({
  rows,
  onEditRow,
  canEditRow = canEditClientConfigRow,
}: {
  rows: Row[];
  /** Called when a row's edit trigger is clicked; receives the full row so the
   *  wizard can use `row.primaryAccountId` as the stable target identity. */
  onEditRow?: (row: Row) => void;
  /** Permission predicate — the edit trigger renders only for rows where this
   *  returns true. Defaults to the data-driven rule (active rows only). */
  canEditRow?: (row: Row) => boolean;
}) {
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [query, setQuery] = useState("");
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [retiringRow, setRetiringRow] = useState<Row | null>(null);

  function handleEdit(row: Row) {
    setEditingRow(row);
    onEditRow?.(row);
  }

  function handleSort(key: ColKey) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      } else {
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    let data = [...rows];

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      data = data.filter((row) =>
        Object.values(row).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }

    if (sortKey && sortDir) {
      data.sort((a, b) => {
        const aVal = a[sortKey] ?? "";
        const bVal = b[sortKey] ?? "";
        if (aVal === bVal) return 0;
        const comparison = aVal < bVal ? -1 : 1;
        return sortDir === "asc" ? comparison : -comparison;
      });
    }

    return data;
  }, [rows, query, sortKey, sortDir]);

  return (
    <>
      <div className="config-table-toolbar">
        <input
          className="catalog-search"
          type="text"
          placeholder="Zoek op primary account, portefeuille, asset class, manager…"
          aria-label="Zoeken in client config"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="config-table-count">
          {filtered.length} van {rows.length} account(s)
        </span>
      </div>

      <section className="config-table-wrap">
        <table className="config-table">
          <caption style={{ display: "none" }}>
            Client config met zoek- en sorteerfuncties
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    className={`sort-header ${sortKey === col.key ? "sort-header--active" : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon dir={sortKey === col.key ? sortDir : null} />
                  </button>
                </th>
              ))}
              <th scope="col" className="config-table-actions-head">
                Acties
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="config-table-empty">
                  Geen client config rijen gevonden voor de huidige
                  zoekopdracht.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.primaryAccountId}
                  style={getRowTintStyle(row.assetClassCode)}
                >
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={col.key === "clientName" ? "config-table-client-cell" : undefined}
                    >
                      {formatCell(row, col.key)}
                    </td>
                  ))}
                  <td className="config-table-actions">
                    {canEditRow(row) && (
                      <button
                        type="button"
                        className="config-edit-btn"
                        onClick={() => handleEdit(row)}
                        aria-label={`Bewerk rij ${row.primaryAccountId}`}
                        data-edit-row={row.primaryAccountId}
                      >
                        Bewerken
                      </button>
                    )}
                    <button
                      type="button"
                      className="config-row-retire"
                      disabled={!row.activeInd}
                      onClick={() => setRetiringRow(row)}
                      title={
                        row.activeInd
                          ? "Beëindig deze portfolio configuratie via een change verzoek"
                          : "Alleen actieve configuraties kunnen worden beëindigd"
                      }
                      aria-label={`Beëindig portfolio configuratie ${row.primaryAccountId}`}
                    >
                      Beëindigen
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {retiringRow && (
        <RetirePortfolioModal
          row={retiringRow}
          onClose={() => setRetiringRow(null)}
        />
      )}
      {editingRow && (
        <ClientConfigEditWizard
          row={editingRow}
          onClose={() => setEditingRow(null)}
        />
      )}
    </>
  );
}
