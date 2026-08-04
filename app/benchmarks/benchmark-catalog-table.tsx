"use client";

import { useState, useMemo } from "react";
import type { ClientConfigBenchmark } from "@/lib/types";

type SortDir = "asc" | "desc" | null;

type ColKey = keyof ClientConfigBenchmark;

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "benchmarkCode", label: "Benchmarkcode" },
  { key: "benchmarkName", label: "Naam" },
  { key: "benchmarkId", label: "ID" },
  { key: "rimesCode", label: "Rimes code" },
];

function getFilterValue(benchmark: ClientConfigBenchmark, key: ColKey): string {
  switch (key) {
    case "benchmarkCode":
      return benchmark.benchmarkCode.toLowerCase();
    case "benchmarkName":
      return (benchmark.benchmarkName ?? "").toLowerCase();
    case "benchmarkId":
      return String(benchmark.benchmarkId);
    case "rimesCode":
      return (benchmark.rimesCode ?? "").toLowerCase();
    default:
      return "";
  }
}

function getCellContent(benchmark: ClientConfigBenchmark, key: ColKey) {
  switch (key) {
    case "benchmarkCode":
      return <b>{benchmark.benchmarkCode}</b>;
    case "benchmarkName":
      return <span>{benchmark.benchmarkName ?? ""}</span>;
    case "benchmarkId":
      return <code className="id-cell">{benchmark.benchmarkId}</code>;
    case "rimesCode":
      return <span>{benchmark.rimesCode ?? ""}</span>;
    default:
      return null;
  }
}

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (dir === "asc") return <span className="sort-icon sort-icon--asc">▲</span>;
  if (dir === "desc") return <span className="sort-icon sort-icon--desc">▼</span>;
  return <span className="sort-icon sort-icon--none">⇅</span>;
};

export default function BenchmarkCatalogTable({ benchmarks }: { benchmarks: ClientConfigBenchmark[] }) {
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
        b.benchmarkCode.toLowerCase().includes(q) ||
        (b.benchmarkName ?? "").toLowerCase().includes(q) ||
        (b.rimesCode ?? "").toLowerCase().includes(q)
      );
    }

    if (sortKey && sortDir) {
      data.sort((a, b) => {
        let va: string | number = "";
        let vb: string | number = "";
        if (sortKey === "benchmarkId") {
          va = a.benchmarkId;
          vb = b.benchmarkId;
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
          placeholder="Zoek op code, naam of Rimes code..."
          aria-label="Zoeken in benchmark catalogus"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="config-table-count">{filtered.length} van {benchmarks.length} benchmarks</span>
      </div>

      <section className="config-table-wrap">
        <table className="config-table">
          <caption style={{ display: "none" }}>Benchmark catalogus met zoek- en sorteerfuncties</caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
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
                <td colSpan={COLUMNS.length} className="config-table-empty">
                  Geen benchmarks gevonden voor de huidige zoekopdracht.
                </td>
              </tr>
            ) : (
              filtered.map((benchmark) => (
                <tr key={benchmark.benchmarkId}>
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
