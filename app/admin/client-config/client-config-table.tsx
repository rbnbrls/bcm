"use client";

import { useState, useMemo, useCallback } from "react";
import { updateClientAssetClassAction, updatePortfolioAttributeAction, type UpdateAssetClassState, type UpdatePortfolioAttributeState } from "./actions";
import { ASSET_CLASSES } from "@/lib/types";
import type { WtpClassification, AssetClassRow, Manager, BenchmarkGroup } from "@/lib/types";

type Row = {
  clientName: string;
  clientReference: string;
  portfolioName: string;
  benchmarkCode: string;
  benchmarkName: string;
  portfolioReference: string;
  portfolioId: string;
  assetClass: string | null;
  wtpClassificationId: string;
  wtpClassificationName: string;
  assetClassRowId: string;
  assetClassRowName: string;
  managerId: string;
  managerName: string;
  benchmarkGroupId: string;
  benchmarkGroupName: string;
};

type SortDir = "asc" | "desc" | null;

type ColKey = keyof Row;

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "clientName", label: "Klant" },
  { key: "portfolioName", label: "Portefeuille" },
  { key: "wtpClassificationName", label: "WTP" },
  { key: "assetClassRowName", label: "Asset class" },
  { key: "managerName", label: "Manager" },
  { key: "benchmarkGroupName", label: "Benchmark" },
  { key: "benchmarkCode", label: "Huidige benchmark" },
  { key: "assetClass", label: "Klant AC" },
  { key: "portfolioReference", label: "Referentie" },
];

/** Human-readable labels for each asset class value. */
const ASSET_CLASS_LABELS: Record<string, string> = {
  CASH: "Cash",
  ALTERNATIVES: "Alternatives",
  EQUITIES: "Equities",
  FIXED_INCOME: "Fixed Income",
  REAL_ASSETS: "Real Assets",
  OVERLAY: "Overlay",
  MULTI_ASSETS: "Multi Assets",
  IMPACT: "Impact",
  OPBOUW: "Opbouw",
  RENDEMENT: "Rendement",
  RENTE: "Rente",
  INFLATION: "Inflation",
  MATCHING: "Matching",
  COLLATERAL: "Collateral",
  RESERVE: "Reserve",
};

