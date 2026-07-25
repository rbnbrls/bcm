"use client";

import { useState, useMemo } from "react";
import type { Benchmark } from "@/lib/types";

type SortDir = "asc" | "desc" | null;

type ColKey = keyof Benchmark;

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "code", label: "Short name" },
  { key: "name", label: "Long name" },
  { key: "id", label: "Identifier" },
  { key: "assetClass", label: "Asset class" },
  { key: "cost", label: "Kosten (€)" },
  { key: "provider", label: "Leverancier" },
];

function getFilterValue(benchmark: Benchmark, key: ColKey): string {
  switch (key) {
    case "code":
      return benchmark.code.toLowerCase();
    case "name":
      return benchmark.name.toLowerCase();
    case "id":
      return benchmark.id.toLowerCase();
    case "assetClass":
      return benchmark.assetClass.toLowerCase();
    case "cost":
      return String(benchmark.cost);
    case "provider":
      return benchmark.provider.toLowerCase();
    default:
      return "";
  }
}

function getCellContent(benchmark: Benchmark, key: ColKey) {
  switch (key) {
    case "code":
      return <b>{benchmark.code}</b>;
    case "name":
      return <span>{benchmark.name}</span>;
    case "id":
      return <code className="id-cell">{benchmark.id.slice(0, 8)}…</code>;
    case "assetClass":
      return <span className="asset-pill">{benchmark.assetClass}</span>;
    case "cost":
      return <span className="cost-cell">€ {benchmark.cost.toLocaleString("nl-NL")}</span>;
    case "provider":
      return <span>{benchmark.provider}</span>;
    default:
      return null;
  }
}

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (dir === "asc") return <span className="sort-icon sort-icon--asc">▲</span>;
  if (dir === "desc") return <span className="sort-icon sort-icon--desc">▼</span>;
  return <span className="sort-icon sort-icon--none">⇅</span>;
};

export default function BenchmarkCatalogTable({ benchmarks }: { benchmarks: Benchmark[] }) {
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [query, setQuery] = useState("");

  function handleSort(key: ColKey) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else { setSortDir("asc"); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    let data = [...benchmarks];

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      data = data.filter((b) =>
        b.code.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        b.assetClass.toLowerCase().includes(q) ||
        b.provider.toLowerCase().includes(q)
      );
    }

    if (sortKey && sortDir) {
      data.sort((a, b) => {
        let va: string | number = "";
        let vb: string | number = "";
        if (sortKey === "cost") {
          va = a.cost;
          vb = b.cost;
        } else {
          va = String(a[sortKey] ?? "").toLowerCase();
          vb = String(b[sortKey] ?? "").toLowerCase();
        }
        const cmp = typeof va === "number" ? (va as number) - (vb as number) : String(va).localeCompare(String(vb), "nl");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return data;
  }, [benchmarks, query, sortKey, sortDir]);

  return (
    <>
      <div className="config-table-toolbar">
        <input
          className="catalog-search"
          type="text"
          placeholder="Zoek op naam, asset class of leverancier…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="config-table-count">{filtered.length} van {benchmarks.length} benchmarks</span>
      </div>

      <section className="config-table-wrap">
        <table className="config-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key}>
                  <button
                    className={`sort-header ${sortKey === col.key ? "sort-header--active" : ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon dir={sortKey === col.key ? sortDir : null} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="config-table-empty">
                  Geen benchmarks gevonden voor de huidige zoekopdracht.
                </td>
              </tr>
            ) : (
              filtered.map((benchmark) => (
                <tr key={benchmark.id}>
                  {COLUMNS.map((col) => (
                    <td key={col.key}>{getCellContent(benchmark, col.key)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
