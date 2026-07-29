"use client";

import { useState, useMemo } from "react";
import type { ClientConfigPortfolioConfigurationRow } from "@/lib/types";

type Row = ClientConfigPortfolioConfigurationRow;

type SortDir = "asc" | "desc" | null;

type ColKey = keyof Row;

const COLUMNS: { key: ColKey; label: string }[] = [
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
      return <>{row.assetClassName}</>;
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
      return <>{row.npcClassificationName}</>;
    case "effectiveFrom":
      return <>{row.effectiveFrom}</>;
    case "activeInd":
      return <span className={row.activeInd ? "status-badge active" : "status-badge inactive"}>{row.activeInd ? "Ja" : "Nee"}</span>;
    default:
      return <>{String(row[key] ?? "—")}</>;
  }
}

export default function ClientConfigTable({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<{ key: ColKey; dir: SortDir } | null>(null);
  const [filter, setFilter] = useState("");

  const filteredRows = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? "").toLowerCase().includes(q)
      )
    );
  }, [rows, filter]);

  const sortedRows = useMemo(() => {
    if (!sort || !sort.dir) return filteredRows;
    const { key, dir } = sort;
    return [...filteredRows].sort((a, b) => {
      const aVal = a[key] ?? "";
      const bVal = b[key] ?? "";
      if (aVal === bVal) return 0;
      const comparison = aVal < bVal ? -1 : 1;
      return dir === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, sort]);

  function toggleSort(key: ColKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  return (
    <div className="client-config-table-wrapper">
      <div className="table-toolbar">
        <input
          type="text"
          placeholder="Filter rijen..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="filter-input"
        />
        <span className="row-count">{sortedRows.length} account(s)</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="sortable-header">
                  {col.label}
                  {sort?.key === col.key && (sort.dir === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.primaryAccountId}>
                {COLUMNS.map((col) => (
                  <td key={col.key}>{formatCell(row, col.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