function AssetClassCell({
  row,
}: {
  row: Row;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimisticAssetClass, setOptimisticAssetClass] = useState<
    string | null | undefined
  >(undefined);

  const currentAssetClass =
    optimisticAssetClass !== undefined
      ? optimisticAssetClass
      : row.assetClass;

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = e.target.value;
      if (newValue === currentAssetClass) {
        setEditing(false);
        return;
      }
      setSaving(true);
      try {
        const formData = new FormData();
        formData.set("external_reference", row.clientReference);
        formData.set("asset_class", newValue);
        await updateClientAssetClassAction(
          {} as UpdateAssetClassState,
          formData,
        );
        setOptimisticAssetClass(newValue);
      } catch {
        // swallow — server action handles its own errors
      } finally {
        setSaving(false);
        setEditing(false);
      }
    },
    [row, currentAssetClass],
  );

  if (editing) {
    return (
      <select
        className="asset-class-select"
        defaultValue={currentAssetClass ?? ""}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        autoFocus
        disabled={saving}
        aria-label="Asset class wijzigen"
      >
        <option value="" disabled>
          {saving ? "Opslaan…" : "Selecteer…"}
        </option>
        {ASSET_CLASSES.map((ac) => (
          <option key={ac} value={ac}>
            {ASSET_CLASS_LABELS[ac] ?? ac}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      className="asset-class-badge"
      onClick={() => setEditing(true)}
      title="Klik om te wijzigen"
      type="button"
    >
      {currentAssetClass ? (
        <>
          <span className="asset-class-dot" />
          {ASSET_CLASS_LABELS[currentAssetClass] ?? currentAssetClass}
        </>
      ) : (
        <span className="asset-class-empty">—</span>
      )}
    </button>
  );
}

/**
 * Generic inline-editable select cell for portfolio attribute lookup columns.
 */
function LookupSelectCell({
  row,
  column,
  valueId,
  valueName,
  options,
  label,
}: {
  row: Row;
  column: "wtp_classification_id" | "asset_class_id" | "manager_id" | "benchmark_id";
  valueId: string;
  valueName: string;
  options: { id: string; name: string }[];
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimisticId, setOptimisticId] = useState<string | undefined>(undefined);

  const currentId = optimisticId !== undefined ? optimisticId : valueId;
  const currentName = optimisticId !== undefined
    ? options.find((o) => o.id === optimisticId)?.name ?? valueName
    : valueName;

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = e.target.value;
      if (newValue === currentId) {
        setEditing(false);
        return;
      }
      setSaving(true);
      try {
        const formData = new FormData();
        formData.set("portfolio_id", row.portfolioId);
        formData.set("column", column);
        formData.set("value_id", newValue);
        await updatePortfolioAttributeAction(
          {} as UpdatePortfolioAttributeState,
          formData,
        );
        setOptimisticId(newValue);
      } catch {
        // swallow
      } finally {
        setSaving(false);
        setEditing(false);
      }
    },
    [row, column, currentId],
  );

  if (editing) {
    return (
      <select
        className="asset-class-select"
        defaultValue={currentId}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        autoFocus
        disabled={saving}
        aria-label={`${label} wijzigen`}
      >
        <option value="" disabled>
          {saving ? "Opslaan…" : "Selecteer…"}
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      className="asset-class-badge"
      onClick={() => setEditing(true)}
      title={`Klik om ${label} te wijzigen`}
      type="button"
    >
      <span className="asset-class-dot" />
      {currentName}
    </button>
  );
}

function formatCell(row: Row, key: ColKey) {
  switch (key) {
    case "clientName":
      return (
        <>
          <b>{row.clientName}</b>
          <small>{row.clientReference}</small>
        </>
      );
    case "benchmarkCode":
      return (
        <>
          <b>{row.benchmarkCode}</b>
          <small>{row.benchmarkName}</small>
        </>
      );
    case "portfolioName":
      return <>{row.portfolioName}</>;
    case "assetClass":
      return <AssetClassCell row={row} />;
    case "portfolioReference":
      return <>{row.portfolioReference}</>;
    case "wtpClassificationName":
      return <>{row.wtpClassificationName}</>;
    case "assetClassRowName":
      return <>{row.assetClassRowName}</>;
    case "managerName":
      return <>{row.managerName}</>;
    case "benchmarkGroupName":
      return <>{row.benchmarkGroupName}</>;
    default:
      return null;
  }
}

function getSortValue(row: Row, key: ColKey): string {
  switch (key) {
    case "clientName":
      return row.clientName.toLowerCase();
    case "portfolioName":
      return row.portfolioName.toLowerCase();
    case "benchmarkCode":
      return row.benchmarkCode.toLowerCase();
    case "assetClass":
      return (row.assetClass ?? "").toLowerCase();
    case "portfolioReference":
      return row.portfolioReference.toLowerCase();
    case "wtpClassificationName":
      return row.wtpClassificationName.toLowerCase();
    case "assetClassRowName":
      return row.assetClassRowName.toLowerCase();
    case "managerName":
      return row.managerName.toLowerCase();
    case "benchmarkGroupName":
      return row.benchmarkGroupName.toLowerCase();
    default:
      return "";
  }
}

function getFilterValue(row: Row, key: ColKey): string {
  switch (key) {
    case "clientName":
      return `${row.clientName} ${row.clientReference}`.toLowerCase();
    case "portfolioName":
      return row.portfolioName.toLowerCase();
    case "benchmarkCode":
      return `${row.benchmarkCode} ${row.benchmarkName}`.toLowerCase();
    case "assetClass":
      return (row.assetClass ?? "").toLowerCase();
    case "portfolioReference":
      return row.portfolioReference.toLowerCase();
    case "wtpClassificationName":
      return row.wtpClassificationName.toLowerCase();
    case "assetClassRowName":
      return row.assetClassRowName.toLowerCase();
    case "managerName":
      return row.managerName.toLowerCase();
    case "benchmarkGroupName":
      return row.benchmarkGroupName.toLowerCase();
    default:
      return "";
  }
}

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (dir === "asc") return <span className="sort-icon sort-icon--asc">▲</span>;
  if (dir === "desc") return <span className="sort-icon sort-icon--desc">▼</span>;
  return <span className="sort-icon sort-icon--none">⇅</span>;
};

export default function ClientConfigTable({
  rows,
  wtpClassifications,
  assetClassRows,
  managers,
  benchmarkGroups,
}: {
  rows: Row[];
  wtpClassifications: WtpClassification[];
  assetClassRows: AssetClassRow[];
  managers: Manager[];
  benchmarkGroups: BenchmarkGroup[];
}) {
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filters, setFilters] = useState<Partial<Record<ColKey, string>>>({});
  const [showFilters, setShowFilters] = useState(false);

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

  function setFilter(key: ColKey, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  const filtered = useMemo(() => {
    let data = [...rows];

    // apply filters
    const activeFilters = Object.entries(filters) as [ColKey, string][];
    for (const [key, val] of activeFilters) {
      const q = val.toLowerCase().trim();
      data = data.filter((row) => getFilterValue(row, key).includes(q));
    }

    // apply sort
    if (sortKey && sortDir) {
      data.sort((a, b) => {
        const va = getSortValue(a, sortKey);
        const vb = getSortValue(b, sortKey);
        const cmp = va.localeCompare(vb, "nl");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return data;
  }, [rows, filters, sortKey, sortDir]);

  const filterCount = Object.keys(filters).length;

  return (
    <>
      <div className="config-table-toolbar">
        <button
          className={`config-filter-toggle ${showFilters ? "config-filter-toggle--active" : ""}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 2.5h13M3.5 7.5h8M6 12h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Filter
          {filterCount > 0 && <span className="filter-badge">{filterCount}</span>}
        </button>
        <span className="config-table-count">{filtered.length} van {rows.length} rijen</span>
      </div>

      <section className="config-table-wrap">
        <table className="config-table">
          <caption style={{ display: "none" }}>Client configuratie met filter- en sorteerfuncties</caption>
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
                  {showFilters && (
                    <input
                      className="col-filter"
                      type="text"
                      placeholder={`Filter ${col.label.toLowerCase()}…`}
                      aria-label={`Filter op ${col.label.toLowerCase()}`}
                      value={filters[col.key] ?? ""}
                      onChange={(e) => setFilter(col.key, e.target.value)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="config-table-empty">
                  Geen resultaten gevonden voor de huidige filters.
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={`${row.clientReference}-${row.portfolioReference}-${i}`}>
                  {COLUMNS.map((col) => {
                    if (col.key === "wtpClassificationName") {
                      return (
                        <td key={col.key}>
                          <LookupSelectCell
                            row={row}
                            column="wtp_classification_id"
                            valueId={row.wtpClassificationId}
                            valueName={row.wtpClassificationName}
                            options={wtpClassifications}
                            label="WTP classificatie"
                          />
                        </td>
                      );
                    }
                    if (col.key === "assetClassRowName") {
                      return (
                        <td key={col.key}>
                          <LookupSelectCell
                            row={row}
                            column="asset_class_id"
                            valueId={row.assetClassRowId}
                            valueName={row.assetClassRowName}
                            options={assetClassRows}
                            label="asset class"
                          />
                        </td>
                      );
                    }
                    if (col.key === "managerName") {
                      return (
                        <td key={col.key}>
                          <LookupSelectCell
                            row={row}
                            column="manager_id"
                            valueId={row.managerId}
                            valueName={row.managerName}
                            options={managers}
                            label="manager"
                          />
                        </td>
                      );
                    }
                    if (col.key === "benchmarkGroupName") {
                      return (
                        <td key={col.key}>
                          <LookupSelectCell
                            row={row}
                            column="benchmark_id"
                            valueId={row.benchmarkGroupId}
                            valueName={row.benchmarkGroupName}
                            options={benchmarkGroups}
                            label="benchmark"
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={col.key}>{formatCell(row, col.key)}</td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
